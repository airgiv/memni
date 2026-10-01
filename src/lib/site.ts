/** Absolute URLs for canonical links, hreflang, sitemap and social metadata. */
import { DEFAULT_LOCALE, LOCALES, PUBLISHED_LOCALES, getMessages, type LocaleCode } from "@/i18n";
import { memeLocales, memePath, type MemeDef } from "@/memes";

export function siteUrl(): string {
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined;
  return (process.env.APP_URL ?? railway ?? "http://localhost:3000").replace(/\/$/, "");
}

export function abs(path: string): string {
  return /^https?:\/\//.test(path) ? path : `${siteUrl()}${path}`;
}

/** Every published translation of a meme page, keyed by locale — reciprocal by construction. */
export function memeAlternates(m: MemeDef): Partial<Record<LocaleCode, string>> {
  return Object.fromEntries(memeLocales(m).map((l) => [l, memePath(m, l)!]));
}

export function catalogAlternates(): Partial<Record<LocaleCode, string>> {
  return Object.fromEntries(PUBLISHED_LOCALES.map((l) => [l, `/${LOCALES[l].segment}`]));
}

/** hreflang map for Next metadata (BCP 47 tags) plus x-default. */
export function hreflang(alternates: Partial<Record<LocaleCode, string>>, xDefault: LocaleCode = DEFAULT_LOCALE): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [code, path] of Object.entries(alternates) as [LocaleCode, string][]) out[LOCALES[code].tag] = abs(path);
  const def = alternates[xDefault] ?? Object.values(alternates)[0];
  if (def) out["x-default"] = abs(def);
  return out;
}

/** Texts for the browser-language suggestion, in each target language. */
export function suggestionTexts(alternates: Partial<Record<LocaleCode, string>>) {
  return Object.fromEntries(
    (Object.keys(alternates) as LocaleCode[]).map((l) => {
      const msg = getMessages(l);
      return [l, { suggestion: msg.language.suggestion, open: msg.language.open, dismiss: msg.language.dismiss, name: LOCALES[l].name }];
    }),
  );
}
