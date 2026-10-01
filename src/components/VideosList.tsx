"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/client/api";
import { usePolling } from "@/client/hooks";
import { useI18n } from "@/i18n/client";
import { LOCALES } from "@/i18n/locales";
import type { PublicJob } from "@/lib/server/services/jobs";
import { Spinner } from "@/ui/spinner";

export function VideosList() {
  const { m, locale, tag } = useI18n();
  const [jobs, setJobs] = useState<PublicJob[] | null>(null);
  const load = () => api<PublicJob[]>("/api/jobs").then(setJobs, () => setJobs([]));
  useEffect(() => void load(), []);
  usePolling(() => void load(), 3000, Boolean(jobs?.some((j) => ["preparing", "generating", "finishing"].includes(j.stage))));
  const seg = LOCALES[locale].segment;
  return (
    <main className="mx-auto max-w-5xl px-4 pb-[calc(var(--safe-bottom)+40px)] pt-8 sm:px-6 lg:pt-12">
      <h1 className="text-[30px] font-semibold tracking-tight">{m.videos.title}</h1>
      {jobs === null ? (
        <div className="mt-10 text-muted">
          <Spinner />
        </div>
      ) : jobs.length === 0 ? (
        <p className="mt-10 text-muted">{m.videos.empty}</p>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
          {jobs.map((j) => (
            <li key={j.id}>
              <Link href={`/${seg}/videos/${j.id}`} className="block overflow-hidden rounded-2xl border border-line bg-surface transition-colors hover:border-line-strong">
                <div className="grid aspect-video place-items-center bg-black">
                  {j.stage === "ready" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/files/jobposter/${j.id}`} alt="" className="size-full object-cover" />
                  ) : (
                    <span className="flex items-center gap-2 text-[13px] text-fg-2">
                      {["preparing", "generating", "finishing"].includes(j.stage) && <Spinner />}
                      {m.generation[j.stage]}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 p-3 text-[13px]">
                  <span className="text-fg-2">{new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short" }).format(new Date(j.createdAt))}</span>
                  {j.isDemo && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-fg-2">{m.common.demo}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
