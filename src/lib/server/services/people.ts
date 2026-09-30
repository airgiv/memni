/**
 * People and their source photos. Photos belong to the person (reused across
 * orders); how the person looks in a given order lives on the draft.
 */
import { randomUUID } from "node:crypto";
import sharp, { type Metadata, type OverlayOptions } from "sharp";
import { getConfig } from "../../config";
import type { Person, Photo } from "../../domain/types";
import { sanitizeNote } from "../../domain/prompts";
import { getRepo } from "../repo";
import { getStorage, keys } from "../storage";
import { UserError } from "./errors";

export const MAX_PHOTOS_PER_PERSON = 8;
const MIN_SIDE = 512;
const GOOD_SIDE = 1024;
const MAX_STORED_SIDE = 2048;
const FORMATS: Record<string, string> = { jpeg: "JPEG", png: "PNG", webp: "WebP" };

export interface PhotoCheck {
  photo: Photo;
  /** honest, format-level notes only — no fake «face quality» scores */
  notes: string[];
}

export async function createPerson(userId: string, name: string, saved: boolean): Promise<Person> {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 40);
  if (!clean) throw new UserError("bad_name", "Как подписать этого человека? Например, «Саша»");
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
  if (!p) throw new UserError("not_found", "Человек не найден", 404);
  const next: Person = { ...p, updatedAt: new Date().toISOString() };
  if (patch.name !== undefined) {
    const clean = patch.name.replace(/\s+/g, " ").trim().slice(0, 40);
    if (!clean) throw new UserError("bad_name", "Имя не может быть пустым");
    next.name = clean;
  }
  if (patch.saved !== undefined) next.saved = patch.saved;
  if (patch.mainPhotoId !== undefined) {
    const photo = await repo.getPhoto(userId, patch.mainPhotoId);
    if (!photo || photo.personId !== id) throw new UserError("bad_photo", "Это фото принадлежит другому человеку");
    next.mainPhotoId = patch.mainPhotoId;
  }
  if (patch.appearanceNote !== undefined) next.appearanceNote = sanitizeNote(patch.appearanceNote ?? undefined, 160);
  return repo.savePerson(next);
}

export async function addPhoto(userId: string, personId: string, file: { bytes: Buffer; type: string; name?: string }): Promise<PhotoCheck> {
  const c = getConfig();
  const repo = getRepo();
  const person = await repo.getPerson(userId, personId);
  if (!person) throw new UserError("not_found", "Человек не найден", 404);
  const existing = await repo.listPhotos(userId, [personId]);
  if (existing.length >= MAX_PHOTOS_PER_PERSON)
    throw new UserError("too_many", `Хватит ${MAX_PHOTOS_PER_PERSON} фото — удалите лишнее, чтобы добавить новое`);
  if (file.bytes.length > c.limits.maxPhotoBytes)
    throw new UserError("too_big", `Файл больше ${Math.round(c.limits.maxPhotoBytes / 1024 / 1024)} МБ — выберите фото поменьше`);

  let meta: Metadata;
  try {
    meta = await sharp(file.bytes).metadata();
  } catch {
    throw new UserError("bad_format", "Не получилось открыть файл. Подойдут фото JPEG, PNG или WebP");
  }
  if (!meta.format || !FORMATS[meta.format]) {
    const heic = meta.format === "heif";
    throw new UserError(
      "bad_format",
      heic
        ? "Формат HEIC пока не поддерживается. На iPhone: Настройки → Камера → Форматы → «Наиболее совместимый», или отправьте фото как JPEG"
        : "Подойдут фото JPEG, PNG или WebP",
    );
  }
  // EXIF orientation applied before measuring
  const rotated = meta.orientation && meta.orientation >= 5;
  const width = (rotated ? meta.height : meta.width) ?? 0;
  const height = (rotated ? meta.width : meta.height) ?? 0;
  if (Math.min(width, height) < MIN_SIDE)
    throw new UserError("too_small", `Фото слишком маленькое (${width}×${height}). Нужно не меньше ${MIN_SIDE} px по короткой стороне`);

  const notes: string[] = [];
  if (Math.min(width, height) < GOOD_SIDE) notes.push("Фото небольшое — лицо может получиться менее чётким");

  // re-encode: applies rotation and drops EXIF (GPS, device) before storage
  const normalized = await sharp(file.bytes)
    .rotate()
    .resize(MAX_STORED_SIDE, MAX_STORED_SIDE, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer({ resolveWithObject: true });

  const id = randomUUID();
  const storageKey = keys.photo(userId, id, "jpg");
  await getStorage().put(storageKey, normalized.data, "image/jpeg");
  const photo = await repo.savePhoto({
    id,
    userId,
    personId,
    storageKey,
    mime: "image/jpeg",
    width: normalized.info.width,
    height: normalized.info.height,
    bytes: normalized.data.length,
    createdAt: new Date().toISOString(),
  });
  if (!person.mainPhotoId) await repo.savePerson({ ...person, mainPhotoId: id, updatedAt: new Date().toISOString() });
  return { photo, notes };
}

export async function removePhoto(userId: string, photoId: string) {
  const repo = getRepo();
  const photo = await repo.getPhoto(userId, photoId);
  if (!photo) throw new UserError("not_found", "Фото не найдено", 404);
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
  if (busy) throw new UserError("busy", "С этим человеком сейчас создаётся видео — удалить можно после завершения", 409);
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
