"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Alert, EmptyState, FancyIcon, Skeleton, Spinner, toast } from "@/ui/rapui";
import { Download } from "@/ui/icons";
import { Button } from "@/ui/Button";
import { VideoPlayer } from "@/ui/VideoPlayer";
import { api, ApiError } from "@/client/api";
import { money } from "@/client/money";
import { usePolling } from "@/client/hooks";
import type { PublicJob } from "@/lib/server/services/jobs";

const ACTIVE = ["queued", "submitting", "generating", "assembling"];
const STATUS: Record<string, string> = {
  queued: "В очереди",
  submitting: "Создаём видео",
  generating: "Создаём видео",
  assembling: "Добавляем оригинальный звук",
};

type Order = { amountMinor: number | null; currency: string; priceIsExample: boolean; status: "test_paid" | "refunded" } | null;

export function OrderView({ jobId, templates }: { jobId: string; templates: { id: string; title: string; aspectRatio: string }[] }) {
  const router = useRouter();
  const [data, setData] = useState<{ job: PublicJob; order: Order } | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api(`/api/jobs/${jobId}`));
    } catch (e) {
      setError(e as ApiError);
    }
  }, [jobId]);
  useEffect(() => {
    void load();
  }, [load]);
  const job = data?.job;
  usePolling(() => void load(), 2000, Boolean(job && ACTIVE.includes(job.status)));

  if (error?.status === 404)
    return (
      <div className="page pt-16">
        <EmptyState icon={<FancyIcon icon="ghost" tone="plum" float />} title="Видео не найдено" />
      </div>
    );
  if (!job)
    return (
      <div className="page pt-4">
        <Skeleton className="mx-auto aspect-[9/16] w-full max-w-sm" />
      </div>
    );

  const t = templates.find((x) => x.id === job.templateId);
  const aspect = (t?.aspectRatio ?? "9:16").replace(":", " / ");
  const retry = async () => {
    setBusy(true);
    try {
      await api(`/api/jobs/${jobId}/retry`, { method: "POST" });
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const again = async () => {
    try {
      const { id } = await api<{ id: string }>("/api/drafts", { method: "POST", json: { templateId: job.templateId, fromDraftId: job.draftId } });
      router.push(`/create/${id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="page grid items-start gap-5 pt-2 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-12 lg:pt-6">
      <div className="mx-auto w-full max-w-[min(100%,calc(62dvh*9/16))] lg:max-w-[min(100%,calc((100dvh-8rem)*9/16))]">
        {job.status === "ready" ? (
          <div className="overflow-hidden rounded-card bg-surface">
            <VideoPlayer src={`/api/files/job/${job.id}`} poster={`/api/files/jobposter/${job.id}`} aspect={aspect} />
          </div>
        ) : (
          <div className="grid place-items-center rounded-card bg-surface p-8" style={{ aspectRatio: aspect }}>
            {ACTIVE.includes(job.status) ? <Spinner size="lg" label={STATUS[job.status]} /> : <FancyIcon icon={job.status === "needs_review" ? "info-circle" : "danger"} tone="flame" size={64} />}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 lg:pt-6">
        <h1 className="text-[1.75rem] leading-tight font-medium tracking-[-0.03em] lg:text-[2.5rem]">{t?.title ?? "Видео"}</h1>

        {ACTIVE.includes(job.status) && (
          <>
            <p className="text-[1.05rem]">{STATUS[job.status]}…</p>
            <p className="text-[0.875rem] text-mute">Можно закрыть страницу — видео будет в «Мои видео».</p>
          </>
        )}

        {job.status === "ready" && (
          <>
            {job.isDemo && <p className="text-[0.8125rem] text-mute">Демо: пример ролика с вашими фото в углу, не персональное видео.</p>}
            <div className="flex flex-col gap-tight sm:flex-row">
              <a href={`/api/files/job/${job.id}?download=1`} className="contents">
                <Button variant="accent" size="lg" block icon={<Download size={18} />} iconPosition="start">
                  Скачать
                </Button>
              </a>
              <Button variant="soft" size="lg" block onClick={again}>
                Сделать ещё
              </Button>
            </div>
          </>
        )}

        {job.status === "failed" && (
          <Alert variant="danger" title={job.error ?? "Видео не получилось"}>
            {job.retryable ? (
              <Button variant="soft" size="sm" className="mt-2" onClick={retry} state={busy ? "loading" : undefined}>
                Повторить
              </Button>
            ) : (
              <Link href={`/create/${job.draftId}?s=1`} className="mt-1 inline-block underline underline-offset-4">
                Изменить фото
              </Link>
            )}
          </Alert>
        )}
        {job.status === "needs_review" && <Alert variant="warning" title={job.error ?? "Проверяем видео вручную"} />}

        {data?.order && (
          <p className="text-[0.8125rem] text-mute">
            {data.order.status === "refunded" ? "Оплата возвращена" : "Оплачено"}
            {data.order.amountMinor ? ` · ${money({ amountMinor: data.order.amountMinor, currency: data.order.currency })}` : ""} · тестовая оплата, деньги не списаны
          </p>
        )}
      </div>
    </div>
  );
}
