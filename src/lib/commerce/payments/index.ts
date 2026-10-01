/**
 * Payment adapters. The server picks one from configuration
 * (PAYMENT_PROVIDER) — never from the interface language or the browser.
 * Only the test adapter exists: it records the purchase, moves no money and
 * every order it creates is marked "test_paid".
 */
import { getConfig } from "../../config";

export interface ChargeRequest {
  orderId: string;
  /** stable per purchase: a real adapter passes it to the processor so a retry never charges twice */
  idempotencyKey: string;
  amountMinor: number | null;
  currency: string;
  billingCountry: string;
  description: string;
}

export type ChargeResult = { status: "succeeded"; reference: string } | { status: "requires_action"; redirectUrl: string };

export interface PaymentProvider {
  readonly name: string;
  /** true → no money moves; orders are stored as test_paid */
  readonly isTest: boolean;
  charge(req: ChargeRequest): Promise<ChargeResult>;
  refund(order: { id: string; method: string }): Promise<void>;
}

class TestPaymentProvider implements PaymentProvider {
  readonly name = "test";
  readonly isTest = true;
  async charge(req: ChargeRequest): Promise<ChargeResult> {
    return { status: "succeeded", reference: `test_${req.orderId}` };
  }
  async refund() {
    // nothing was charged
  }
}

let instance: PaymentProvider | null = null;
export function getPaymentProvider(): PaymentProvider {
  if (instance) return instance;
  const name = getConfig().payments.provider;
  if (name !== "test") throw new Error(`PAYMENT_PROVIDER=${name} is not implemented; only "test" is available`);
  return (instance = new TestPaymentProvider());
}
