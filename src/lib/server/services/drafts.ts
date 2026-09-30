/**
 * Drafts: loading with reconciliation, mutations with optimistic versioning,
 * and the view the constructor renders (people, looks, previews, quotes).
 */
import { randomUUID } from "node:crypto";
import { assignPerson, clearRole, defaultLook, DraftError, reconcile, rolesReady, sameDraftState, setLook, swapRoles, type PersonInputs } from "../../domain/draft";
import type { Draft, Job, LookSettings, Person, Photo, Preview } from "../../domain/types";
import { getTemplate, type TemplateDef } from "../../templates";
import { getImageProvider } from "../../providers/image";
import { getVideoProvider, planVideoInputs, type InputPlan } from "../../providers/video";
import { ConflictError, getRepo } from "../repo";
import { previewQuote, videoPrice, type Quote } from "../pricing";
import { UserError } from "./errors";

export function templateOr404(id: string): TemplateDef {
  const t = getTemplate(id);
  if (!t) throw new UserError("not_found", "Мем не найден", 404);
  return t;
}

/**
 * Opens the user's unfinished draft of this meme, or starts a new one. With
 * `fromDraftId` («сделать ещё с теми же людьми») people are carried over in role order.
 */
export async function openDraft(userId: string, templateId: string, fromDraftId?: string): Promise<Draft> {
  const t = templateOr404(templateId);
  const repo = getRepo();
  if (!fromDraftId) {
    const open = (await repo.listDrafts(userId)).find((d) => d.templateId === t.id && d.templateVersion === t.version && !d.lastJobId);
    if (open) return open;
  }
  const now = new Date().toISOString();
  const draft: Draft = {
    id: randomUUID(),
    userId,
    templateId: t.id,
    templateVersion: t.version,
    version: 1,
    assignments: {},
    scene: { optionId: t.scene.defaultOption },
    createdAt: now,
    updatedAt: now,
  };
  if (fromDraftId) {
    const prev = await repo.getDraft(userId, fromDraftId);
    const prevT = prev ? getTemplate(prev.templateId) : undefined;
    const people = (prevT?.roles ?? []).map((r) => prev!.assignments[r.id]?.personId).filter((x): x is string => Boolean(x));
    t.roles.forEach((r, i) => {
      if (people[i]) draft.assignments[r.id] = { personId: people[i], look: defaultLook(t) };
    });
  }
  return repo.createDraft(draft);
}

async function context(userId: string, draft: Draft) {
  const repo = getRepo();
  const personIds = [...new Set(Object.values(draft.assignments).flatMap((a) => (a ? [a.personId] : [])))];
  const [people, photos, previews] = await Promise.all([
    Promise.all(personIds.map((id) => repo.getPerson(userId, id))),
    repo.listPhotos(userId, personIds),
    repo.listPreviews(userId, draft.id),
  ]);
  const map = new Map<string, PersonInputs>();
  for (const p of people) if (p) map.set(p.id, { person: p, photos: sortPhotos(p, photos.filter((x) => x.personId === p.id)) });
  return { people: map, previews: new Map(previews.map((p) => [p.id, p])), previewList: previews.filter((p) => p.kind === "scene") };
}

/** main photo first */
function sortPhotos(p: Person, photos: Photo[]) {
  return [...photos].sort((a, b) => (a.id === p.mainPhotoId ? -1 : b.id === p.mainPhotoId ? 1 : a.createdAt.localeCompare(b.createdAt)));
}

/** Load + reconcile + persist if reconciliation changed anything. */
export async function loadDraft(userId: string, draftId: string) {
  const repo = getRepo();
  for (let attempt = 0; attempt < 3; attempt++) {
    const draft = await repo.getDraft(userId, draftId);
    if (!draft) throw new UserError("not_found", "Черновик не найден", 404);
    const t = templateOr404(draft.templateId);
    const ctx = await context(userId, draft);
    const rec = reconcile(t, draft, ctx);
    if (!sameDraftState(draft, rec.draft)) {
      const next = { ...rec.draft, version: draft.version + 1, updatedAt: new Date().toISOString() };
      try {
        await repo.updateDraft(next, draft.version);
        return { t, draft: next, ctx, rec: { ...rec, draft: next } };
      } catch (e) {
        if (e instanceof ConflictError) continue;
        throw e;
      }
    }
    return { t, draft, ctx, rec };
  }
  throw new ConflictError();
}

export interface DraftView {
  draft: Draft;
  roles: { roleId: string; person: (Person & { photos: Photo[] }) | null; look: LookSettings | null; ready: boolean }[];
  ready: boolean;
  inputsFingerprint: string;
  previews: Preview[];
  selectedPreviewId: string | null;
  quotes: { preview: Quote; video: Quote };
  video: { preview: InputPlan; direct: InputPlan; isDemo: boolean; lastJob: Job | null };
}

export async function draftView(userId: string, draftId: string): Promise<DraftView> {
  const repo = getRepo();
  const { t, draft, ctx, rec } = await loadDraft(userId, draftId);
  const vp = getVideoProvider();
  const lastJob = draft.lastJobId ? await repo.getJob(userId, draft.lastJobId) : null;
  return {
    draft,
    roles: t.roles.map((r) => {
      const a = draft.assignments[r.id];
      const p = a ? ctx.people.get(a.personId) : undefined;
      return {
        roleId: r.id,
        person: p ? { ...p.person, photos: p.photos } : null,
        look: a?.look ?? null,
        ready: Boolean(p && p.photos.length >= t.photoRequirements.minPhotos),
      };
    }),
    ready: rolesReady(t, draft, ctx.people),
    inputsFingerprint: rec.inputsFingerprint,
    previews: ctx.previewList,
    selectedPreviewId: draft.sceneSelectedPreviewId ?? null,
    quotes: { preview: await previewQuote(userId), video: { free: false, price: videoPrice(t) } },
    video: {
      preview: planVideoInputs(t, vp.capabilities, "preview"),
      direct: planVideoInputs(t, vp.capabilities, "direct"),
      isDemo: vp.isDemo || getImageProvider().isDemo,
      lastJob,
    },
  };
}

export type DraftOp =
  | { op: "assign"; roleId: string; personId: string }
  | { op: "swap"; roleA: string; roleB: string }
  | { op: "clear"; roleId: string }
  | { op: "look"; roleId: string; look: Partial<LookSettings> }
  | { op: "select"; previewId: string };

/**
 * Apply one change. `expectedVersion` is the version the client last saw:
 * if the draft moved on in the meantime, the client gets 409 and reloads.
 * Selecting an existing preview is free and never generates anything.
 */
export async function mutateDraft(userId: string, draftId: string, expectedVersion: number, op: DraftOp): Promise<DraftView> {
  const repo = getRepo();
  const { t, draft, ctx } = await loadDraft(userId, draftId);
  // picking a variant is harmless to repeat, so a newer version (e.g. a preview just finished) does not block it
  if (draft.version !== expectedVersion && op.op !== "select") throw new ConflictError();
  let next: Draft;
  try {
    switch (op.op) {
      case "assign": {
        const person = await repo.getPerson(userId, op.personId);
        if (!person) throw new UserError("not_found", "Человек не найден", 404);
        next = assignPerson(t, draft, op.roleId, op.personId);
        break;
      }
      case "swap":
        next = swapRoles(t, draft, op.roleA, op.roleB);
        break;
      case "clear":
        next = clearRole(draft, op.roleId);
        break;
      case "look":
        next = setLook(t, draft, op.roleId, op.look);
        break;
      case "select": {
        const preview = ctx.previews.get(op.previewId);
        if (!preview || preview.kind !== "scene" || preview.status !== "ready") throw new UserError("not_ready", "Этот вариант ещё не готов");
        next = { ...structuredClone(draft), sceneSelectedPreviewId: preview.id };
        break;
      }
    }
  } catch (e) {
    if (e instanceof DraftError) throw new UserError(e.code, e.message);
    throw e;
  }
  await repo.updateDraft({ ...next, version: draft.version + 1, updatedAt: new Date().toISOString() }, draft.version);
  return draftView(userId, draftId);
}

export async function listDrafts(userId: string) {
  const drafts = await getRepo().listDrafts(userId);
  return drafts.map((d) => ({
    id: d.id,
    templateId: d.templateId,
    updatedAt: d.updatedAt,
    assigned: Object.values(d.assignments).filter(Boolean).length,
    lastJobId: d.lastJobId ?? null,
  }));
}
