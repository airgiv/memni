/**
 * Pure draft logic: who is in which role and how they look. No I/O here.
 *
 * Each scene preview stores the fingerprint of the draft inputs it was made
 * from (people, their photos, looks, template and prompt version). A preview
 * is "actual" only while that fingerprint equals the current one. Changing a
 * photo or a look therefore makes old previews non-actual — they stay in the
 * history and become actual again if the inputs return to that state.
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
  return { clothing: t.look.defaultClothing, presetId: t.look.defaultClothing === "preset" ? t.look.presets[0]?.id : undefined };
}

export function normalizeLook(t: TemplateDef, look: Partial<LookSettings> | undefined): LookSettings {
  const base = defaultLook(t);
  const clothing = look?.clothing && t.look.clothingModes.includes(look.clothing) ? look.clothing : base.clothing;
  let presetId: string | undefined;
  if (clothing === "preset") {
    presetId = t.look.presets.find((p) => p.id === look?.presetId)?.id ?? t.look.presets[0]?.id;
    if (!presetId) throw new DraftError("bad_look", "У этого мема нет других образов");
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

/** Everything the scene preview and the video depend on. */
export function inputsFingerprint(t: TemplateDef, draft: Draft, roleFps: Record<string, string | null>): string {
  return fingerprint({
    template: t.id,
    templateVersion: t.version,
    prompt: t.pipeline.promptVersion,
    option: draft.scene.optionId,
    roles: t.roles.map((r) => ({ roleId: r.id, fp: roleFps[r.id] ?? null })),
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
  next.assignments[roleA] = next.assignments[roleB];
  next.assignments[roleB] = a;
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
  if (!a) throw new DraftError("no_person", "Сначала добавьте фото");
  a.look = normalizeLook(t, look);
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
  inputsFingerprint: string;
  /** roles freed because their person was deleted */
  cleared: string[];
}

/** Frees roles of deleted people and drops a selection that no longer exists. Idempotent. */
export function reconcile(t: TemplateDef, draft: Draft, ctx: ReconcileContext): ReconcileResult {
  const next = structuredClone(draft);
  const cleared: string[] = [];
  const roleFps: Record<string, string | null> = {};
  for (const role of t.roles) {
    const a = next.assignments[role.id];
    const p = a ? ctx.people.get(a.personId) : undefined;
    if (a && !p) {
      next.assignments[role.id] = undefined;
      cleared.push(role.id);
    }
    roleFps[role.id] = a && p ? personFingerprint(t, role.id, a, p) : null;
  }
  if (next.sceneSelectedPreviewId && !ctx.previews.has(next.sceneSelectedPreviewId)) next.sceneSelectedPreviewId = undefined;
  return { draft: next, roleFingerprints: roleFps, inputsFingerprint: inputsFingerprint(t, next, roleFps), cleared };
}

/** Every role has a person with at least the minimum number of photos. */
export function rolesReady(t: TemplateDef, draft: Draft, people: Map<string, PersonInputs>): boolean {
  return t.roles.every((r) => {
    const a = draft.assignments[r.id];
    const p = a ? people.get(a.personId) : undefined;
    return Boolean(p && p.photos.length >= t.photoRequirements.minPhotos);
  });
}

export function sameDraftState(a: Draft, b: Draft): boolean {
  return fingerprint({ as: a.assignments, s: a.scene, ss: a.sceneSelectedPreviewId }) === fingerprint({ as: b.assignments, s: b.scene, ss: b.sceneSelectedPreviewId });
}
