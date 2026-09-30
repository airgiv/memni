"use client";
import { useEffect, useState } from "react";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { money } from "@/client/money";
import type { Money } from "@/lib/domain/types";

export interface PurchaseRequest {
  title: string;
  price: Money | null;
  /** runs with a stable key: retrying the same confirmation never pays twice */
  onConfirm: (purchaseKey: string) => Promise<void>;
}

/** The exact price, shown before any paid generation starts. Nothing happens until the user confirms here. */
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
    } catch {
      /* the caller already showed the error */
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={request !== null} onOpenChange={(v) => !v && !busy && onClose()} title={request?.title ?? ""}>
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-[28px] font-semibold tracking-tight">{request?.price ? money(request.price) : "Без оплаты"}</p>
          {!paymentsLive && <p className="text-[13px] text-muted">Тестовый режим — деньги не спишутся</p>}
        </div>
        <Button onClick={confirm} loading={busy} className="max-sm:h-12 max-sm:w-full sm:self-end">
          {request?.price ? `Оплатить ${money(request.price)}` : "Продолжить"}
        </Button>
      </div>
    </Dialog>
  );
}
