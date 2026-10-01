/**
 * Billing context: the customer's billing country and the checkout currency.
 * Deliberately separate from the interface locale (an English page can be
 * viewed from Brazil) and from a meme's target market.
 *
 *   country: explicit choice (cookie) → edge geo header → configured default
 *   currency: from the country; display currency = checkout currency for now
 */
export const SUPPORTED_CURRENCIES = ["USD", "EUR", "RUB", "BRL", "JPY"] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

const EURO = ["AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK"];

export function currencyForCountry(country: string): Currency {
  const c = country.toUpperCase();
  if (EURO.includes(c)) return "EUR";
  if (c === "RU") return "RUB";
  if (c === "BR") return "BRL";
  if (c === "JP") return "JPY";
  return "USD";
}

/** Countries offered in the billing selector (prototype list). */
export const BILLING_COUNTRIES = ["US", "GB", "DE", "FR", "ES", "PT", "BR", "RU", "JP"] as const;

export interface BillingContext {
  country: string;
  /** checkout currency */
  currency: Currency;
  /** currency prices are displayed in — equal to checkout today, kept separate on purpose */
  displayCurrency: Currency;
  source: "selected" | "detected" | "default";
}

export const BILLING_COOKIE = "memme_billing_country";

export function resolveBilling(input: { cookie?: string | null; geoHeader?: string | null; fallback: string }): BillingContext {
  const valid = (v?: string | null) => (v && /^[A-Za-z]{2}$/.test(v) && v.toUpperCase() !== "XX" ? v.toUpperCase() : null);
  const selected = valid(input.cookie);
  const detected = valid(input.geoHeader);
  const country = selected ?? detected ?? input.fallback;
  const currency = currencyForCountry(country);
  return { country, currency, displayCurrency: currency, source: selected ? "selected" : detected ? "detected" : "default" };
}
