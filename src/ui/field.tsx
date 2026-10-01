import { forwardRef } from "react";
import { cn } from "./cn";

const field =
  "w-full rounded-xl border border-line bg-white/[0.05] px-3.5 text-[15px] text-fg placeholder:text-faint transition-colors hover:border-line-strong focus:border-line-strong focus:outline-none focus-visible:outline-2 focus-visible:outline-ring lg:rounded-[10px] lg:text-sm";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(field, "h-11 lg:h-9", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(field, "min-h-[72px] resize-none py-2.5", className)} {...rest} />;
});
