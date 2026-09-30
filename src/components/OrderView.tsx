"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/ui/button";
import { Spinner } from "@/ui/spinner";
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
type Order = { amountMinor: number | null; currency: string; status: "test_paid" | "refunded" } | null;

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

  if (error?.status === 404) return <p className="px-4 pt-24 text-center">Видео не найдено</p>;
  if (!job)
    return (
      <div className="grid place-items-center pt-32">
        <Spinner label="Загружаем" />
      </div>
    );

  const t = templates.find((x) => x.id === job.templateId);
  const aspect = (t?.aspectRatio ?? "16:9").replace(":", " / ");
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
    <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 pt-4 md:px-6 md:pt-8">
      <div className="overflow-hidden rounded-xl bg-black" style={{ aspectRatio: aspect }}>
        {job.status === "ready" ? (
          <video src={`/api/files/job/${job.id}`} poster={`/api/files/jobposter/${job.id}`} controls playsInline preload="metadata" className="size-full" aria-label="Готовое видео со звуком" />
        ) : (
          <div className="grid size-full place-items-center p-6 text-center">
            {ACTIVE.includes(job.status) ? (
              <span className="flex items-center gap-2 text-[15px]" role="status">
                <Spinner className="size-5" /> {STATUS[job.status]}
              </span>
            ) : (
              <span className="text-danger">{job.error}</span>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-[20px] font-semibold tracking-tight">{t?.title ?? "Видео"}</h1>
          {ACTIVE.includes(job.status) && <p className="text-[13px] text-muted">Можно закрыть страницу — видео будет в «Мои видео»</p>}
          {job.status === "ready" && job.isDemo && <p className="text-[13px] text-warning">Демо: фрагмент мема с вашими фото в углу и оригинальным звуком, не генерация</p>}
          {job.status === "needs_review" && <p className="text-[13px] text-warning">{job.error}</p>}
          {data?.order && (
            <p className="text-[13px] text-muted">
              {data.order.status === "refunded" ? "Оплата возвращена" : "Оплачено"}
              {data.order.amountMinor ? ` ${money({ amountMinor: data.order.amountMinor, currency: data.order.currency })}` : ""} · тестовый режим, без списания
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 md:flex-row">
          {job.status === "ready" && (
            <>
              <a href={`/api/files/job/${job.id}?download=1`} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-[14px] font-medium text-accent-fg hover:bg-accent-hover md:h-10">
                <Download className="size-4" aria-hidden /> Скачать
              </a>
              <Button variant="secondary" onClick={again} className="max-md:h-12">
                Сделать ещё
              </Button>
            </>
          )}
          {job.status === "failed" &&
            (job.retryable ? (
              <Button onClick={retry} loading={busy} className="max-md:h-12">
                Повторить
              </Button>
            ) : (
              <Link href={`/create/${job.draftId}?s=1`} className="inline-flex h-12 items-center justify-center rounded-lg bg-surface-2 px-4 text-[14px] hover:bg-[#2a2a2f] md:h-10">
                Изменить фото
              </Link>
            ))}
        </div>
      </div>
    </div>
  );
}
