"use client";
/** A finished (or in-progress) video: playback, download, share. */
import { useEffect, useState } from "react";
import { Download, Share } from "lucide-react";
import { useRouter } from "next/navigation";
import { api } from "@/client/api";
import { usePolling } from "@/client/hooks";
import { useI18n } from "@/i18n/client";
import { LOCALES } from "@/i18n/locales";
import type { PublicJob } from "@/lib/server/services/jobs";
import { Button } from "@/ui/button";
import { Spinner } from "@/ui/spinner";
import { shareLink } from "./meme/SocialRail";

export function VideoView({ id, titles }: { id: string; titles: Record<string, string> }) {
  const { m, fmt, locale } = useI18n();
  const router = useRouter();
  const [job, setJob] = useState<PublicJob | null | "missing">(null);
  const load = () => api<{ job: PublicJob }>(`/api/jobs/${id}`).then((r) => setJob(r.job), () => setJob("missing"));
  useEffect(() => void load(), [id]); // eslint-disable-line react-hooks/exhaustive-deps
  usePolling(() => void load(), 2000, Boolean(job && job !== "missing" && ["preparing", "generating", "finishing"].includes(job.stage)));

  if (job === null) return <main className="mx-auto max-w-3xl px-4 pt-12 text-muted"><Spinner /></main>;
  if (job === "missing") return <main className="mx-auto max-w-3xl px-4 pt-12 text-muted">{m.videos.notFound}</main>;
  const title = titles[job.memeId] ?? "Мемме";
  return (
    <main className="mx-auto max-w-3xl px-4 pb-[calc(var(--safe-bottom)+40px)] pt-8 sm:px-6 lg:pt-12">
      <h1 className="text-[26px] font-semibold tracking-tight">{title}</h1>
      <div className="mt-5 overflow-hidden rounded-2xl border border-line bg-black">
        {job.stage === "ready" ? (
          <video src={`/api/files/job/${job.id}`} poster={`/api/files/jobposter/${job.id}`} controls playsInline className="aspect-video w-full" />
        ) : (
          <div className="grid aspect-video place-items-center text-fg-2">
            <span className="flex items-center gap-2">
              {["preparing", "generating", "finishing"].includes(job.stage) && <Spinner />}
              {m.generation[job.stage]}
            </span>
          </div>
        )}
      </div>
      {job.stage === "ready" && (
        <>
          <p className="mt-3 text-[13px] text-muted">{fmt(m.result.duration, { seconds: (job.resultMeta?.durationSec ?? job.durationSec).toFixed(0) })}</p>
          {job.isDemo && <p className="mt-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-[13px] text-warning">{m.result.demoNote}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild variant="primary" size="md">
              <a href={`/api/files/job/${job.id}?download`} download>
                <Download className="size-4" aria-hidden />
                {m.result.download}
              </a>
            </Button>
            <Button variant="secondary" size="md" icon={<Share className="size-4" aria-hidden />} onClick={() => void shareLink(window.location.href, title, m)}>
              {m.result.share}
            </Button>
            <Button
              variant="ghost"
              size="md"
              onClick={async () => {
                if (!window.confirm(m.videos.confirmDelete)) return;
                await api(`/api/jobs/${job.id}`, { method: "DELETE" });
                router.push(`/${LOCALES[locale].segment}/videos`);
              }}
            >
              {m.videos.delete}
            </Button>
          </div>
        </>
      )}
      {job.errorKey && <p className="mt-4 text-[14px] text-fg-2">{m.generation.errors[job.errorKey as keyof typeof m.generation.errors]}</p>}
    </main>
  );
}
