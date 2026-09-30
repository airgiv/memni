/**
 * Drafts: loading with reconciliation, mutations with optimistic versioning,
 * selecting and confirming previews. Confirming never triggers generation.
 */
import { randomUUID } from "node:crypto";
import { getConfig } from "../../config";
import {
  assignPerson,
  clearRole,
  DraftError,
  reconcile,
  sameDraftState,
  setLook,
  setScene,
  swapRoles,
  type PersonInputs,
} from "../../domain/draft";
import type { Draft, Job, LookSettings, Person, Photo, Preview } from "../../domain/types";
import { getTemplate, type TemplateDef } from "../../templates";
import { getImageProvider } from "../../providers/image";
import { getVideoProvider, planVideoInputs, type InputPlan } from "../../providers/video";
import { ConflictError, getRepo } from "../repo";
import { UserError } from "./errors";

export function templateOr404(id: string): TemplateDef {
  const t = getTemplate(id);
  if (!t) throw new UserError("not_found", "Шаблон не найден", 404);
  return t;
}

export async function createDraft(userId: string, templateId: string, fromDraftId?: string): Promise<Draft> {
  const t = templateOr404(templateId);
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
  // «другой мем с теми же людьми»: carry people over in role order
  if (fromDraftId) {
    const prev = await getRepo().getDraft(userId, fromDraftId);
    if (prev) {
      const prevT = getTemplate(prev.templateId);
      const people = (prevT?.roles ?? []).map((r) => prev.assignments[r.id]?.personId).filter((x): x is string => Boolean(x));
      t.roles.forEach((r, i) => {
        if (people[i]) draft.assignments[r.id] = { personId: people[i], look: { clothing: t.look.defaultClothing, glasses: t.look.glassesOption ? "as-photo" : undefined } };
      });
    }
  }
  return getRepo().createDraft(draft);
}

export interface RoleView {
  roleId: string;
  person: (Person & { photos: Photo[] }) | null;
  look: LookSettings | null;
  fingerprint: string | null;
  previews: Preview[];
  selectedPreviewId: string | null;
  confirmedPreviewId: string | null;
  photosReady: boolean;
}

export interface DraftView {
  draft: Draft;
  roles: RoleView[];
  scene: {
    fingerprint: string;
    previews: Preview[];
    selectedPreviewId: string | null;
    confirmedPreviewId: string | null;
    canGenerate: boolean;
  };
  video: {
    canStart: boolean;
    plan: InputPlan;
    provider: string;
    isDemo: boolean;
    lastJob: Job | null;
  };
  quota: { used: number; limit: number; left: number };
  /** confirmations dropped while loading (e.g. a photo was deleted in another tab) */
  cleared: { roleId?: string; scene?: boolean }[];
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
  for (const p of people) if (p) map.set(p.id, { person: p, photos: photos.filter((x) => x.personId === p.id) });
  return { people: map, previews: new Map(previews.map((p) => [p.id, p])), previewList: previews };
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

export async function draftView(userId: string, draftId: string): Promise<DraftView> {
  const c = getConfig();
  const repo = getRepo();
  const { t, draft, ctx, rec } = await loadDraft(userId, draftId);
  const roles: RoleView[] = t.roles.map((r) => {
    const a = draft.assignments[r.id];
    const p = a ? ctx.people.get(a.personId) : undefined;
    return {
      roleId: r.id,
      person: p ? { ...p.person, photos: p.photos } : null,
      look: a?.look ?? null,
      fingerprint: rec.roleFingerprints[r.id] ?? null,
      previews: ctx.previewList.filter((x) => x.kind === "person" && x.roleId === r.id),
      selectedPreviewId: a?.selectedPreviewId ?? null,
      confirmedPreviewId: a?.confirmedPreviewId ?? null,
      photosReady: Boolean(p && p.photos.length >= t.photoRequirements.minPhotos),
    };
  });
  const allConfirmed = roles.every((r) => r.confirmedPreviewId);
  const vp = getVideoProvider();
  const plan = planVideoInputs(t, vp.capabilities, vp.isDemo ? "Демо-адаптер" : vp.name);
  const lastJob = draft.lastJobId ? await repo.getJob(userId, draft.lastJobId) : null;
  const used = await repo.countUsage(userId, "preview_image");
  return {
    draft,
    roles,
    scene: {
      fingerprint: rec.sceneFingerprint,
      previews: ctx.previewList.filter((x) => x.kind === "scene"),
      selectedPreviewId: draft.sceneSelectedPreviewId ?? null,
      confirmedPreviewId: draft.sceneConfirmedPreviewId ?? null,
      canGenerate: allConfirmed,
    },
    video: {
      canStart: Boolean(draft.sceneConfirmedPreviewId) && plan.ok,
      plan,
      provider: vp.name,
      isDemo: vp.isDemo || getImageProvider().isDemo,
      lastJob,
    },
    quota: { used, limit: c.limits.freePreviewsPerUser, left: Math.max(0, c.limits.freePreviewsPerUser - used) },
    cleared: rec.cleared,
  };
}

export type DraftOp =
  | { op: "assign"; roleId: string; personId: string }
  | { op: "swap"; roleA: string; roleB: string }
  | { op: "clear"; roleId: string }
  | { op: "look"; roleId: string; look: Partial<LookSettings> }
  | { op: "scene"; optionId: string }
  | { op: "select"; roleId?: string; previewId: string }
  | { op: "confirm"; roleId?: string; previewId: string }
  | { op: "unconfirm"; roleId?: string };

/**
 * Apply one change. `expectedVersion` is the version the client last saw:
 * if the draft moved on in the meantime, the client gets 409 and reloads.
 */
export async function mutateDraft(userId: string, draftId: string, expectedVersion: number, op: DraftOp): Promise<DraftView> {
  const repo = getRepo();
  const { t, draft, ctx, rec } = await loadDraft(userId, draftId);
  if (draft.version !== expectedVersion) throw new ConflictError();
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
      case "scene":
        next = setScene(t, draft, op.optionId);
        break;
      case "select":
      case "confirm": {
        const preview = ctx.previews.get(op.previewId);
        if (!preview || preview.status !== "ready") throw new UserError("not_ready", "Этот вариант ещё не готов");
        next = structuredClone(draft);
        if (op.roleId) {
          const a = next.assignments[op.roleId];
          if (!a || preview.kind !== "person" || preview.roleId !== op.roleId || preview.personId !== a.personId)
            throw new UserError("bad_preview", "Этот вариант относится к другой роли или другому человеку");
          a.selectedPreviewId = preview.id;
          if (op.op === "confirm") {
            if (preview.fingerprint !== rec.roleFingerprints[op.roleId])
              throw new UserError("stale_preview", "Этот вариант сделан для прежних фото или настроек. Создайте новый — или верните прежние настройки");
            a.confirmedPreviewId = preview.id;
          }
        } else {
          if (preview.kind !== "scene") throw new UserError("bad_preview", "Это не превью сцены");
          next.sceneSelectedPreviewId = preview.id;
          if (op.op === "confirm") {
            if (!t.roles.every((r) => draft.assignments[r.id]?.confirmedPreviewId))
              throw new UserError("roles_unconfirmed", "Сначала подтвердите образ каждого участника");
            if (preview.fingerprint !== rec.sceneFingerprint)
              throw new UserError("stale_preview", "Это фото сцены сделано для прежнего состава или настроек — создайте новое");
            next.sceneConfirmedPreviewId = preview.id;
          }
        }
        break;
      }
      case "unconfirm":
        next = structuredClone(draft);
        if (op.roleId) {
          const a = next.assignments[op.roleId];
          if (a) a.confirmedPreviewId = undefined;
        } else next.sceneConfirmedPreviewId = undefined;
        break;
    }
  } catch (e) {
    if (e instanceof DraftError) throw new UserError(e.code, e.message);
    throw e;
  }
  // reconcile again: changes to roles/looks drop dependent confirmations right here
  const after = reconcile(t, next, await context(userId, next)).draft;
  const saved = { ...after, version: draft.version + 1, updatedAt: new Date().toISOString() };
  await repo.updateDraft(saved, draft.version);
  const view = await draftView(userId, draftId);
  // report every confirmation this change removed, so the UI can say why
  const cleared: DraftView["cleared"] = t.roles
    .filter((r) => draft.assignments[r.id]?.confirmedPreviewId && !saved.assignments[r.id]?.confirmedPreviewId)
    .map((r) => ({ roleId: r.id }));
  if (draft.sceneConfirmedPreviewId && !saved.sceneConfirmedPreviewId) cleared.push({ scene: true });
  if (op.op === "unconfirm") return view;
  return { ...view, cleared };
}

export async function listDrafts(userId: string) {
  const drafts = await getRepo().listDrafts(userId);
  return drafts.map((d) => ({
    id: d.id,
    templateId: d.templateId,
    updatedAt: d.updatedAt,
    assigned: Object.values(d.assignments).filter(Boolean).length,
    sceneConfirmed: Boolean(d.sceneConfirmedPreviewId),
    lastJobId: d.lastJobId ?? null,
  }));
}
