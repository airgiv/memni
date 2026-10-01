/**
 * Quotes and purchases. Prices come from the server price table in the
 * customer's billing currency; the browser only ever sees quotes, and a
 * purchase goes through only if the client echoes the exact amount and
 * currency it showed (the user saw the price and confirmed it).
 */
import { randomUUID } from "node:crypto";
import { getConfig } from "../config";
import type { BillingContext } from "../commerce/billing";
import { getPaymentProvider } from "../commerce/payments";
import { PRICE_TABLE } from "../commerce/prices";
import type { Money, Order } from "../domain/types";
import { memePriceOverride, type MemeDef } from "../../memes";
import { getRepo } from "./repo";
import { UserError } from "./services/errors";

export interface Quote {
  /** true → covered by the free offer */
  free: boolean;
  price: Money;
}

export async function previewQuote(userId: string, billing: BillingContext): Promise<Quote> {
  const c = getConfig();
  const used = await getRepo().countFreePreviews(userId);
  return {
    free: used < c.limits.freePreviewsPerUser,
    price: { amountMinor: PRICE_TABLE.preview[billing.currency], currency: billing.currency, isExample: c.pricing.areExamples },
  };
}

export function videoPrice(t: MemeDef, billing: BillingContext): Money {
  const c = getConfig();
  const amount = memePriceOverride(t, billing.currency) ?? PRICE_TABLE.video[billing.currency];
  return { amountMinor: amount, currency: billing.currency, isExample: c.pricing.areExamples };
}

/** The client must send back the amount and currency it showed; anything else → show the price again. */
export function acceptedPriceMatches(price: Money, accepted: { amountMinor?: number | null; currency?: string | null }): boolean {
  return price.amountMinor === accepted.amountMinor && price.currency === accepted.currency;
}

/**
 * Builds a purchase and charges it through the configured payment adapter.
 * Repositories persist the returned order atomically with what it pays for.
 */
export async function chargeOrder(o: {
  userId: string;
  kind: Order["kind"];
  refId: string;
  idempotencyKey: string;
  price: Money;
  billing: BillingContext;
}): Promise<Order> {
  const payments = getPaymentProvider();
  const id = randomUUID();
  const res = await payments.charge({
    orderId: id,
    idempotencyKey: o.idempotencyKey,
    amountMinor: o.price.amountMinor,
    currency: o.price.currency,
    billingCountry: o.billing.country,
    description: o.kind === "preview" ? "Preview image" : "Video",
  });
  if (res.status !== "succeeded") throw new UserError("payment_action_required", "The payment needs another step that this prototype does not support", 402);
  return {
    id,
    userId: o.userId,
    kind: o.kind,
    refId: o.refId,
    idempotencyKey: o.idempotencyKey,
    amountMinor: o.price.amountMinor,
    currency: o.price.currency,
    priceIsExample: o.price.isExample,
    status: payments.isTest ? "test_paid" : "paid",
    method: payments.name,
    billingCountry: o.billing.country,
    createdAt: new Date().toISOString(),
  };
}

/** Gives a payment back when a paid generation failed on our side. */
export async function refundFor(refId: string): Promise<void> {
  const repo = getRepo();
  await getPaymentProvider().refund({ id: refId, method: getPaymentProvider().name });
  await repo.refundOrderForRef(refId);
}
