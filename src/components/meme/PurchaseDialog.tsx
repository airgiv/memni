"use client";
/**
 * Shown before every paid action: what is being bought (one preview or one
 * video), the price in the billing currency and the test-mode notice. The
 * billing country can be changed here — it is independent of the language.
 */
import { useState } from "react";
import { api } from "@/client/api";
import { useI18n } from "@/i18n/client";
import { BILLING_COUNTRIES, type BillingContext } from "@/lib/commerce/billing";
import type { Money } from "@/lib/domain/types";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Select } from "@/ui/select";

export function PurchaseDialog({
  open,
  onOpenChange,
  kind,
  price,
  billing,
  durationSec,
  busy,
  onConfirm,
  onBillingChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: "preview" | "video";
  price: Money;
  billing: BillingContext;
  durationSec: number;
  busy: boolean;
  onConfirm: (price: Money) => void;
  onBillingChanged: () => Promise<unknown>;
}) {
  const { m, fmt, money } = useI18n();
  const [changing, setChanging] = useState(false);
  const formatted = money(price);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={kind === "video" ? m.purchase.videoTitle : m.purchase.previewTitle}
      description={kind === "video" ? fmt(m.purchase.videoBody, { seconds: durationSec }) : m.purchase.previewBody}
      closeLabel={m.common.close}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3 rounded-2xl border border-line bg-white/[0.03] px-4 py-3">
          <span className="text-[26px] font-semibold tracking-tight" data-testid="price">
            {formatted}
          </span>
          {price.isExample && <span className="text-[12px] text-muted">{m.purchase.examplePrice}</span>}
        </div>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="billing-country" className="text-[13px] text-muted">
            {m.purchase.billingCountry}
          </label>
          <Select
            id="billing-country"
            label={m.purchase.billingCountry}
            value={billing.country}
            disabled={changing || busy}
            className="min-w-[180px]"
            options={[...new Set([billing.country, ...BILLING_COUNTRIES])].map((c) => ({ value: c, label: m.purchase.countries[c] ?? c }))}
            onValueChange={async (country) => {
              setChanging(true);
              try {
                await api("/api/billing", { method: "POST", json: { country } });
                await onBillingChanged();
              } finally {
                setChanging(false);
              }
            }}
          />
        </div>
        <p className="text-[13px] text-muted">
          {fmt(m.purchase.currencyNote, { currency: price.currency })} · {m.purchase.testMode}
        </p>
        <Button variant="primary" size="lg" className="w-full" loading={busy} disabled={changing} onClick={() => onConfirm(price)}>
          {fmt(m.purchase.pay, { price: formatted })}
        </Button>
      </div>
    </Dialog>
  );
}
