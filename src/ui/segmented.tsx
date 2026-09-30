"use client";

export interface SegmentOption {
  value: string;
  label: string;
}

/** One choice from a few: a radiogroup of compact pills. */
export function Segmented({
  options,
  value,
  onChange,
  label,
  className = "",
}: {
  options: SegmentOption[];
  value: string;
  onChange: (v: string) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={`inline-flex flex-wrap gap-1 rounded-lg bg-black/40 p-1 ${className}`}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => !on && onChange(o.value)}
            className={`h-8 rounded-md px-3 text-[13px] font-medium transition-colors ${on ? "bg-fg text-bg" : "text-fg hover:bg-white/10"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
