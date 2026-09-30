/**
 * The ONE shared scene preview. There are no per-person previews: on the
 * participant steps we only collect photos and looks.
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
import { scenePreviewPrompt, type ScenePerson } from "../../domain/prompts";
import type { Order, Preview } from "../../domain/types";
import { getImageProvider, ImageProviderError, type ImageRef } from "../../providers/image";
import type { TemplateDef } from "../../templates";
import { ConflictError, getRepo, LimitError } from "../repo";
import { getStorage, keys } from "../storage";
import { acceptedAmountMatches, previewQuote } from "../pricing";
import { loadDraft } from "./drafts";
import { UserError } from "./errors";

export interface DemoFlags {
  failPreview?: boolean;
  failVideo?: boolean;
}

async function frame(t: TemplateDef): Promise<ImageRef> {
  const src = t.media.referenceFrame.src;
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src);
    return { bytes: Buffer.from(await res.arrayBuffer()), mime: res.headers.get("content-type") ?? "image/jpeg" };
  }
  return { bytes: await readFile(join(process.cwd(), "public", src)), mime: "image/jpeg" };
}

async function readRef(key: string): Promise<ImageRef> {
  return { bytes: await getStorage().get(key), mime: "image/jpeg" };
}

type Runner = () => Promise<void>;

export class PriceChangedError extends UserError {
  constructor(public quote: Awaited<ReturnType<typeof previewQuote>>) {
    super("price_required", "Подтвердите цену превью", 402);
  }
}

export async function requestScenePreview(
  userId: string,
  draftId: string,
  purchase: { acceptAmountMinor?: number | null; purchaseKey?: string },
  demo: DemoFlags,
): Promise<{ preview: Preview; run: Runner | null }> {
  const repo = getRepo();
  const c = getConfig();
  const { t, draft, ctx, rec } = await loadDraft(userId, draftId);

  const people: (ScenePerson & { photoKeys: string[] })[] = [];
  for (const role of t.roles) {
    const a = draft.assignments[role.id];
    const inputs = a ? ctx.people.get(a.personId) : undefined;
    if (!a || !inputs || inputs.photos.length < t.photoRequirements.minPhotos)
      throw new UserError("not_ready", "Добавьте фото всех участников");
    people.push({ role, person: inputs.person, look: a.look, photoKeys: inputs.photos.slice(0, 3).map((p) => p.storageKey) });
  }
  const fp = rec.inputsFingerprint;

  // a click while one is running: return it, charge nothing
  const pending = ctx.previewList.find((p) => p.status === "pending" && p.fingerprint === fp);
  if (pending) return { preview: pending, run: null };

  const provider = getImageProvider();
  const quote = await previewQuote(userId);
  const id = randomUUID();
  const now = new Date().toISOString();
  let order: Order | undefined;
  if (!quote.free) {
    if (!acceptedAmountMatches(quote.price, purchase.acceptAmountMinor) || !purchase.purchaseKey) throw new PriceChangedError(quote);
    order = {
      id: randomUUID(),
      userId,
      kind: "preview",
      refId: id,
      idempotencyKey: `preview:${purchase.purchaseKey}`,
      amountMinor: quote.price?.amountMinor ?? null,
      currency: quote.price?.currency ?? c.pricing.currency,
      priceIsExample: quote.price?.isExample ?? true,
      status: "test_paid",
      method: "test",
      createdAt: now,
    };
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
    if (e instanceof LimitError) throw new PriceChangedError(await previewQuote(userId));
    throw e;
  }
  if (reserved.reused) return { preview: reserved.preview, run: null };
  const preview = reserved.preview;

  const run: Runner = async () => {
    try {
      const refs = await Promise.all(people.map(async (p) => ({ role: p.role, photos: await Promise.all(p.photoKeys.map(readRef)) })));
      const out = await provider.scene({
        template: t,
        prompt: scenePreviewPrompt(t, draft.scene.optionId, people),
        referenceFrame: await frame(t),
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
  const message =
    e instanceof ImageProviderError && e.code === "safety"
      ? "Фото не прошли проверку сервиса. Попробуйте другие фото"
      : "Не получилось создать превью. Оплата возвращена — можно попробовать ещё раз";
  if (!(e instanceof ImageProviderError)) console.error("preview failed", e);
  await repo.updatePreview(preview.id, { status: "failed", error: message, finishedAt: new Date().toISOString() });
  // nothing was delivered: the free credit or the (test) payment comes back
  await repo.refundUsage(preview.id);
  await repo.refundOrderForRef(preview.id);
}

/** Show a finished variant only if it still matches the current inputs. */
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
