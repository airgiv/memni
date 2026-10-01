/**
 * Dictionary lookup. Only published locales have dictionaries; planned ones
 * (pt-BR, pt-PT, es, ja) are prepared in the registry and simply have no
 * routes until a reviewed dictionary is added here.
 */
import { DEFAULT_LOCALE, LOCALES, type LocaleCode } from "./locales";
import { en, type Messages } from "./messages/en";
import { ru } from "./messages/ru";

export * from "./locales";
export { fmt, plur, type Plural } from "./format";
export type { Messages };

const DICTIONARIES: Partial<Record<LocaleCode, Messages>> = { en, ru };

export function getMessages(locale: LocaleCode): Messages {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE]!;
}

export function hasDictionary(locale: LocaleCode): boolean {
  return Boolean(DICTIONARIES[locale]) && LOCALES[locale].status === "published";
}
