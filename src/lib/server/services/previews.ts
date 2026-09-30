/**
 * Preview generation. The request only reserves quota and creates a pending
 * preview; the image call runs after the response (next/server `after`), and
 * the client polls. Inputs are captured at request time, so later edits never
 * change what an in-flight call produces.
 *
 * Late answers: when a result arrives it is always kept in history, but it
 * becomes the "selected" variant only if the role's inputs still match its
 * fingerprint and nothing newer was selected meanwhile.
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getConfig } from "../../config";
import { personPreviewPrompt, scenePreviewPrompt, type ScenePerson } from "../../domain/prompts";
import type { Preview } from "../../domain/types";
import { getImageProvider, ImageProviderError, type ImageRef } from "../../providers/image";
import type { TemplateDef } from "../../templates";
import { ConflictError, getRepo, LimitError } from "../repo";
import { getStorage, keys } from "../storage";
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

export async function requestPersonPreview(
  userId: string,
  draftId: string,
  roleId: string,
  demo: DemoFlags,
): Promise<{ preview: Preview; run: Runner | null }> {
  const repo = getRepo();
  const c = getConfig();
  const { t, draft, ctx, rec } = await loadDraft(userId, draftId);
  const role = t.roles.find((r) => r.id === roleId);
  const a = draft.assignments[roleId];
  if (!role || !a) throw new UserError("no_person", "Сначала выберите человека для этой роли");
  const inputs = ctx.people.get(a.personId);
  if (!inputs || inputs.photos.length < t.photoRequirements.minPhotos)
    throw new UserError("no_photos", "Добавьте хотя бы одно фото этого человека");
  const fp = rec.roleFingerprints[roleId]!;

  // double click / second tab: an identical request is already running → reuse it
  const pending = [...ctx.previews.values()].find((p) => p.kind === "person" && p.roleId === roleId && p.status === "pending" && p.fingerprint === fp);
  if (pending) return { preview: pending, run: null };

  const provider = getImageProvider();
  const photos = [...inputs.photos].sort((x, y) => (x.id === inputs.person.mainPhotoId ? -1 : y.id === inputs.person.mainPhotoId ? 1 : 0));
  const prompt = personPreviewPrompt(t, role, inputs.person, a.look);
  const photoKeys = photos.slice(0, provider.maxReferences - 1).map((p) => p.storageKey);

  const id = randomUUID();
  const now = new Date().toISOString();
  let preview: Preview;
  try {
    preview = await repo.reservePreview(
      {
        id,
        userId,
        draftId,
        kind: "person",
        roleId,
        personId: a.personId,
        fingerprint: fp,
        draftVersion: draft.version,
        status: "pending",
        provider: provider.name,
        isDemo: provider.isDemo,
        seq: 0,
        createdAt: now,
      },
      {
        id: randomUUID(),
        userId,
        kind: "preview_image",
        provider: provider.name,
        isDemo: provider.isDemo,
        refId: id,
        estimatedCost: provider.isDemo ? 0 : c.gemini.estimatedCostUsd,
        currency: "USD",
        createdAt: now,
      },
      c.limits.freePreviewsPerUser,
    );
  } catch (e) {
    if (e instanceof LimitError) throw new UserError("preview_limit", "Бесплатные превью закончились", 429);
    throw e;
  }

  const run: Runner = async () => {
    try {
      const refs = await Promise.all(photoKeys.map(readRef));
      const out = await provider.person({ template: t, role, prompt, photos: refs, referenceFrame: await frame(t), variant: preview.seq, demo: { fail: demo.failPreview } });
      await finish(preview, out.bytes, out.mime);
    } catch (e) {
      await fail(preview, e);
    }
  };
  return { preview, run };
}

export async function requestScenePreview(userId: string, draftId: string, demo: DemoFlags): Promise<{ preview: Preview; run: Runner | null }> {
  const repo = getRepo();
  const c = getConfig();
  const { t, draft, ctx, rec } = await loadDraft(userId, draftId);
  const people: (ScenePerson & { approvedKey: string; mainKey?: string })[] = [];
  for (const role of t.roles) {
    const a = draft.assignments[role.id];
    const conf = a?.confirmedPreviewId ? ctx.previews.get(a.confirmedPreviewId) : undefined;
    const inputs = a ? ctx.people.get(a.personId) : undefined;
    if (!a || !conf?.storageKey || !inputs) throw new UserError("roles_unconfirmed", "Сначала подтвердите образ каждого участника");
    const main = inputs.photos.find((p) => p.id === inputs.person.mainPhotoId) ?? inputs.photos[0];
    people.push({ role, person: inputs.person, look: a.look, approvedKey: conf.storageKey, mainKey: main?.storageKey });
  }
  const fp = rec.sceneFingerprint;
  const pending = [...ctx.previews.values()].find((p) => p.kind === "scene" && p.status === "pending" && p.fingerprint === fp);
  if (pending) return { preview: pending, run: null };

  const provider = getImageProvider();
  const prompt = scenePreviewPrompt(t, draft.scene.optionId, people);
  const id = randomUUID();
  const now = new Date().toISOString();
  let preview: Preview;
  try {
    preview = await repo.reservePreview(
      { id, userId, draftId, kind: "scene", fingerprint: fp, draftVersion: draft.version, status: "pending", provider: provider.name, isDemo: provider.isDemo, seq: 0, createdAt: now },
      { id: randomUUID(), userId, kind: "preview_image", provider: provider.name, isDemo: provider.isDemo, refId: id, estimatedCost: provider.isDemo ? 0 : c.gemini.estimatedCostUsd, currency: "USD", createdAt: now },
      c.limits.freePreviewsPerUser,
    );
  } catch (e) {
    if (e instanceof LimitError) throw new UserError("preview_limit", "Бесплатные превью закончились", 429);
    throw e;
  }
  const run: Runner = async () => {
    try {
      const refs = await Promise.all(
        people.map(async (p) => ({ role: p.role, approved: await readRef(p.approvedKey), mainPhoto: p.mainKey ? await readRef(p.mainKey) : undefined })),
      );
      const out = await provider.scene({ template: t, prompt, referenceFrame: await frame(t), people: refs, variant: preview.seq, demo: { fail: demo.failPreview } });
      await finish(preview, out.bytes, out.mime);
    } catch (e) {
      await fail(preview, e);
    }
  };
  return { preview, run };
}

async function finish(preview: Preview, bytes: Buffer, mime: string) {
  const repo = getRepo();
  const ext = mime.includes("png") ? "png" : "jpg";
  const key = keys.preview(preview.userId, preview.id, ext);
  await getStorage().put(key, bytes, mime);
  const ready = await repo.updatePreview(preview.id, { status: "ready", storageKey: key, finishedAt: new Date().toISOString() });
  await autoSelect(ready);
}

async function fail(preview: Preview, e: unknown) {
  const repo = getRepo();
  const message =
    e instanceof ImageProviderError ? e.message : "Не удалось создать изображение. Попробуйте ещё раз — превью не списано";
  if (!(e instanceof ImageProviderError)) console.error("preview failed", e);
  await repo.updatePreview(preview.id, { status: "failed", error: message, finishedAt: new Date().toISOString() });
  // a failed preview does not use up the user's free quota (spend stays in the ledger)
  await repo.refundUsage(preview.id);
}

/** Show a finished variant only if it still matches the current inputs and is the newest. */
async function autoSelect(preview: Preview) {
  const repo = getRepo();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { draft, rec, ctx } = await loadDraft(preview.userId, preview.draftId);
    const next = structuredClone(draft);
    if (preview.kind === "person" && preview.roleId) {
      const a = next.assignments[preview.roleId];
      if (!a || rec.roleFingerprints[preview.roleId] !== preview.fingerprint) return; // stale: stays in history only
      const current = a.selectedPreviewId ? ctx.previews.get(a.selectedPreviewId) : undefined;
      if (current && current.fingerprint === preview.fingerprint && current.seq > preview.seq) return;
      a.selectedPreviewId = preview.id;
    } else {
      if (rec.sceneFingerprint !== preview.fingerprint) return;
      const current = next.sceneSelectedPreviewId ? ctx.previews.get(next.sceneSelectedPreviewId) : undefined;
      if (current && current.fingerprint === preview.fingerprint && current.seq > preview.seq) return;
      next.sceneSelectedPreviewId = preview.id;
    }
    try {
      await repo.updateDraft({ ...next, version: draft.version + 1, updatedAt: new Date().toISOString() }, draft.version);
      return;
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e;
    }
  }
}
