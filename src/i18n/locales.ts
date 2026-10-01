/**
 * Locale registry. English is the source locale and the default. Other
 * languages are separate, explicit localizations: a locale is routable only
 * when its interface dictionary exists AND it is marked published. Meme pages
 * additionally need that meme's own translation (see src/memes).
 *
 * Interface locale is NOT the meme's target market, the billing country or
 * the checkout currency — those live in src/memes and src/lib/commerce.
 */
export const LOCALE_CODES = ["en", "ru", "pt-BR", "pt-PT", "es", "ja"] as const;
export type LocaleCode = (typeof LOCALE_CODES)[number];

export interface LocaleInfo {
  code: LocaleCode;
  /** URL segment: /pt-br/memes/... */
  segment: string;
  /** BCP 47 tag for <html lang>, hreflang and Intl */
  tag: string;
  /** Name in its own language — the selector shows names, never flags */
  name: string;
  /** "published": dictionary written and reviewed; "planned": routes are prepared, nothing is served */
  status: "published" | "planned";
}

export const LOCALES: Record<LocaleCode, LocaleInfo> = {
  en: { code: "en", segment: "en", tag: "en", name: "English", status: "published" },
  ru: { code: "ru", segment: "ru", tag: "ru", name: "Русский", status: "published" },
  "pt-BR": { code: "pt-BR", segment: "pt-br", tag: "pt-BR", name: "Português (Brasil)", status: "planned" },
  "pt-PT": { code: "pt-PT", segment: "pt-pt", tag: "pt-PT", name: "Português (Portugal)", status: "planned" },
  es: { code: "es", segment: "es", tag: "es", name: "Español", status: "planned" },
  ja: { code: "ja", segment: "ja", tag: "ja", name: "日本語", status: "planned" },
};

export const DEFAULT_LOCALE: LocaleCode = "en";

export const PUBLISHED_LOCALES: LocaleCode[] = LOCALE_CODES.filter((c) => LOCALES[c].status === "published");

export function localeFromSegment(segment: string): LocaleCode | null {
  const hit = LOCALE_CODES.find((c) => LOCALES[c].segment === segment.toLowerCase());
  return hit && LOCALES[hit].status === "published" ? hit : null;
}

export function segmentOf(code: LocaleCode): string {
  return LOCALES[code].segment;
}

/**
 * Best published match for a browser's language list — used only to SUGGEST
 * a translation, never to redirect.
 */
export function matchBrowserLocale(languages: readonly string[], available: readonly LocaleCode[]): LocaleCode | null {
  for (const lang of languages) {
    const l = lang.toLowerCase();
    const exact = available.find((c) => LOCALES[c].tag.toLowerCase() === l);
    if (exact) return exact;
    const base = l.split("-")[0];
    const loose = available.find((c) => LOCALES[c].tag.toLowerCase().split("-")[0] === base);
    if (loose) return loose;
  }
  return null;
}
