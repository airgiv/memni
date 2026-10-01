/**
 * Meme registry. To add a meme: create src/memes/<id>/index.ts with a
 * MemeDef (and content.<locale>.ts files), import it here, and run its media
 * import. Pages, sitemap, metadata and the creation flow pick it up.
 */
import { DEFAULT_LOCALE, LOCALES, PUBLISHED_LOCALES, type LocaleCode } from "@/i18n/locales";
import { hotelLobby } from "./hotel-lobby";
import type { MemeContent, MemeDef, OutfitDef } from "./types";

export * from "./types";

export const MEMES: MemeDef[] = [hotelLobby];

export function getMeme(id: string): MemeDef | undefined {
  return MEMES.find((m) => m.id === id);
}

/** Locales in which this meme is published: reviewed content AND a published interface. */
export function memeLocales(m: MemeDef): LocaleCode[] {
  return PUBLISHED_LOCALES.filter((l) => m.content[l]?.review.status === "reviewed");
}

export function memeContent(m: MemeDef, locale: LocaleCode): MemeContent | null {
  return memeLocales(m).includes(locale) ? m.content[locale]! : null;
}

/** Content for server-side use (prompts never use it); falls back to the meme's default, then English. */
export function anyContent(m: MemeDef, locale: LocaleCode): MemeContent {
  return memeContent(m, locale) ?? m.content[m.defaultLocale] ?? m.content[DEFAULT_LOCALE]!;
}

export function findMemeBySlug(locale: LocaleCode, slug: string): MemeDef | undefined {
  return MEMES.find((m) => memeContent(m, locale)?.slug === slug);
}

export function memePath(m: MemeDef, locale: LocaleCode): string | null {
  const c = memeContent(m, locale);
  return c ? `/${LOCALES[locale].segment}/memes/${c.slug}` : null;
}

export function outfitDef(m: MemeDef, id: string | undefined): OutfitDef | undefined {
  return m.outfits.find((o) => o.id === id);
}

/** Video price override for a currency, if the meme sets one. */
export function memePriceOverride(m: MemeDef, currency: string): number | undefined {
  return m.priceOverride?.[currency];
}
