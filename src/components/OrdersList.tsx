"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, EmptyState, FancyIcon, Skeleton, type BadgeVariant } from "@/ui/rapui";
import { Button } from "@/ui/Button";
import { api } from "@/client/api";
import type { PublicJob } from "@/lib/server/services/jobs";

const STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  queued: { label: "В очереди", variant: "neutral" },
  submitting: { label: "Генерация", variant: "blue" },
  generating: { label: "Генерация", variant: "blue" },
  assembling: { label: "Сборка", variant: "blue" },
  ready: { label: "Готово", variant: "success" },
  failed: { label: "Ошибка", variant: "danger" },
  needs_review: { label: "Проверка", variant: "warning" },
};

export function OrdersList({ titles }: { titles: Record<string, string> }) {
  const [jobs, setJobs] = useState<PublicJob[] | null>(null);
  useEffect(() => {
    api<PublicJob[]>("/api/jobs").then(setJobs).catch(() => setJobs([]));
  }, []);
  return (
    <div className="page flex flex-col gap-5 pt-2 md:pt-6">
      <h1 className="text-[1.75rem] font-medium tracking-[-0.03em]">Мои видео</h1>
      {!jobs ? (
        <Skeleton height={200} />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={<FancyIcon icon="clapperboard" tone="flame" float />}
          title="Видео пока нет"
          action={
            <Link href="/">
              <Button variant="accent">К мемам</Button>
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-tile sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((j) => (
            <li key={j.id}>
              <Link href={`/orders/${j.id}`} className="flex flex-col gap-2 rounded-card bg-surface p-5 hover:bg-fill-hover">
                <div className="flex flex-wrap gap-tight">
                  <Badge variant={STATUS[j.status]?.variant ?? "neutral"} live={["queued", "submitting", "generating", "assembling"].includes(j.status)}>
                    {STATUS[j.status]?.label ?? j.status}
                  </Badge>
                  {j.isDemo && <Badge variant="warning">демо</Badge>}
                </div>
                <span className="text-[1.25rem] font-medium tracking-[-0.02em]">{titles[j.templateId] ?? j.templateId}</span>
                <span className="text-[0.8125rem] text-mute">{new Date(j.createdAt).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
