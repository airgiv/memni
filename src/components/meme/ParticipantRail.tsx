"use client";
/**
 * Progress as faces: one round thumbnail per participant — the original
 * performer's face until a photo is added, then the new person. The active
 * one has a ring, completed ones a small tick, and a final circle leads to
 * review. No "step 1 of 2" text; each item has an accessible name and the
 * current one carries aria-current="step".
 */
import { Check, Clapperboard } from "lucide-react";
import { useI18n } from "@/i18n/client";
import type { DraftDTO } from "@/lib/server/present";
import type { ClientMeme } from "@/memes/client";
import { cn } from "@/ui/cn";

export function ParticipantRail({
  meme,
  draft,
  current,
  onSelect,
  onReview,
}: {
  meme: ClientMeme;
  draft: DraftDTO | null;
  current: string | "review" | null;
  onSelect: (roleId: string) => void;
  onReview: () => void;
}) {
  const { m, fmt } = useI18n();
  return (
    <nav aria-label={m.flow.participants}>
      <ol className="flex items-center gap-2.5">
        {meme.roles.map((r, i) => {
          const d = draft?.roles[i];
          const photo = d?.person?.photos.find((p) => p.id === d.person?.mainPhotoId) ?? d?.person?.photos[0];
          const done = Boolean(d?.ready);
          const active = current === r.id;
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onSelect(r.id)}
                aria-current={active ? "step" : undefined}
                aria-label={fmt(done ? m.flow.participantDone : m.flow.participantTodo, { name: r.name })}
                className={cn(
                  "relative block size-11 rounded-full p-[3px] transition-[box-shadow] lg:size-10",
                  active ? "shadow-[0_0_0_2px_#f5f5f7]" : "shadow-[0_0_0_1px_rgb(255_255_255/0.14)] hover:shadow-[0_0_0_1px_rgb(255_255_255/0.4)]",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo?.url ?? r.face} alt="" className="size-full rounded-full object-cover" />
                {done && (
                  <span className="absolute -bottom-0.5 -right-0.5 grid size-[18px] place-items-center rounded-full border-2 border-[#121214] bg-[#f5f5f7] text-[#0b0b0d]">
                    <Check className="size-2.5" strokeWidth={3.5} aria-hidden />
                  </span>
                )}
              </button>
            </li>
          );
        })}
        <li aria-hidden className="h-px w-3 bg-white/15" />
        <li>
          <button
            type="button"
            onClick={onReview}
            disabled={!draft?.ready}
            aria-current={current === "review" ? "step" : undefined}
            aria-label={m.flow.review}
            className={cn(
              "grid size-11 place-items-center rounded-full transition-[box-shadow,color] disabled:opacity-35 lg:size-10",
              current === "review" ? "text-fg shadow-[0_0_0_2px_#f5f5f7]" : "text-muted shadow-[0_0_0_1px_rgb(255_255_255/0.14)] enabled:hover:text-fg",
            )}
          >
            <Clapperboard className="size-[18px]" aria-hidden />
          </button>
        </li>
      </ol>
    </nav>
  );
}
