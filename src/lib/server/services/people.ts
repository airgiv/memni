/**
 * People and their source photos. Photos belong to the person (reused across
 * orders); how the person looks in a given order lives on the draft.
 */
import { randomUUID } from "node:crypto";
import sharp, { type Metadata } from "sharp";
import { getConfig } from "../../config";
import type { Person, Photo } from "../../domain/types";
import { assignPerson } from "../../domain/draft";
import { ConflictError } from "../repo";
import { loadDraft } from "./drafts";
import { cleanText } from "../../domain/draft";
import { getPhotoAnalyzer } from "../../providers/analysis";
import { getRepo } from "../repo";
import { getStorage, keys } from "../storage";
import { UserError } from "./errors";

export const MAX_PHOTOS_PER_PERSON = 8;
const MIN_SIDE = 512;
const MAX_STORED_SIDE = 2048;
const FORMATS: Record<string, string> = { jpeg: "JPEG", png: "PNG", webp: "WebP" };

export interface PhotoCheck {
  photo: Photo;
}

export async function createPerson(userId: string, name: string, saved: boolean): Promise<Person> {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 40);
  if (!clean) throw new UserError("bad_name", "Give this person a name");
  const now = new Date().toISOString();
  return getRepo().savePerson({ id: randomUUID(), userId, name: clean, saved, createdAt: now, updatedAt: now });
}

export async function updatePerson(
  userId: string,
  id: string,
  patch: { name?: string; saved?: boolean; mainPhotoId?: string; appearanceNote?: string | null },
): Promise<Person> {
  const repo = getRepo();
  const p = await repo.getPerson(userId, id);
  if (!p) throw new UserError("not_found", "Person not found", 404);
  const next: Person = { ...p, updatedAt: new Date().toISOString() };
  if (patch.name !== undefined) {
    const clean = patch.name.replace(/\s+/g, " ").trim().slice(0, 40);
    if (!clean) throw new UserError("bad_name", "The name cannot be empty");
    next.name = clean;
  }
  if (patch.saved !== undefined) next.saved = patch.saved;
  if (patch.mainPhotoId !== undefined) {
    const photo = await repo.getPhoto(userId, patch.mainPhotoId);
    if (!photo || photo.personId !== id) throw new UserError("bad_photo", "This photo belongs to someone else");
    next.mainPhotoId = patch.mainPhotoId;
  }
  if (patch.appearanceNote !== undefined) next.appearanceNote = cleanText(patch.appearanceNote ?? undefined, 160);
  return repo.savePerson(next);
}

/** Validate and normalise an upload. Throws a user-readable error; stores nothing. */
async function normalizePhoto(file: { bytes: Buffer }) {
  const c = getConfig();
  if (file.bytes.length > c.limits.maxPhotoBytes)
    throw new UserError("too_big", `The file is larger than ${Math.round(c.limits.maxPhotoBytes / 1024 / 1024)} MB`);
  let meta: Metadata;
  try {
    meta = await sharp(file.bytes).metadata();
  } catch {
    throw new UserError("bad_format", "This is not a photo. Use JPEG, PNG or WebP");
  }
  if (!meta.format || !FORMATS[meta.format])
    throw new UserError(meta.format === "heif" ? "heic" : "bad_format", meta.format === "heif" ? "HEIC is not supported yet — send the photo as JPEG" : "Use JPEG, PNG or WebP");
  // EXIF orientation applied before measuring
  const rotated = meta.orientation && meta.orientation >= 5;
  const width = (rotated ? meta.height : meta.width) ?? 0;
  const height = (rotated ? meta.width : meta.height) ?? 0;
  if (Math.min(width, height) < MIN_SIDE) throw new UserError("too_small", `The photo is too small — at least ${MIN_SIDE} px on the short side`);
  // re-encode: applies rotation and drops EXIF (GPS, device) before storage
  const normalized = await sharp(file.bytes)
    .rotate()
    .resize(MAX_STORED_SIDE, MAX_STORED_SIDE, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer({ resolveWithObject: true });
  const analysis = await getPhotoAnalyzer().analyze({ bytes: normalized.data, width: normalized.info.width, height: normalized.info.height });
  return { normalized, analysis };
}

async function storePhoto(userId: string, person: Person, n: Awaited<ReturnType<typeof normalizePhoto>>): Promise<PhotoCheck> {
  const repo = getRepo();
  const id = randomUUID();
  const storageKey = keys.photo(userId, id, "jpg");
  await getStorage().put(storageKey, n.normalized.data, "image/jpeg");
  const photo = await repo.savePhoto({
    id,
    userId,
    personId: person.id,
    storageKey,
    mime: "image/jpeg",
    width: n.normalized.info.width,
    height: n.normalized.info.height,
    bytes: n.normalized.data.length,
    analysis: n.analysis,
    createdAt: new Date().toISOString(),
  });
  if (!person.mainPhotoId) await repo.savePerson({ ...person, mainPhotoId: id, updatedAt: new Date().toISOString() });
  return { photo };
}

export async function addPhoto(
  userId: string,
  personId: string,
  file: { bytes: Buffer; type: string; name?: string },
  limit = MAX_PHOTOS_PER_PERSON,
  normalized?: Awaited<ReturnType<typeof normalizePhoto>>,
): Promise<PhotoCheck> {
  const repo = getRepo();
  const person = await repo.getPerson(userId, personId);
  if (!person) throw new UserError("not_found", "Person not found", 404);
  const existing = await repo.listPhotos(userId, [personId]);
  if (existing.length >= limit) throw new UserError("too_many", `At most ${limit} photos per person — remove one first`);
  return storePhoto(userId, person, normalized ?? (await normalizePhoto(file)));
}

/**
 * Upload straight into a role. The first photo creates the person — saved to
 * the library by default, or kept only for this order when `save` is false —
 * and casts them. One person per role, never a duplicate per order.
 */
export async function addPhotoToRole(
  userId: string,
  draftId: string,
  roleId: string,
  file: { bytes: Buffer; type: string; name?: string },
  save: boolean,
  /** localized label from the browser, e.g. "Person 3"; the user can rename later */
  nameTemplate = "Person {n}",
): Promise<PhotoCheck & { personId: string }> {
  const repo = getRepo();
  const n = await normalizePhoto(file); // validate before creating anything
  for (let attempt = 0; attempt < 3; attempt++) {
    const { t, draft } = await loadDraft(userId, draftId);
    if (!t.roles.some((r) => r.id === roleId)) throw new UserError("bad_role", "No such participant", 400);
    const current = draft.assignments[roleId];
    if (current) {
      const res = await addPhoto(userId, current.personId, file, t.photos.maxPhotos, n);
      return { ...res, personId: current.personId };
    }
    const count = (await repo.listPeople(userId)).length;
    const person = await createPerson(userId, nameTemplate.replace("{n}", String(count + 1)), save);
    try {
      await repo.updateDraft({ ...assignPerson(t, draft, roleId, person.id), version: draft.version + 1, updatedAt: new Date().toISOString() }, draft.version);
    } catch (e) {
      await repo.deletePerson(userId, person.id);
      if (e instanceof ConflictError) continue;
      throw e;
    }
    const res = await storePhoto(userId, person, n);
    return { ...res, personId: person.id };
  }
  throw new ConflictError();
}

export async function removePhoto(userId: string, photoId: string) {
  const repo = getRepo();
  const photo = await repo.getPhoto(userId, photoId);
  if (!photo) throw new UserError("not_found", "Photo not found", 404);
  const key = await repo.deletePhoto(userId, photoId);
  if (key) await getStorage().remove([key]);
  const person = await repo.getPerson(userId, photo.personId);
  if (person && person.mainPhotoId === photoId) {
    const rest = await repo.listPhotos(userId, [person.id]);
    await repo.savePerson({ ...person, mainPhotoId: rest[0]?.id, updatedAt: new Date().toISOString() });
  }
}

export async function deletePerson(userId: string, personId: string) {
  const repo = getRepo();
  const jobs = await repo.listJobs(userId);
  const busy = jobs.some(
    (j) => ["queued", "submitting", "generating", "assembling"].includes(j.status) && j.input.people.some((p) => p.personId === personId),
  );
  if (busy) throw new UserError("busy", "A video with this person is being made — delete them when it is done", 409);
  const storageKeys = await repo.deletePerson(userId, personId);
  await getStorage().remove(storageKeys);
  return { removedFiles: storageKeys.length };
}

export async function listPeopleWithPhotos(userId: string) {
  const repo = getRepo();
  const people = await repo.listPeople(userId);
  const photos = await repo.listPhotos(userId, people.map((p) => p.id));
  return people.map((p) => ({ ...p, photos: photos.filter((ph) => ph.personId === p.id) }));
}
