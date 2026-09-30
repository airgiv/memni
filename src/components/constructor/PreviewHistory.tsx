"use client";
import { Badge, Spinner } from "@/ui/rapui";
import type { PublicPreview } from "@/lib/server/http";

/**
 * Every variant ever made for this role (or the scene). Picking an older one
 * is free — it only changes which image is shown and can be confirmed.
 * Variants made for other inputs stay visible, marked «прежние настройки».
 */
export function PreviewHistory({
  previews,
  selectedId,
  confirmedId,
  currentFingerprint,
  onSelect,
  label,
}: {
  previews: PublicPreview[];
  selectedId: string | null;
  confirmedId: string | null;
  currentFingerprint: string | null;
  onSelect: (id: string) => void;
  label: string;
}) {
  if (previews.length === 0) return null;
  const ordered = [...previews].reverse();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[0.8125rem] font-medium text-mute">{label}</p>
      <ul className="flex gap-tile overflow-x-auto pb-1 [scrollbar-width:thin]" aria-label={label}>
        {ordered.map((p) => {
          const stale = p.fingerprint !== currentFingerprint;
          const selected = p.id === selectedId;
          return (
            <li key={p.id} className="shrink-0">
              <button
                type="button"
                disabled={p.status !== "ready"}
                onClick={() => onSelect(p.id)}
                aria-pressed={selected}
                aria-label={`Вариант ${p.seq}${stale ? ", прежние настройки" : ""}${p.id === confirmedId ? ", подтверждён" : ""}`}
                className={`relative block h-32 w-[72px] overflow-hidden rounded-[16px] bg-fill transition-[box-shadow,opacity] duration-(--rap-dur-fast) ease-rm sm:h-36 sm:w-[81px] ${
                  selected ? "shadow-[0_0_0_3px_var(--rap-select)]" : ""
                } ${stale && !selected ? "opacity-55" : ""}`}
              >
                {p.status === "ready" && p.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.url} alt="" className="size-full object-cover fun:animate-fade-in" />
                )}
                {p.status === "pending" && (
                  <span className="grid size-full place-items-center text-mute">
                    <Spinner size="sm" label="Готовим" />
                  </span>
                )}
                {p.status === "failed" && (
                  <span className="grid size-full place-items-center px-1 text-center text-[0.6875rem] leading-tight text-danger">Ошибка</span>
                )}
                <span className="absolute top-1 left-1 rounded-pill bg-black/60 px-1.5 text-[0.6875rem] text-white">#{p.seq}</span>
                {p.id === confirmedId && (
                  <span className="absolute inset-x-1 bottom-1">
                    <Badge variant="success" size="sm">
                      ✓
                    </Badge>
                  </span>
                )}
              </button>
              {stale && p.status === "ready" && <p className="mt-1 w-[72px] text-[0.6875rem] leading-tight text-mute sm:w-[81px]">прежние настройки</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
