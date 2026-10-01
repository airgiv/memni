import { forwardRef } from "react";
import { Slot } from "radix-ui";
import { cn } from "./cn";
import { Spinner } from "./spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background-color,border-color,color] duration-150 disabled:pointer-events-none disabled:opacity-40";

const variants: Record<Variant, string> = {
  primary: "bg-[#f5f5f7] text-[#0b0b0d] hover:bg-[#dedee3] active:bg-[#cfcfd6]",
  secondary: "border border-line bg-white/[0.07] text-fg hover:border-line-strong hover:bg-white/[0.11]",
  ghost: "text-fg-2 hover:bg-white/[0.06] hover:text-fg",
  danger: "text-danger hover:bg-danger/10",
};

/** Touch-first sizes that tighten on desktop (lg ≥ 1024 px): 44/48 px targets on phones, 36/40 px on desktop. */
const sizes: Record<Size, string> = {
  sm: "h-8 rounded-lg px-3 text-[13px]",
  md: "h-11 rounded-xl px-4 text-[15px] lg:h-9 lg:rounded-[10px] lg:px-3.5 lg:text-sm",
  lg: "h-12 rounded-[14px] px-5 text-base lg:h-10 lg:rounded-xl lg:px-4 lg:text-[15px]",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
  asChild?: boolean;
}

/**
 * The label never moves or animates: loading swaps only the leading icon
 * for a spinner and marks the button busy.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, icon, asChild, className, children, disabled, ...rest },
  ref,
) {
  const cls = cn(base, variants[variant], sizes[size], className);
  if (asChild) {
    return (
      <Slot.Root ref={ref} className={cls} {...rest}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button ref={ref} type="button" className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
});

/** Round icon-only button. `glass` sits on top of video. */
export const IconButton = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: "glass" | "plain"; size?: "sm" | "md" }>(
  function IconButton({ label, tone = "plain", size = "md", className, children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        className={cn(
          "inline-grid shrink-0 place-items-center rounded-full transition-[background-color,border-color,color] duration-150 disabled:opacity-40",
          size === "md" ? "size-11 lg:size-10" : "size-9 lg:size-8",
          tone === "glass"
            ? "border border-white/12 bg-black/35 text-white backdrop-blur-md hover:bg-black/55"
            : "text-fg-2 hover:bg-white/[0.07] hover:text-fg",
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
