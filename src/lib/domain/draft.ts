/**
 * Pure draft logic: who is in which role, what their look is, which previews
 * are still valid. No I/O here, so it is easy to test and reuse in the worker.
 *
 * The central idea: every preview stores the fingerprint of the inputs it was
 * made from. A confirmation counts only while that fingerprint still equals
 * the fingerprint of the current inputs. Any change to photos, roles or
 * appearance-affecting settings therefore removes the confirmation, while the
 * old preview stays in history (and becomes valid again if the inputs return).
 */
import type { TemplateDef } from "../templates/types";
import type { Assignment, Draft, LookSettings, Person, Photo, Preview } from "./types";
import { fingerprint } from "./hash";

export class DraftError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function defaultLook(t: TemplateDef): LookSettings {
  return { clothing: t.look.defaultClothing, glasses: t.look.glassesOption ? "as-photo" : undefined };
}

export function normalizeLook(t: TemplateDef, look: Partial<LookSettings> | undefined): LookSettings {
  const base = defaultLook(t);
  const clothing = look?.clothing && t.look.clothingModes.includes(look.clothing) ? look.clothing : base.clothing;
  let presetId: string | undefined;
  if (clothing === "preset") {
    presetId = t.look.presets.find((p) => p.id === look?.presetId)?.id ?? t.look.presets[0]?.id;
    if (!presetId) throw new DraftError("bad_look", "У шаблона нет готовых вариантов одежды");
  }
  const glasses = t.look.glassesOption ? (look?.glasses === "remove" ? "remove" : "as-photo") : undefined;
  return { clothing, presetId, glasses };
}

export interface PersonInputs {
  person: Person;
  photos: Photo[];
}

/** Everything that changes how one person looks in one role. */
export function personFingerprint(t: TemplateDef, roleId: string, a: Assignment, p: PersonInputs): string {
  return fingerprint({
    kind: "person",
    template: t.id,
    templateVersion: t.version,
    prompt: t.pipeline.promptVersion,
    roleId,
    personId: p.person.id,
    photos: p.photos.map((x) => x.id).sort(),
    main: p.person.mainPhotoId ?? null,
    note: p.person.appearanceNote?.trim() || null,
    look: a.look,
  });
}

export function sceneFingerprint(t: TemplateDef, draft: Draft, roleFps: Record<string, string | null>): string {
  return fingerprint({
    kind: "scene",
    template: t.id,
    templateVersion: t.version,
    prompt: t.pipeline.promptVersion,
    option: draft.scene.optionId,
    roles: t.roles.map((r) => ({
      roleId: r.id,
      fp: roleFps[r.id] ?? null,
      confirmed: draft.assignments[r.id]?.confirmedPreviewId ?? null,
    })),
  });
}

/* ── mutations: each returns a new draft; the caller bumps the version ─ */

export function assignPerson(t: TemplateDef, draft: Draft, roleId: string, personId: string): Draft {
  if (!t.roles.some((r) => r.id === roleId)) throw new DraftError("bad_role", "Такой роли нет в шаблоне");
  const next = structuredClone(draft);
  const current = next.assignments[roleId];
  if (current?.personId === personId) return next;
  // The person is already in another role → swap the two roles rather than cloning them.
  const otherRole = Object.keys(next.assignments).find((r) => r !== roleId && next.assignments[r]?.personId === personId);
  if (otherRole) return swapRoles(t, next, roleId, otherRole);
  next.assignments[roleId] = { personId, look: current?.look ?? defaultLook(t) };
  return next;
}

export function swapRoles(t: TemplateDef, draft: Draft, roleA: string, roleB: string): Draft {
  if (roleA === roleB) return structuredClone(draft);
  for (const r of [roleA, roleB])
    if (!t.roles.some((x) => x.id === r)) throw new DraftError("bad_role", "Такой роли нет в шаблоне");
  const next = structuredClone(draft);
  const a = next.assignments[roleA];
  const b = next.assignments[roleB];
  // The look travels with the person; role-specific previews/confirmations do not.
  next.assignments[roleA] = b ? { personId: b.personId, look: b.look } : undefined;
  next.assignments[roleB] = a ? { personId: a.personId, look: a.look } : undefined;
  return next;
}

export function clearRole(draft: Draft, roleId: string): Draft {
  const next = structuredClone(draft);
  next.assignments[roleId] = undefined;
  return next;
}

export function setLook(t: TemplateDef, draft: Draft, roleId: string, look: Partial<LookSettings>): Draft {
  const next = structuredClone(draft);
  const a = next.assignments[roleId];
  if (!a) throw new DraftError("no_person", "Сначала выберите человека для этой роли");
  a.look = normalizeLook(t, { ...a.look, ...look });
  return next;
}

export function setScene(t: TemplateDef, draft: Draft, optionId: string): Draft {
  if (!t.scene.options.some((o) => o.id === optionId)) throw new DraftError("bad_scene", "Такой настройки сцены нет");
  const next = structuredClone(draft);
  next.scene = { optionId };
  return next;
}

/* ── reconciliation ─────────────────────────────────────────────────── */

export interface ReconcileContext {
  people: Map<string, PersonInputs>;
  previews: Map<string, Preview>;
}

export interface ReconcileResult {
  draft: Draft;
  roleFingerprints: Record<string, string | null>;
  sceneFingerprint: string;
  /** confirmations removed by this pass — the UI explains why */
  cleared: { roleId?: string; scene?: boolean }[];
}

/**
 * Drops confirmations whose preview no longer matches the inputs, and
 * selections that point at previews of someone else. Idempotent.
 */
export function reconcile(t: TemplateDef, draft: Draft, ctx: ReconcileContext): ReconcileResult {
  const next = structuredClone(draft);
  const cleared: ReconcileResult["cleared"] = [];
  const roleFps: Record<string, string | null> = {};

  for (const role of t.roles) {
    const a = next.assignments[role.id];
    if (!a) {
      roleFps[role.id] = null;
      continue;
    }
    const p = ctx.people.get(a.personId);
    if (!p) {
      // person deleted
      next.assignments[role.id] = undefined;
      roleFps[role.id] = null;
      cleared.push({ roleId: role.id });
      continue;
    }
    const fp = personFingerprint(t, role.id, a, p);
    roleFps[role.id] = fp;
    if (a.selectedPreviewId) {
      const sel = ctx.previews.get(a.selectedPreviewId);
      if (!sel || sel.roleId !== role.id || sel.personId !== a.personId) a.selectedPreviewId = undefined;
    }
    if (a.confirmedPreviewId) {
      const conf = ctx.previews.get(a.confirmedPreviewId);
      if (!conf || conf.status !== "ready" || conf.fingerprint !== fp) {
        a.confirmedPreviewId = undefined;
        cleared.push({ roleId: role.id });
      }
    }
  }

  const sceneFp = sceneFingerprint(t, next, roleFps);
  const allConfirmed = t.roles.every((r) => next.assignments[r.id]?.confirmedPreviewId);
  if (next.sceneConfirmedPreviewId) {
    const conf = ctx.previews.get(next.sceneConfirmedPreviewId);
    if (!allConfirmed || !conf || conf.status !== "ready" || conf.fingerprint !== sceneFp) {
      next.sceneConfirmedPreviewId = undefined;
      cleared.push({ scene: true });
    }
  }
  return { draft: next, roleFingerprints: roleFps, sceneFingerprint: sceneFp, cleared };
}

export function sameDraftState(a: Draft, b: Draft): boolean {
  return (
    fingerprint({ as: a.assignments, s: a.scene, ss: a.sceneSelectedPreviewId, sc: a.sceneConfirmedPreviewId }) ===
    fingerprint({ as: b.assignments, s: b.scene, ss: b.sceneSelectedPreviewId, sc: b.sceneConfirmedPreviewId })
  );
}
