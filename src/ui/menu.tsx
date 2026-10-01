"use client";
import { DropdownMenu as M } from "radix-ui";

/** Small action menu (Radix DropdownMenu). */
export function Menu({ trigger, items }: { trigger: React.ReactNode; items: { label: string; onSelect: () => void; danger?: boolean }[] }) {
  return (
    <M.Root>
      <M.Trigger asChild>{trigger}</M.Trigger>
      <M.Portal>
        <M.Content sideOffset={6} align="start" className="z-[60] min-w-[160px] rounded-xl border border-line bg-surface-2 p-1 shadow-2xl">
          {items.map((i) => (
            <M.Item
              key={i.label}
              onSelect={i.onSelect}
              className={`flex h-10 cursor-default select-none items-center rounded-lg px-3 text-[15px] outline-none data-[highlighted]:bg-white/[0.08] lg:h-8 lg:text-sm ${i.danger ? "text-danger" : "text-fg-2 data-[highlighted]:text-fg"}`}
            >
              {i.label}
            </M.Item>
          ))}
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}
