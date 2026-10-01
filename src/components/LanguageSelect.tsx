"use client";
/**
 * Compact language selector — language names, never flags. Switching keeps
 * the current page and its query (step, draft, job), so the draft survives.
 */
import { LOCALES, type LocaleCode } from "@/i18n/locales";
import { useI18n } from "@/i18n/client";
import { Select } from "@/ui/select";

export function LanguageSelect({ alternates, className }: { alternates: Partial<Record<LocaleCode, string>>; className?: string }) {
  const { locale, m } = useI18n();
  const codes = Object.keys(alternates) as LocaleCode[];
  if (codes.length < 2) return null;
  return (
    <Select
      label={m.language.label}
      value={locale}
      className={className}
      options={codes.map((c) => ({ value: c, label: LOCALES[c].name }))}
      onValueChange={(c) => {
        const path = alternates[c as LocaleCode];
        if (path) window.location.assign(path + window.location.search + window.location.hash);
      }}
    />
  );
}
