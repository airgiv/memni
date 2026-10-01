/**
 * Tiny message helpers. Dictionaries are plain data so translators can work
 * on them directly: "{name}" placeholders and plural objects keyed by
 * Intl.PluralRules categories ({ one, few, many, other }).
 */
export type Plural = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

/** Marks a plural entry in a dictionary (keeps the type open for every language's categories). */
export const plural = (forms: Plural): Plural => forms;

export function fmt(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export function plur(localeTag: string, forms: Plural, n: number, vars: Record<string, string | number> = {}): string {
  const cat = new Intl.PluralRules(localeTag).select(n);
  return fmt(forms[cat] ?? forms.other, { n, ...vars });
}
