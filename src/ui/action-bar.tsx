import { cn } from "./cn";

/**
 * The primary action of a step. Sticks to the bottom of the widget while the
 * step's content scrolls, so it is always fully visible.
 */
export function ActionBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 -mx-5 mt-1 flex flex-col gap-2 bg-gradient-to-t from-[#121214] from-70% to-[#121214]/0 px-5 pb-[calc(var(--safe-bottom)+16px)] pt-5 lg:-mx-7 lg:flex-row-reverse lg:px-7 lg:pb-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
