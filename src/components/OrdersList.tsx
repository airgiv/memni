"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Spinner } from "@/ui/spinner";
import { api } from "@/client/api";
import type { PublicJob } from "@/lib/server/services/jobs";

const STATUS: Record<string, string> = {
  queued: "В очереди",
  submitting: "Создаётся",
  generating: "Создаётся",
  assembling: "Создаётся",
  ready: "Готово",
  failed: "Ошибка",
  needs_review: "Проверяем",
};

export function OrdersList({ titles }: { titles: Record<string, string> }) {
  const [jobs, setJobs] = useState<PublicJob[] | null>(null);
  useEffect(() => {
    api<PublicJob[]>("/api/jobs").then(setJobs).catch(() => setJobs([]));
  }, []);
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 pt-5 md:px-6 md:pt-8">
      <h1 className="text-[20px] font-semibold tracking-tight">Мои видео</h1>
      {!jobs ? (
        <Spinner label="Загружаем" />
      ) : jobs.length === 0 ? (
        <p className="text-muted">
          Пока нет. <Link href="/" className="text-fg underline underline-offset-4">К мемам</Link>
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {jobs.map((j) => (
            <li key={j.id}>
              <Link href={`/orders/${j.id}`} className="block overflow-hidden rounded-xl border border-border bg-surface hover:border-border-strong">
                <div className="aspect-video bg-black">
                  {j.status === "ready" && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/files/jobposter/${j.id}`} alt="" className="size-full object-cover" loading="lazy" />
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 px-3 py-2 text-[13px]">
                  <span className="truncate font-medium">{titles[j.templateId] ?? j.templateId}</span>
                  <span className={j.status === "failed" ? "text-danger" : j.status === "ready" ? "text-success" : "text-muted"}>{STATUS[j.status]}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
