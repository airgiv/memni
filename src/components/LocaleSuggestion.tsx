"use client";
/**
 * If the browser prefers a language this page is translated into, offer it.
 * Never redirects and never overrides the URL the person opened.
 */
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { store } from "@/client/hooks";
import { matchBrowserLocale, type LocaleCode } from "@/i18n/locales";
import { useI18n } from "@/i18n/client";

export interface SuggestionText {
  suggestion: string;
  open: string;
  dismiss: string;
  name: string;
}

export function LocaleSuggestion({ alternates, texts }: { alternates: Partial<Record<LocaleCode, string>>; texts: Partial<Record<LocaleCode, SuggestionText>> }) {
  const { locale } = useI18n();
  const [target, setTarget] = useState<LocaleCode | null>(null);

  useEffect(() => {
    const others = (Object.keys(alternates) as LocaleCode[]).filter((c) => c !== locale);
    const prefs = navigator.languages?.length ? navigator.languages : [navigator.language];
    // only suggest when the browser does not already prefer the current language first
    const best = matchBrowserLocale(prefs, [locale, ...others]);
    if (best && best !== locale && store.get(`memme:suggest:${best}`) !== "dismissed") setTarget(best);
  }, [alternates, locale]);

  if (!target || !texts[target]) return null;
  const t = texts[target]!;
  const dismiss = () => {
    store.set(`memme:suggest:${target}`, "dismissed");
    setTarget(null);
  };
  return (
    <div lang={target} role="status" className="fixed left-1/2 top-[calc(var(--safe-top)+64px)] z-40 flex w-[min(92vw,420px)] -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/12 bg-[#18181b]/90 py-1.5 pl-4 pr-1.5 text-[13px] text-fg-2 shadow-xl backdrop-blur-xl lg:top-6">
      <span className="min-w-0 flex-1">{t.suggestion.replace("{language}", t.name)}</span>
      <a href={alternates[target]! + window.location.search} className="rounded-lg px-2.5 py-1.5 font-medium text-fg hover:bg-white/[0.08]">
        {t.open}
      </a>
      <button type="button" onClick={dismiss} aria-label={t.dismiss} title={t.dismiss} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-white/[0.08] hover:text-fg">
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
