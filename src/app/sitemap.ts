/** Every published page in every published language, with reciprocal alternates. */
import type { MetadataRoute } from "next";
import { abs, catalogAlternates, memeAlternates } from "@/lib/site";
import { LOCALES, type LocaleCode } from "@/i18n";
import { MEMES } from "@/memes";

function languages(alternates: Partial<Record<LocaleCode, string>>) {
  return Object.fromEntries((Object.entries(alternates) as [LocaleCode, string][]).map(([l, p]) => [LOCALES[l].tag, abs(p)]));
}

export default function sitemap(): MetadataRoute.Sitemap {
  const catalog = catalogAlternates();
  const out: MetadataRoute.Sitemap = Object.values(catalog).map((p) => ({ url: abs(p!), changeFrequency: "weekly", priority: 0.6, alternates: { languages: languages(catalog) } }));
  for (const m of MEMES) {
    const alt = memeAlternates(m);
    for (const p of Object.values(alt))
      out.push({ url: abs(p!), lastModified: m.updatedAt, changeFrequency: "monthly", priority: 0.9, alternates: { languages: languages(alt) }, images: [abs(m.media.poster.src)] });
  }
  return out;
}
