import { forwardRef, type InputHTMLAttributes } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className = "", ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={`h-10 w-full rounded-lg border border-border bg-surface px-3 text-[14px] text-fg placeholder:text-muted hover:border-border-strong focus-visible:border-ring ${className}`}
      {...rest}
    />
  );
});
