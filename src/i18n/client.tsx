"use client";
import { createContext, useContext, useMemo } from "react";
import { formatMoney } from "@/lib/commerce/money";
import { fmt, plur, type Plural } from "./format";
import { LOCALES, type LocaleCode } from "./locales";
import type { Messages } from "./messages/en";

interface I18n {
  locale: LocaleCode;
  /** BCP 47 tag for Intl */
  tag: string;
  m: Messages;
  fmt: typeof fmt;
  plur: (forms: Plural, n: number, vars?: Record<string, string | number>) => string;
  money: (price: { amountMinor: number; currency: string }) => string;
}

const Ctx = createContext<I18n | null>(null);

/** The server passes only the active dictionary; the browser never loads the others. */
export function I18nProvider({ locale, messages, children }: { locale: LocaleCode; messages: Messages; children: React.ReactNode }) {
  const value = useMemo<I18n>(() => {
    const tag = LOCALES[locale].tag;
    return { locale, tag, m: messages, fmt, plur: (forms, n, vars) => plur(tag, forms, n, vars), money: (p) => formatMoney(p, tag) };
  }, [locale, messages]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside I18nProvider");
  return v;
}

/** Localized message for an API error code; falls back to the server's English text. */
export function errorText(m: Messages, e: unknown): string {
  const err = e as { code?: string; message?: string; status?: number };
  const code = err?.code ?? "";
  const known = (m.errors as unknown as Record<string, unknown>)[code];
  if (typeof known === "string") return known;
  if (code === "unsupported" && err.message && m.errors.unsupported[err.message]) return m.errors.unsupported[err.message];
  if (code === "network") return m.errors.network;
  return err?.message && /^[\x20-\x7E—’]+$/.test(err.message) && code !== "internal" ? err.message : m.errors.generic;
}
