/**
 * Price table (example prices). One purchase = one preview image or one
 * video; there are no tokens or balances.
 */
import type { Currency } from "./billing";

export const PRICE_TABLE: Record<"preview" | "video", Record<Currency, number>> = {
  // minor units: USD/EUR cents, RUB kopecks, BRL centavos, JPY yen
  preview: { USD: 99, EUR: 99, RUB: 4900, BRL: 490, JPY: 150 },
  video: { USD: 499, EUR: 499, RUB: 39900, BRL: 2490, JPY: 750 },
};
