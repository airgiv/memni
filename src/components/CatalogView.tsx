"use client";
/** Search and optional language / market filters over the catalog. At least two cards per row on phones. */
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { LOCALES, type LocaleCode } from "@/i18n/locales";
import { Input } from "@/ui/field";
import { Select } from "@/ui/select";

export interface CatalogItem {
  id: string;
  href: string;
  title: string;
  summary: string;
  poster: string;
  focal: { x: number; y: number };
  people: number;
  languages: LocaleCode[];
  shownIn: LocaleCode;
  markets: string[];
  ready: boolean;
}

export function CatalogView({ items }: { items: CatalogItem[] }) {
  const { m, locale, plur, fmt } = useI18n();
  const [q, setQ] = useState("");
  const [lang, setLang] = useState("all");
  const [market, setMarket] = useState("all");
  const languages = [...new Set(items.flatMap((i) => i.languages))];
  const markets = [...new Set(items.flatMap((i) => i.markets))];

  const shown = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase(locale);
    return items.filter(
      (i) =>
        (!needle || `${i.title} ${i.summary}`.toLocaleLowerCase(locale).includes(needle)) &&
        (lang === "all" || i.languages.includes(lang as LocaleCode)) &&
        (market === "all" || i.markets.includes(market)),
    );
  }, [items, q, lang, market, locale]);

  return (
    <>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative flex-1 sm:max-w-sm">
          <span className="sr-only">{m.catalog.search}</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <Input type="search" placeholder={m.catalog.search} value={q} onChange={(e) => setQ(e.target.value)} className="pl-10" />
        </label>
        <div className="flex gap-2">
          {languages.length > 1 && (
            <Select
              label={m.catalog.languageFilter}
              value={lang}
              onValueChange={setLang}
              className="flex-1 sm:w-44 sm:flex-none"
              options={[{ value: "all", label: m.catalog.allLanguages }, ...languages.map((l) => ({ value: l, label: LOCALES[l].name }))]}
            />
          )}
          {markets.length > 1 && (
            <Select
              label={m.catalog.marketFilter}
              value={market}
              onValueChange={setMarket}
              className="flex-1 sm:w-40 sm:flex-none"
              options={[{ value: "all", label: m.catalog.allMarkets }, ...markets.map((k) => ({ value: k, label: m.catalog.markets[k] ?? k }))]}
            />
          )}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="mt-10 text-muted">{m.catalog.noResults}</p>
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
          {shown.map((i) => (
            <li key={i.id}>
              <Link href={i.href} hrefLang={LOCALES[i.shownIn].tag} className="group block rounded-2xl border border-line bg-surface transition-colors hover:border-line-strong">
                <div className="relative aspect-[4/5] overflow-hidden rounded-t-2xl bg-black">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={i.poster} alt="" className="size-full object-cover" style={{ objectPosition: `${i.focal.x * 100}% ${i.focal.y * 100}%` }} loading="lazy" />
                  {!i.ready && <span className="absolute inset-x-2 bottom-2 rounded-lg bg-black/70 px-2 py-1 text-center text-[12px] text-fg-2">{m.catalog.notConnected}</span>}
                </div>
                <div className="p-3">
                  <h2 className="truncate text-[15px] font-semibold">{i.title}</h2>
                  <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted">{i.summary}</p>
                  <p className="mt-2 text-[12px] text-faint">
                    {plur(m.catalog.people, i.people)}
                    {i.shownIn !== locale && ` · ${fmt(m.catalog.otherLanguage, { language: LOCALES[i.shownIn].name })}`}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
