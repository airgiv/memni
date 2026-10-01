"use client";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "./cn";

/**
 * Modal built on Radix Dialog (focus trap, Escape, aria). Phones: a card
 * anchored to the bottom; desktop: a centred card of fixed width.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  closeLabel,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: React.ReactNode;
  closeLabel: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-[fade-in_160ms_ease-out]" />
        <D.Content
          className={cn(
            "fixed inset-x-2 bottom-[max(8px,var(--safe-bottom))] z-50 max-h-[85dvh] overflow-y-auto rounded-[22px] border border-line bg-surface p-5 shadow-2xl outline-none",
            "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[400px] sm:-translate-x-1/2 sm:-translate-y-1/2",
            className,
          )}
        >
          <div className="mb-1 flex items-start justify-between gap-3">
            <D.Title className="pt-1 text-[17px] font-semibold leading-snug">{title}</D.Title>
            <D.Close className="-mr-1.5 -mt-1 grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-white/[0.07] hover:text-fg" aria-label={closeLabel}>
              <X className="size-4" aria-hidden />
            </D.Close>
          </div>
          {description ? <D.Description className="mb-4 text-sm text-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
