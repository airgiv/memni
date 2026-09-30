import type { Money } from "@/lib/domain/types";

export function money(m: Pick<Money, "amountMinor" | "currency"> | null | undefined): string {
  if (!m) return "";
  if (m.currency === "XTR") return `${m.amountMinor} ⭐`;
  const v = m.amountMinor / 100;
  return `${Number.isInteger(v) ? v : v.toFixed(2)} ₽`;
}
