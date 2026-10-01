/**
 * What the browser gets about a meme: media, roles, outfit options and the
 * localized labels for one locale. Never prompts, constraints or pricing.
 */
import type { LocaleCode } from "@/i18n/locales";
import type { MemeContent, MemeDef } from "./types";

export function clientMeme(m: MemeDef, content: MemeContent, locale: LocaleCode) {
  return {
    id: m.id,
    version: m.version,
    locale,
    title: content.title,
    tagline: content.tagline,
    durationSec: m.durationSec,
    aspectRatio: m.aspectRatio,
    media: {
      video: m.media.video.src,
      videoWebm: m.media.video.webm ?? null,
      poster: m.media.poster.src,
      width: m.media.poster.width,
      height: m.media.poster.height,
      focal: m.media.focal,
      mobile: m.media.mobile
        ? { video: m.media.mobile.video.src, webm: m.media.mobile.video.webm ?? null, poster: m.media.mobile.poster.src, width: m.media.mobile.poster.width, height: m.media.mobile.poster.height, focal: m.media.mobile.focal }
        : null,
      placeholder: m.media.placeholder,
    },
    roles: m.roles.map((r) => ({
      id: r.id,
      name: content.roles[r.id]?.name ?? r.id,
      hint: content.roles[r.id]?.hint ?? "",
      region: r.region,
      face: r.face.src,
      cutout: r.cutout.src,
      focal: r.focal,
      outfits: r.outfits.map((id) => {
        const def = m.outfits.find((o) => o.id === id)!;
        return { id, kind: def.kind, label: content.outfits[id] ?? id };
      }),
      defaultOutfit: r.defaultOutfit,
    })),
    /** labels for every outfit id (a random draw resolves to a preset that may not be in a role's menu) */
    outfitLabels: Object.fromEntries(m.outfits.map((o) => [o.id, content.outfits[o.id] ?? o.id])),
    photos: { min: m.photos.minPhotos, max: m.photos.maxPhotos, minSidePx: m.photos.minSidePx, accept: m.photos.acceptedTypes },
  };
}
export type ClientMeme = ReturnType<typeof clientMeme>;
export type ClientRole = ClientMeme["roles"][number];
