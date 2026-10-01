import { getMeme } from "../src/memes";
import type { MemeDef } from "../src/memes/types";
import type { Draft, Person, Photo } from "../src/lib/domain/types";

export const hotel = getMeme("hotel-lobby")!;
export const now = new Date().toISOString();
export const person = (id: string): Person => ({ id, userId: "u", name: id, saved: true, mainPhotoId: `${id}-ph1`, createdAt: now, updatedAt: now });
export const photo = (pid: string, n: number, body: "full" | "upper" | "face" | null = null): Photo => ({
  id: `${pid}-ph${n}`,
  userId: "u",
  personId: pid,
  storageKey: "k",
  mime: "image/jpeg",
  width: 1000,
  height: 1000,
  bytes: 1,
  analysis: body ? { analyzer: "t", isDemo: false, checked: ["body"], issues: [], faces: 1, body } : undefined,
  createdAt: now,
});
export const draft = (t: MemeDef = hotel): Draft => ({ id: "d", userId: "u", templateId: t.id, templateVersion: t.version, version: 1, assignments: {}, scene: { optionId: "default" }, createdAt: now, updatedAt: now });

/** The same config shape with N roles — proves nothing is hard-wired to two people (not a real meme). */
export function withRoles(n: number): MemeDef {
  const base = hotel.roles[0];
  return {
    ...hotel,
    id: `fixture-${n}`,
    roles: Array.from({ length: n }, (_, i) => ({ ...base, id: `r${i}`, prompt: `performer ${i}` })),
  };
}
