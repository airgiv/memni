"use client";
import { RadioGroup } from "radix-ui";
import { cn } from "./cn";

/** Single-choice chips (Radix RadioGroup: arrow keys, aria-checked). */
export function Chips({ value, onValueChange, options, label, className }: { value: string; onValueChange: (v: string) => void; options: { value: string; label: string }[]; label: string; className?: string }) {
  return (
    <RadioGroup.Root value={value} onValueChange={onValueChange} aria-label={label} className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => (
        <RadioGroup.Item
          key={o.value}
          value={o.value}
          className="h-9 rounded-full border border-line px-3.5 text-[14px] text-fg-2 transition-colors hover:border-line-strong data-[state=checked]:border-transparent data-[state=checked]:bg-[#f5f5f7] data-[state=checked]:text-[#0b0b0d] lg:h-8 lg:text-[13px]"
        >
          {o.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
