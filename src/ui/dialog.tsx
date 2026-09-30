"use client";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import type { ReactNode } from "react";

/** A small centred dialog on desktop, a bottom sheet on phones (Radix: focus trap, Esc, labels). */
export function Dialog({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <D.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border border-border bg-surface p-5 pb-[calc(var(--safe-bottom)+20px)] shadow-2xl sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-[380px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-5"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <D.Title className="text-[17px] font-semibold">{title}</D.Title>
            <D.Close className="grid size-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg" aria-label="Закрыть">
              <X className="size-4" />
            </D.Close>
          </div>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
