/**
 * Prices and the free offer, all from server configuration. The browser only
 * ever sees quotes; a purchase goes through only if the client echoes the
 * exact quoted amount (the user saw the price and confirmed it).
 */
import { getConfig } from "../config";
import type { Money } from "../domain/types";
import type { TemplateDef } from "../templates/types";
import { getRepo } from "./repo";

export interface Quote {
  /** true → this one is covered by the free offer */
  free: boolean;
  /** null → no price defined (test run without an amount) */
  price: Money | null;
}

export async function previewQuote(userId: string): Promise<Quote> {
  const c = getConfig();
  const used = await getRepo().countFreePreviews(userId);
  const price: Money = { amountMinor: c.pricing.previewMinor, currency: c.pricing.currency, isExample: c.pricing.areExamples };
  return { free: used < c.limits.freePreviewsPerUser, price };
}

export function videoPrice(t: TemplateDef): Money | null {
  const c = getConfig();
  if (c.pricing.videoMinor !== undefined) return { amountMinor: c.pricing.videoMinor, currency: c.pricing.currency, isExample: c.pricing.areExamples };
  return t.price ? { amountMinor: t.price.amountMinor, currency: t.price.currency, isExample: t.price.isExample } : null;
}

/** The client must send back the amount it showed; anything else → show the price again. */
export function acceptedAmountMatches(price: Money | null, accepted: number | null | undefined): boolean {
  return (price?.amountMinor ?? null) === (accepted ?? null);
}
