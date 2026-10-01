"use client";
/**
 * The one shared preview: every participant together. Versions made for the
 * current settings can be approved; older ones stay visible but are marked
 * and can't be used for the video.
 */
import { AlertCircle } from "lucide-react";
import { useI18n } from "@/i18n/client";
import type { DraftDTO, PreviewDTO } from "@/lib/server/present";
import { Button } from "@/ui/button";
import { ActionBar } from "@/ui/action-bar";
import { cn } from "@/ui/cn";
import { Spinner } from "@/ui/spinner";

export function PreviewStep({
  draft,
  onSelect,
  onCreateVideo,
  onCreateDirect,
  onNewVersion,
  onEdit,
  busy,
}: {
  draft: DraftDTO;
  onSelect: (p: PreviewDTO) => void;
  onCreateVideo: (p: PreviewDTO) => void;
  onCreateDirect: () => void;
  onNewVersion: () => void;
  onEdit: () => void;
  busy: "video" | "preview" | null;
}) {
  const { m, fmt } = useI18n();
  const list = [...draft.previews].sort((a, b) => a.seq - b.seq);
  const pending = list.find((p) => p.status === "pending");
  const selected = list.find((p) => p.id === draft.selectedPreviewId) ?? [...list].reverse().find((p) => p.status === "ready");
  const shown = pending ?? selected ?? list[list.length - 1];

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-[19px] font-semibold">{m.preview.title}</h2>
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-line bg-black" aria-live="polite">
        {shown?.status === "ready" && shown.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown.url} alt={fmt(m.preview.alt, { n: shown.seq })} className={cn("size-full object-cover", !shown.actual && "opacity-60")} />
        ) : shown?.status === "pending" ? (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-[14px] text-fg-2">
            <Spinner className="size-5" />
            {m.preview.making}
          </div>
        ) : shown?.status === "failed" ? (
          <div className="flex size-full items-center justify-center p-6 text-center text-[14px] text-fg-2">
            {m.preview.errors[(shown.errorKey ?? "preview_failed") as keyof typeof m.preview.errors] ?? m.preview.errors.preview_failed}
          </div>
        ) : null}
        {shown?.status === "ready" && !shown.actual && (
          <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2.5 py-1 text-[12px] text-fg-2">{m.preview.outdated}</span>
        )}
      </div>
      {shown?.isDemo && shown.status === "ready" && <p className="text-[12px] text-faint">{m.preview.demoNote}</p>}

      {list.length > 1 && (
        <div>
          <p className="mb-2 text-[13px] text-muted">{m.preview.versions}</p>
          <ul className="flex gap-2 overflow-x-auto pb-1">
            {list.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={p.status !== "ready"}
                  onClick={() => onSelect(p)}
                  aria-pressed={p.id === selected?.id}
                  aria-label={`${fmt(m.preview.version, { n: p.seq })}${p.actual ? "" : ` — ${m.preview.outdated}`}`}
                  className={cn(
                    "relative block h-12 w-[86px] overflow-hidden rounded-lg border transition-colors",
                    p.id === selected?.id ? "border-[#f5f5f7]" : "border-line hover:border-line-strong",
                    !p.actual && "opacity-50",
                  )}
                >
                  {p.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.url} alt="" className="size-full object-cover" />
                  ) : (
                    <span className="grid size-full place-items-center text-muted">{p.status === "pending" ? <Spinner /> : <AlertCircle className="size-4" aria-hidden />}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {selected && !selected.actual && !pending && <p className="text-[13px] text-warning">{m.preview.outdatedNote}</p>}

      <ActionBar>
        {!pending &&
          (selected?.actual ? (
            <Button variant="primary" size="lg" className="w-full lg:flex-1" loading={busy === "video"} disabled={busy !== null} onClick={() => onCreateVideo(selected)}>
              {m.preview.createFromThis}
            </Button>
          ) : (
            <Button variant="primary" size="lg" className="w-full lg:flex-1" loading={busy === "video"} disabled={busy !== null || !draft.video.direct.ok} onClick={onCreateDirect}>
              {m.preview.createWithout}
            </Button>
          ))}
        {!pending && (
          <Button variant="secondary" size="lg" className="w-full lg:flex-1" loading={busy === "preview"} disabled={busy !== null} onClick={onNewVersion}>
            {m.preview.newVersion}
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[12px] font-medium text-fg-2">{draft.quotes.preview.free ? m.review.previewFree : m.review.previewPaid}</span>
          </Button>
        )}
        <Button variant="ghost" size="md" className="w-full lg:w-auto" onClick={onEdit}>
          {m.preview.edit}
        </Button>
      </ActionBar>
    </div>
  );
}
