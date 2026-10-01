"use client";
/** Generation state and the finished result, inside the same widget. */
import { Download, RotateCcw, Share } from "lucide-react";
import { useI18n } from "@/i18n/client";
import type { PublicJob } from "@/lib/server/services/jobs";
import { Button } from "@/ui/button";
import { ActionBar } from "@/ui/action-bar";
import { Spinner } from "@/ui/spinner";
import { shareLink } from "./SocialRail";

export function JobStep({
  job,
  title,
  onRetry,
  onEdit,
  onAnother,
  busy,
}: {
  job: PublicJob | null;
  title: string;
  onRetry: () => void;
  onEdit: () => void;
  onAnother: () => void;
  busy: boolean;
}) {
  const { m, fmt } = useI18n();
  if (!job) {
    return (
      <div className="flex items-center gap-3 pb-[calc(var(--safe-bottom)+20px)] pt-2 text-fg-2">
        <Spinner /> {m.common.loading}
      </div>
    );
  }
  const stage = job.stage;
  if (stage === "ready") {
    const url = `/api/files/job/${job.id}`;
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-[19px] font-semibold">{m.result.title}</h2>
          <p className="text-[13px] text-muted">{fmt(m.result.duration, { seconds: (job.resultMeta?.durationSec ?? job.durationSec).toFixed(0) })}</p>
        </div>
        {job.isDemo && <p className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-[13px] text-warning">{m.result.demoNote}</p>}
        <ActionBar className="lg:flex-row">
          <Button asChild variant="primary" size="lg" className="w-full lg:flex-1">
            <a href={`${url}?download`} download>
              <Download className="size-[18px]" aria-hidden />
              {m.result.download}
            </a>
          </Button>
          <Button variant="secondary" size="lg" className="w-full lg:flex-1" icon={<Share className="size-[18px]" aria-hidden />} onClick={() => void shareLink(`${window.location.origin}${window.location.pathname.replace(/\/memes\/.*/, "")}/videos/${job.id}`, title, m)}>
            {m.result.share}
          </Button>
          <Button variant="ghost" size="md" className="w-full lg:w-auto" loading={busy} onClick={onAnother}>
            {m.result.makeAnother}
          </Button>
        </ActionBar>
      </div>
    );
  }
  if (stage === "failed" || stage === "review") {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-[19px] font-semibold">{m.generation[stage]}</h2>
          {job.errorKey && <p className="mt-1 text-[14px] text-fg-2">{m.generation.errors[job.errorKey as keyof typeof m.generation.errors]}</p>}
        </div>
        <ActionBar className="lg:flex-row">
          {job.retryable && (
            <Button variant="primary" size="lg" className="w-full lg:flex-1" loading={busy} icon={<RotateCcw className="size-[18px]" aria-hidden />} onClick={onRetry}>
              {m.generation.retryFree}
            </Button>
          )}
          <Button variant="secondary" size="lg" className="w-full lg:flex-1" onClick={onEdit}>
            {m.preview.edit}
          </Button>
        </ActionBar>
      </div>
    );
  }
  const order = ["preparing", "generating", "finishing"] as const;
  const idx = order.indexOf(stage);
  return (
    <div className="flex flex-col gap-4 pb-[calc(var(--safe-bottom)+20px)] lg:pb-6" aria-live="polite">
      <ol className="flex flex-col gap-2.5">
        {order.map((s, i) => (
          <li key={s} className={`flex items-center gap-3 text-[15px] ${i === idx ? "text-fg" : i < idx ? "text-muted" : "text-faint"}`} aria-current={i === idx ? "step" : undefined}>
            <span className="grid size-5 place-items-center">{i === idx ? <Spinner /> : <span className={`size-1.5 rounded-full ${i < idx ? "bg-fg-2" : "bg-white/20"}`} />}</span>
            {m.generation[s]}
          </li>
        ))}
      </ol>
      <p className="text-[13px] text-muted">{m.generation.leaveNote}</p>
    </div>
  );
}
