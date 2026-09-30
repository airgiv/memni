"use client";
import { Check, Film } from "lucide-react";
import type { ClientTemplate } from "@/lib/templates/client";
import type { DraftDTO } from "@/lib/server/present";

/**
 * Progress without counters: the source people as thumbnails, the current one
 * outlined, filled ones ticked, then a small final-step icon. Every item is a
 * button with an accessible name; the current one carries aria-current="step".
 */
export function StepStrip({
  t,
  draft,
  current,
  onPerson,
  onFinal,
}: {
  t: ClientTemplate;
  draft: DraftDTO;
  current: number | "final";
  onPerson: (index: number) => void;
  onFinal: () => void;
}) {
  return (
    <nav aria-label="Шаги">
      <ol className="flex items-center gap-2">
        {t.roles.map((r, i) => {
          const d = draft.roles[i];
          const isCurrent = current === i;
          const done = d.ready;
          const main = d.person?.photos.find((p) => p.id === d.person?.mainPhotoId) ?? d.person?.photos[0];
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onPerson(i)}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`${r.name}${done ? ", фото добавлены" : ""}`}
                className={`relative block size-11 overflow-hidden rounded-lg border-2 transition-colors md:size-10 ${
                  isCurrent ? "border-accent" : "border-transparent opacity-70 hover:opacity-100"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.cutout.src} alt="" className="size-full object-cover object-top" />
                {done && main && (
                  // the person who replaces them, in the corner: the link between the two stays visible
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={main.url} alt="" className="absolute right-0 bottom-0 size-5 rounded-tl-md border-t border-l border-bg object-cover" />
                )}
                {done && (
                  <span className="absolute top-0.5 left-0.5 grid size-4 place-items-center rounded-full bg-success text-bg">
                    <Check className="size-3" strokeWidth={3} aria-hidden />
                  </span>
                )}
              </button>
            </li>
          );
        })}
        <li aria-hidden className="h-px w-3 bg-border" />
        <li>
          <button
            type="button"
            onClick={onFinal}
            disabled={!draft.ready}
            aria-current={current === "final" ? "step" : undefined}
            aria-label="Видео"
            className={`grid size-11 place-items-center rounded-lg border-2 bg-surface transition-colors disabled:opacity-40 md:size-10 ${
              current === "final" ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"
            }`}
          >
            <Film className="size-5" aria-hidden />
          </button>
        </li>
      </ol>
    </nav>
  );
}
