"use client";
/** Everyone is set: who replaces whom, then one main action and one secondary. */
import { ArrowRight } from "lucide-react";
import { useI18n } from "@/i18n/client";
import type { DraftDTO } from "@/lib/server/present";
import type { ClientMeme } from "@/memes/client";
import { Button } from "@/ui/button";
import { ActionBar } from "@/ui/action-bar";

export function ReviewStep({
  meme,
  draft,
  onEdit,
  onCreateVideo,
  onPreview,
  busy,
}: {
  meme: ClientMeme;
  draft: DraftDTO;
  onEdit: (roleId: string) => void;
  onCreateVideo: () => void;
  onPreview: () => void;
  busy: "video" | "preview" | null;
}) {
  const { m, fmt } = useI18n();
  const direct = draft.video.direct;
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-[19px] font-semibold">{m.review.title}</h2>
      <ul className="flex flex-col gap-1">
        {meme.roles.map((r, i) => {
          const d = draft.roles[i];
          const photo = d.person?.photos.find((p) => p.id === d.person?.mainPhotoId) ?? d.person?.photos[0];
          const outfit = d.look ? (d.look.outfit.resolvedPresetId ? `${meme.outfitLabels[d.look.outfit.optionId]} · ${meme.outfitLabels[d.look.outfit.resolvedPresetId]}` : meme.outfitLabels[d.look.outfit.optionId]) : "";
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onEdit(r.id)}
                aria-label={fmt(m.review.editPerson, { name: r.name })}
                className="-mx-2 flex w-[calc(100%+16px)] items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-white/[0.05]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.face} alt="" className="size-10 rounded-full object-cover opacity-80" />
                <ArrowRight className="size-4 shrink-0 text-faint" aria-hidden />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo?.url ?? r.face} alt="" className="size-10 rounded-full object-cover" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">
                    {d.person?.name} <span className="text-muted">· {r.name}</span>
                  </span>
                  <span className="block truncate text-[13px] text-muted">{outfit}</span>
                </span>
                <span className="text-[13px] text-muted">{m.common.edit}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {draft.video.scope === "face-only" && <p className="text-[13px] text-warning">{m.review.scopeFaceOnly}</p>}
      {!direct.ok && direct.problem && <p className="text-[13px] text-muted">{m.errors.unsupported[direct.problem]}</p>}
      {draft.video.isDemo && <p className="text-[12px] text-faint">{m.review.demoNote}</p>}
      <ActionBar>
        <Button variant="primary" size="lg" className="w-full lg:flex-1" onClick={onCreateVideo} loading={busy === "video"} disabled={!direct.ok || busy !== null}>
          {m.review.createVideo}
        </Button>
        <Button variant="secondary" size="lg" className="w-full lg:flex-1" onClick={onPreview} loading={busy === "preview"} disabled={!draft.video.preview.ok || busy !== null}>
          {m.review.previewFirst}
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[12px] font-medium text-fg-2">{draft.quotes.preview.free ? m.review.previewFree : m.review.previewPaid}</span>
        </Button>
      </ActionBar>
    </div>
  );
}
