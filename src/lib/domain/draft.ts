/**
 * Pure draft logic: who is in which role and how they look. No I/O here.
 *
 * Each scene preview stores the fingerprint of the draft inputs it was made
 * from (people, their photos, outfits, appearance, meme and prompt version).
 * A preview is "actual" only while that fingerprint equals the current one.
 * Changing a photo or an outfit therefore invalidates the approved preview —
 * it stays in the history and becomes actual again if the inputs return.
 */
import type { MemeDef } from "../../memes/types";
import type { AppearancePrefs, Assignment, Draft, LookSettings, OutfitChoice, Person, Photo, Preview } from "./types";
import { fingerprint } from "./hash";

export class DraftError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const DESCRIPTION_MAX = 160;
const OUTFIT_TEXT_MAX = 80;

/** User text is data: one line, no markup-ish characters, bounded. */
export function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").replace(/["<>`{}]/g, "").trim().slice(0, max);
  return clean || undefined;
}

function role(t: MemeDef, roleId: string) {
  const r = t.roles.find((x) => x.id === roleId);
  if (!r) throw new DraftError("bad_role", "No such participant in this meme");
  return r;
}

export function defaultLook(t: MemeDef, roleId: string, rng: () => number = Math.random): LookSettings {
  const r = role(t, roleId);
  return { outfit: resolveOutfit(t, { optionId: r.defaultOutfit }, rng), appearance: { mode: "photos" } };
}

/** Draws a random preset once. A choice that is already resolved is kept as it is. */
function resolveOutfit(t: MemeDef, choice: OutfitChoice, rng: () => number, reroll = false): OutfitChoice {
  const def = t.outfits.find((o) => o.id === choice.optionId);
  if (!def) throw new DraftError("bad_outfit", "This outfit is not available");
  switch (def.kind) {
    case "random": {
      const pool = (def.pool ?? []).filter((id) => t.outfits.some((o) => o.id === id && o.kind === "preset"));
      if (pool.length === 0) throw new DraftError("bad_outfit", "This outfit is not available");
      const keep = !reroll && choice.resolvedPresetId && pool.includes(choice.resolvedPresetId);
      if (keep) return { optionId: def.id, resolvedPresetId: choice.resolvedPresetId };
      // a reroll never lands on the same preset twice in a row when there is a choice
      const candidates = reroll && pool.length > 1 ? pool.filter((id) => id !== choice.resolvedPresetId) : pool;
      return { optionId: def.id, resolvedPresetId: candidates[Math.floor(rng() * candidates.length) % candidates.length] };
    }
    case "custom":
      return { optionId: def.id, text: cleanText(choice.text, OUTFIT_TEXT_MAX) };
    default:
      return { optionId: def.id };
  }
}

function normalizeAppearance(a: Partial<AppearancePrefs> | undefined): AppearancePrefs {
  if (a?.mode !== "adjusted") return { mode: "photos" };
  const presentation = a.presentation === "feminine" || a.presentation === "masculine" || a.presentation === "neutral" ? a.presentation : undefined;
  return { mode: "adjusted", presentation, description: cleanText(a.description, DESCRIPTION_MAX) };
}

/** Older drafts stored {clothing, presetId}. */
type LegacyLook = { clothing?: "template" | "photo" | "preset"; presetId?: string };

/**
 * Validates a look against the meme and this participant's allowed outfits.
 * Missing parts fall back to defaults; a random outfit is resolved here and
 * then stays resolved until the user explicitly asks for another one.
 */
export function normalizeLook(
  t: MemeDef,
  roleId: string,
  look: (Partial<LookSettings> & LegacyLook) | undefined,
  opts: { rng?: () => number; reroll?: boolean } = {},
): LookSettings {
  const r = role(t, roleId);
  const rng = opts.rng ?? Math.random;
  let choice: OutfitChoice | undefined = look?.outfit;
  if (!choice && look?.clothing) {
    choice = { optionId: look.clothing === "template" ? "original" : look.clothing === "photo" ? "photos" : (look.presetId ?? r.defaultOutfit) };
  }
  if (!choice || !r.outfits.includes(choice.optionId)) choice = { optionId: r.defaultOutfit };
  return { outfit: resolveOutfit(t, choice, rng, opts.reroll), appearance: normalizeAppearance(look?.appearance) };
}

export interface PersonInputs {
  person: Person;
  photos: Photo[];
}

/** Everything that changes how one person looks in one role. */
export function personFingerprint(t: MemeDef, roleId: string, a: Assignment, p: PersonInputs): string {
  return fingerprint({
    meme: t.id,
    memeVersion: t.version,
    prompt: t.generation.promptVersion,
    roleId,
    personId: p.person.id,
    photos: p.photos.slice(0, t.photos.maxPhotos).map((x) => x.id).sort(),
    look: normalizeLook(t, roleId, a.look),
  });
}

/** Everything the scene preview and the video depend on. */
export function inputsFingerprint(t: MemeDef, roleFps: Record<string, string | null>): string {
  return fingerprint({
    meme: t.id,
    memeVersion: t.version,
    prompt: t.generation.promptVersion,
    roles: t.roles.map((r) => ({ roleId: r.id, fp: roleFps[r.id] ?? null })),
  });
}

/* ── mutations: each returns a new draft; the caller bumps the version ─ */

export function assignPerson(t: MemeDef, draft: Draft, roleId: string, personId: string, rng: () => number = Math.random): Draft {
  role(t, roleId);
  const next = structuredClone(draft);
  const current = next.assignments[roleId];
  if (current?.personId === personId) return next;
  // the person is already in another role → swap the two roles rather than cloning them
  const otherRole = Object.keys(next.assignments).find((r) => r !== roleId && next.assignments[r]?.personId === personId);
  if (otherRole) return swapRoles(t, next, roleId, otherRole);
  next.assignments[roleId] = { personId, look: current?.look ? normalizeLook(t, roleId, current.look, { rng }) : defaultLook(t, roleId, rng) };
  return next;
}

export function swapRoles(t: MemeDef, draft: Draft, roleA: string, roleB: string): Draft {
  if (roleA === roleB) return structuredClone(draft);
  role(t, roleA);
  role(t, roleB);
  const next = structuredClone(draft);
  const a = next.assignments[roleA];
  const b = next.assignments[roleB];
  // the look travels with the person, re-checked against the new role's outfit options
  next.assignments[roleA] = b ? { personId: b.personId, look: normalizeLook(t, roleA, b.look) } : undefined;
  next.assignments[roleB] = a ? { personId: a.personId, look: normalizeLook(t, roleB, a.look) } : undefined;
  return next;
}

export function clearRole(draft: Draft, roleId: string): Draft {
  const next = structuredClone(draft);
  next.assignments[roleId] = undefined;
  return next;
}

export function setLook(
  t: MemeDef,
  draft: Draft,
  roleId: string,
  patch: { outfit?: OutfitChoice; appearance?: Partial<AppearancePrefs>; reroll?: boolean },
  rng: () => number = Math.random,
): Draft {
  const next = structuredClone(draft);
  const a = next.assignments[roleId];
  if (!a) throw new DraftError("no_person", "Add a photo first");
  const current = normalizeLook(t, roleId, a.look, { rng });
  const outfit = patch.outfit
    ? // switching away and back to random draws again; staying on it keeps the stored draw
      patch.outfit.optionId === current.outfit.optionId
      ? { ...current.outfit, ...patch.outfit, resolvedPresetId: current.outfit.resolvedPresetId }
      : { optionId: patch.outfit.optionId, text: patch.outfit.text }
    : current.outfit;
  a.look = normalizeLook(
    t,
    roleId,
    { outfit, appearance: patch.appearance ? { ...current.appearance, ...patch.appearance } : current.appearance },
    { rng, reroll: patch.reroll },
  );
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

/** Frees roles of deleted people, migrates old looks and drops a selection that no longer exists. Idempotent. */
export function reconcile(t: MemeDef, draft: Draft, ctx: ReconcileContext): ReconcileResult {
  const next = structuredClone(draft);
  const cleared: string[] = [];
  const roleFps: Record<string, string | null> = {};
  for (const r of t.roles) {
    const a = next.assignments[r.id];
    const p = a ? ctx.people.get(a.personId) : undefined;
    if (a && !p) {
      next.assignments[r.id] = undefined;
      cleared.push(r.id);
    } else if (a) {
      // deterministic for an already-resolved look; only legacy/unresolved looks get a draw
      a.look = normalizeLook(t, r.id, a.look);
    }
    roleFps[r.id] = a && p ? personFingerprint(t, r.id, a, p) : null;
  }
  if (next.sceneSelectedPreviewId && !ctx.previews.has(next.sceneSelectedPreviewId)) next.sceneSelectedPreviewId = undefined;
  return { draft: next, roleFingerprints: roleFps, inputsFingerprint: inputsFingerprint(t, roleFps), cleared };
}

/** Every role has a person with at least the minimum number of photos. */
export function rolesReady(t: MemeDef, draft: Draft, people: Map<string, PersonInputs>): boolean {
  return t.roles.every((r) => {
    const a = draft.assignments[r.id];
    const p = a ? people.get(a.personId) : undefined;
    return Boolean(p && p.photos.length >= t.photos.minPhotos);
  });
}

export function sameDraftState(a: Draft, b: Draft): boolean {
  return fingerprint({ as: a.assignments, s: a.scene, ss: a.sceneSelectedPreviewId }) === fingerprint({ as: b.assignments, s: b.scene, ss: b.sceneSelectedPreviewId });
}
