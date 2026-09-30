"use client";
import { useEffect, useState } from "react";
import { Button } from "@/ui/Button";
import { money } from "@/client/money";
import type { Money } from "@/lib/domain/types";
import { Adaptive } from "../Adaptive";

export interface PurchaseRequest {
  title: string;
  price: Money | null;
  /** runs with a stable key: retrying the same confirmation never pays twice */
  onConfirm: (purchaseKey: string) => Promise<void>;
}

/**
 * The price is shown and confirmed BEFORE any paid call. Payments are not
 * connected yet: it says so plainly and nothing is charged.
 */
export function PurchaseDialog({ request, onClose, paymentsLive }: { request: PurchaseRequest | null; onClose: () => void; paymentsLive: boolean }) {
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState("");
  useEffect(() => {
    if (request) setKey(crypto.randomUUID());
  }, [request]);
  const confirm = async () => {
    if (!request) return;
    setBusy(true);
    try {
      await request.onConfirm(key);
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Adaptive open={request !== null} onOpenChange={(v) => !v && !busy && onClose()} title={request?.title ?? ""}>
      <div className="flex flex-col gap-4 pt-1">
        <p className="text-[2.25rem] leading-none font-medium tracking-[-0.03em]">{request?.price ? money(request.price) : "Без оплаты"}</p>
        {!paymentsLive && <p className="text-[0.875rem] text-mute">Тестовая оплата — деньги не спишутся.</p>}
        <Button variant="accent" size="lg" block onClick={confirm} state={busy ? "loading" : undefined}>
          {request?.price ? `${paymentsLive ? "Оплатить" : "Оплатить (тест)"} ${money(request.price)}` : "Продолжить"}
        </Button>
      </div>
    </Adaptive>
  );
}
