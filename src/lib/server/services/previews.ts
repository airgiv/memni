/**
 * The ONE shared preview image with every participant. There are no
 * per-person previews: the participant steps only collect photos and looks.
 *
 * Money rules (see lib/server/pricing.ts):
 *  - the first N previews per user are free (FREE_PREVIEWS_PER_USER, default 1);
 *    going back, reloading or editing the draft never grants a new free one;
 *  - every other preview is a purchase the user confirmed at the quoted price;
 *  - a double click reuses the running request or the same purchase key;
 *  - a technical failure gives the free credit or the payment back.
 * The image call runs after the response (next/server `after`); inputs are
 * captured at request time, so later edits never change an in-flight call.
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getConfig } from "../../config";
import { buildSpec, renderScenePrompt, type SpecPerson } from "../../domain/prompts";
import type { Order, Preview } from "../../domain/types";
import type { BillingContext } from "../../commerce/billing";
import { getImageProvider, ImageProviderError, type ImageRef } from "../../providers/image";
import { getVideoProvider, replacementScope } from "../../providers/video";
import type { MemeDef } from "../../../memes";
import { ConflictError, getRepo, LimitError } from "../repo";
import { getStorage, keys } from "../storage";
import { acceptedPriceMatches, chargeOrder, previewQuote, refundFor, type Quote } from "../pricing";
import { loadDraft } from "./drafts";
import { UserError } from "./errors";

export interface DemoFlags {
  failPreview?: boolean;
  failVideo?: boolean;
}

export async function referenceFrame(t: MemeDef): Promise<ImageRef> {
  const src = t.media.referenceFrame.src;
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src);
    return { bytes: Buffer.from(await res.arrayBuffer()), mime: res.headers.get("content-type") ?? "image/jpeg" };
  }
  return { bytes: await readFile(join(process.cwd(), "public", src)), mime: "image/jpeg" };
}

export async function readRef(key: string): Promise<ImageRef> {
  return { bytes: await getStorage().get(key), mime: "image/jpeg" };
}

/** Every participant with their look and up to maxPhotos references, or a "not ready" error. */
export function collectParticipants(t: MemeDef, loaded: Awaited<ReturnType<typeof loadDraft>>) {
  const { draft, ctx } = loaded;
  const people: (SpecPerson & { personId: string; photoKeys: string[] })[] = [];
  for (const role of t.roles) {
    const a = draft.assignments[role.id];
    const inputs = a ? ctx.people.get(a.personId) : undefined;
    if (!a || !inputs || inputs.photos.length < t.photos.minPhotos) throw new UserError("not_ready", "Add a photo for every participant");
    const photos = inputs.photos.slice(0, t.photos.maxPhotos);
    people.push({ role, look: a.look, photos, personId: a.personId, photoKeys: photos.map((p) => p.storageKey) });
  }
  return people;
}

type Runner = () => Promise<void>;

export class PriceChangedError extends UserError {
  constructor(public quote: Quote) {
    super("price_required", "Confirm the preview price", 402);
  }
}

export async function requestScenePreview(
  userId: string,
  draftId: string,
  purchase: { acceptAmountMinor?: number | null; acceptCurrency?: string | null; purchaseKey?: string },
  billing: BillingContext,
  demo: DemoFlags,
): Promise<{ preview: Preview; run: Runner | null }> {
  const repo = getRepo();
  const c = getConfig();
  const loaded = await loadDraft(userId, draftId);
  const { t, draft, ctx, rec } = loaded;
  const people = collectParticipants(t, loaded);
  const fp = rec.inputsFingerprint;

  // a click while one is running: return it, charge nothing
  const pending = ctx.previewList.find((p) => p.status === "pending" && p.fingerprint === fp);
  if (pending) return { preview: pending, run: null };

  const provider = getImageProvider();
  const spec = buildSpec(t, people, replacementScope(getVideoProvider().capabilities, provider));
  const quote = await previewQuote(userId, billing);
  const id = randomUUID();
  const now = new Date().toISOString();
  let order: Order | undefined;
  if (!quote.free) {
    if (!acceptedPriceMatches(quote.price, { amountMinor: purchase.acceptAmountMinor, currency: purchase.acceptCurrency }) || !purchase.purchaseKey)
      throw new PriceChangedError(quote);
    order = await chargeOrder({ userId, kind: "preview", refId: id, idempotencyKey: `preview:${purchase.purchaseKey}`, price: quote.price, billing });
  }

  let reserved: { preview: Preview; reused: boolean };
  try {
    reserved = await repo.reservePreview(
      { id, userId, draftId, kind: "scene", fingerprint: fp, draftVersion: draft.version, status: "pending", provider: provider.name, isDemo: provider.isDemo, seq: 0, paid: !quote.free, createdAt: now },
      {
        id: randomUUID(),
        userId,
        kind: "preview_image",
        provider: provider.name,
        isDemo: provider.isDemo,
        refId: id,
        free: quote.free,
        estimatedCost: provider.isDemo ? 0 : c.gemini.estimatedCostUsd,
        currency: "USD",
        createdAt: now,
      },
      quote.free ? { freeLimit: c.limits.freePreviewsPerUser } : { order },
    );
  } catch (e) {
    // the free offer was used up by a parallel request → ask for the price
    if (e instanceof LimitError) throw new PriceChangedError(await previewQuote(userId, billing));
    throw e;
  }
  if (reserved.reused) return { preview: reserved.preview, run: null };
  const preview = reserved.preview;

  const run: Runner = async () => {
    try {
      const refs = await Promise.all(people.map(async (p) => ({ role: p.role, photos: await Promise.all(p.photoKeys.map(readRef)) })));
      const out = await provider.scene({
        meme: t,
        prompt: renderScenePrompt(t, spec),
        referenceFrame: await referenceFrame(t),
        people: refs,
        variant: preview.seq,
        demo: { fail: demo.failPreview },
      });
      await finish(preview, out.bytes, out.mime);
    } catch (e) {
      await fail(preview, e);
    }
  };
  return { preview, run };
}

async function finish(preview: Preview, bytes: Buffer, mime: string) {
  const repo = getRepo();
  const key = keys.preview(preview.userId, preview.id, mime.includes("png") ? "png" : "jpg");
  await getStorage().put(key, bytes, mime);
  const ready = await repo.updatePreview(preview.id, { status: "ready", storageKey: key, finishedAt: new Date().toISOString() });
  await autoSelect(ready);
}

async function fail(preview: Preview, e: unknown) {
  const repo = getRepo();
  // stored as a code; the browser shows a localized message
  const code = e instanceof ImageProviderError && e.code === "safety" ? "preview_rejected" : "preview_failed";
  if (!(e instanceof ImageProviderError)) console.error("preview failed", e);
  await repo.updatePreview(preview.id, { status: "failed", error: code, finishedAt: new Date().toISOString() });
  // nothing was delivered: the free credit or the payment comes back
  await repo.refundUsage(preview.id);
  await refundFor(preview.id);
}

/** Show a finished version only if it still matches the current inputs. */
async function autoSelect(preview: Preview) {
  const repo = getRepo();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { draft, rec } = await loadDraft(preview.userId, preview.draftId);
    if (rec.inputsFingerprint !== preview.fingerprint) return; // late answer for old inputs: history only
    try {
      await repo.updateDraft({ ...draft, sceneSelectedPreviewId: preview.id, version: draft.version + 1, updatedAt: new Date().toISOString() }, draft.version);
      return;
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e;
    }
  }
}
