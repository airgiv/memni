/**
 * Money helpers shared by server and browser. Amounts are integers in the
 * currency's minor unit as defined by ISO 4217 (cents for USD, whole yen for JPY).
 */
export interface Money {
  amountMinor: number;
  currency: string;
  /** true → placeholder price, the UI says so */
  isExample: boolean;
}

export function minorDigits(currency: string): number {
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

/** Formats in the interface locale; the currency itself comes from billing, not from the language. */
export function formatMoney(m: Pick<Money, "amountMinor" | "currency">, localeTag: string): string {
  const digits = minorDigits(m.currency);
  const value = m.amountMinor / 10 ** digits;
  return new Intl.NumberFormat(localeTag, {
    style: "currency",
    currency: m.currency,
    minimumFractionDigits: value % 1 === 0 ? 0 : digits,
    maximumFractionDigits: digits,
  }).format(value);
}
