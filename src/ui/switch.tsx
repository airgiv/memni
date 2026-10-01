"use client";
import { Switch as S } from "radix-ui";
import { cn } from "./cn";

/** Small on/off switch with a visible label (Radix Switch, role="switch"). */
export function Switch({ checked, onCheckedChange, label, id, disabled, className }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string; id: string; disabled?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <S.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="relative h-[22px] w-[38px] shrink-0 rounded-full bg-white/15 transition-colors data-[state=checked]:bg-[#f5f5f7] disabled:opacity-40"
      >
        <S.Thumb className="block size-[18px] translate-x-[2px] rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-[#0b0b0d]" />
      </S.Root>
      <label htmlFor={id} className="cursor-pointer text-[13px] text-fg-2 [.flex-row-reverse>&]:text-right">
        {label}
      </label>
    </span>
  );
}
