"use client";
import { Select as S } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "./cn";

export interface SelectOption {
  value: string;
  label: string;
}

/** Compact dropdown (Radix Select: keyboard, typeahead, aria). */
export function Select({
  value,
  onValueChange,
  options,
  label,
  id,
  className,
  disabled,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: SelectOption[];
  /** accessible name */
  label: string;
  id?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <S.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <S.Trigger
        id={id}
        aria-label={label}
        className={cn(
          "inline-flex h-11 min-w-0 items-center justify-between gap-2 rounded-xl border border-line bg-white/[0.05] px-3.5 text-[15px] text-fg transition-colors hover:border-line-strong lg:h-9 lg:rounded-[10px] lg:text-sm",
          "data-[placeholder]:text-muted",
          className,
        )}
      >
        <span className="truncate">
          <S.Value />
        </span>
        <S.Icon>
          <ChevronDown className="size-4 text-muted" aria-hidden />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content position="popper" sideOffset={6} className="z-[60] max-h-[min(360px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-line bg-surface-2 p-1 shadow-2xl">
          <S.Viewport>
            {options.map((o) => (
              <S.Item
                key={o.value}
                value={o.value}
                className="relative flex h-10 cursor-default select-none items-center rounded-lg pl-8 pr-3 text-[15px] text-fg-2 outline-none data-[highlighted]:bg-white/[0.08] data-[highlighted]:text-fg lg:h-8 lg:text-sm"
              >
                <S.ItemIndicator className="absolute left-2.5">
                  <Check className="size-3.5" aria-hidden />
                </S.ItemIndicator>
                <S.ItemText>{o.label}</S.ItemText>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}
