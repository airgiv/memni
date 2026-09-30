"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, EmptyState, FancyIcon, Skeleton, Spinner, toast } from "@/ui/rapui";
import { VideoPlayer } from "@/ui/VideoPlayer";
import { Check, Download, Lock, RefreshCw, Volume2 } from "@/ui/icons";
import { api, ApiError, formatPrice } from "@/client/api";
import { usePolling } from "@/client/hooks";
import { rolesWord } from "@/lib/templates";
import type { PublicJob } from "@/lib/server/services/jobs";
import type { Order } from "@/lib/domain/types";
import { Adaptive } from "./constructor/PersonPicker";

const STAGES = [
  { key: "queue", label: "В очереди", statuses: ["queued"] },
  { key: "gen", label: "Генерация видео", statuses: ["submitting", "generating"] },
  { key: "mix", label: "Сборка с оригинальным звуком", statuses: ["assembling"] },
  { key: "done", label: "Готово", statuses: ["ready"] },
];
const ACTIVE = ["queued", "submitting", "generating", "assembling"];

type T = { id: string; title: string; roles: number; aspectRatio: string; durationSec: number };

export function OrderView({ jobId, templates }: { jobId: string; templates: T[] }) {
  const router = useRouter();
  const [data, setData] = useState<{ job: PublicJob; order: Order | null } | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [another, setAnother] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api(`/api/jobs/${jobId}`));
      setError(null);
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
        <EmptyState icon={<FancyIcon icon="ghost" tone="plum" float />} title="Видео не найдено" description="Возможно, оно удалено или создано в другом браузере." />
      </div>
    );
  if (!job)
    return (
      <div className="page flex flex-col gap-4 pt-8">
        <Skeleton height={40} width="50%" shape="pill" />
        <Skeleton height={320} />
      </div>
    );

  const t = templates.find((x) => x.id === job.input.templateId);
  const stageIndex = STAGES.findIndex((s) => s.statuses.includes(job.status));

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
  const makeAnother = async (templateId: string) => {
    try {
      const { id } = await api<{ id: string }>("/api/drafts", { method: "POST", json: { templateId, fromDraftId: job.draftId } });
      router.push(`/create/${id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="page grid gap-8 pt-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:pt-10">
      <div className="mx-auto w-full max-w-[min(100%,calc(70dvh*9/16))]">
        {job.status === "ready" ? (
          <div className="flex flex-col gap-2">
            <div className="overflow-hidden rounded-card bg-ink">
              <VideoPlayer src={`/api/files/job/${job.id}`} poster={`/api/files/jobscene/${job.id}`} aspect={(t?.aspectRatio ?? "9:16").replace(":", " / ")} title={t?.title} />
            </div>
            {job.isDemo && (
              <p className="text-[0.8125rem] text-mute">
                Демо-ролик: исходный клип шаблона с вашим подтверждённым кадром в углу и оригинальным звуком. Это пример работы сборки, а не персональное видео.
              </p>
            )}
          </div>
        ) : (
          <div className="grid place-items-center rounded-card bg-surface px-8 py-10 text-center lg:aspect-[9/16]">
            {ACTIVE.includes(job.status) ? (
              <div className="flex flex-col items-center gap-4">
                <Spinner size="lg" label="Видео создаётся" />
                <p className="text-[1rem] font-medium">{STAGES[stageIndex]?.label}…</p>
                <p className="text-[0.875rem] text-mute">Страницу можно закрыть — видео сохранится в «Мои видео».</p>
              </div>
            ) : (
              <FancyIcon icon={job.status === "needs_review" ? "info-circle" : "danger"} tone="flame" size={72} />
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-tight">
            {job.isDemo && <Badge variant="warning">Демо</Badge>}
            {data?.order && <Badge variant="neutral">Тестовый заказ</Badge>}
          </div>
          <h1 className="text-[2rem] leading-tight font-medium tracking-[-0.03em]">{t?.title ?? "Видео"}</h1>
          <p className="flex items-center gap-2 text-[0.9375rem] text-ink-2">
            {t && `${t.durationSec} с · ${rolesWord(job.input.roles.length)} · `}
            <Volume2 size={16} /> оригинальный звук
          </p>
        </div>

        <ol className="flex flex-col gap-tight" aria-label="Этапы">
          {STAGES.map((s, i) => {
            const done = job.status === "ready" ? true : i < stageIndex;
            const current = i === stageIndex && job.status !== "ready";
            return (
              <li key={s.key} className={`flex items-center gap-3 rounded-row px-4 py-3 ${current ? "bg-surface" : "bg-fill"}`} aria-current={current ? "step" : undefined}>
                <span className={`grid size-7 place-items-center rounded-full ${done ? "bg-success text-white" : current ? "bg-blue text-white" : "bg-fill-strong text-mute"}`}>
                  {done ? <Check size={15} /> : current ? <Spinner size={14} label="" /> : i + 1}
                </span>
                <span className={`text-[0.9375rem] ${current ? "font-medium" : done ? "" : "text-mute"}`}>{s.label}</span>
              </li>
            );
          })}
        </ol>

        {job.status === "failed" && (
          <Alert
            variant="danger"
            title="Видео не получилось"
            action={
              job.retryable ? (
                <Button icon={<RefreshCw size={15} />} iconPosition="start" size="sm" variant="soft" onClick={retry} state={busy ? "loading" : undefined}>
                  Повторить
                </Button>
              ) : undefined
            }
          >
            {job.error}
            {job.retryable
              ? ` Осталось попыток: ${job.maxAttempts - job.attempts}.`
              : job.attempts >= job.maxAttempts
                ? " Попытки для этого видео закончились — можно изменить фото сцены и запустить заново."
                : ""}
          </Alert>
        )}
        {job.status === "needs_review" && (
          <Alert variant="warning" title="Нужна ручная проверка">
            {job.error} Мы не запускаем повторную генерацию автоматически, чтобы не списать деньги дважды.
          </Alert>
        )}

        {job.status === "ready" && (
          <div className="flex flex-col gap-tight sm:flex-row">
            <a href={`/api/files/job/${job.id}?download=1`} className="contents">
              <Button icon={<Download size={18} />} iconPosition="start" variant="accent" size="lg" block>
                Скачать видео
              </Button>
            </a>
            <Button variant="soft" size="lg" block onClick={() => setAnother(true)}>
              Другой мем с теми же людьми
            </Button>
          </div>
        )}
        {job.status === "ready" && job.resultMeta && (
          <p className="text-[0.8125rem] text-mute">
            Проверено при сборке: длительность {job.resultMeta.durationSec.toFixed(1)} с, звук {job.resultMeta.hasAudio ? "есть" : "нет"}.
          </p>
        )}

        {data?.order && (
          <div className="flex flex-col gap-3 rounded-card bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[1rem] font-medium">Оплата</p>
              <Badge variant="neutral">тест</Badge>
            </div>
            <p className="text-[0.9375rem] text-ink-2">
              {data.order.amountMinor ? formatPrice({ amountMinor: data.order.amountMinor, currency: data.order.currency, isExample: data.order.priceIsExample }) : "Цена не определена"}.
              Это тестовый заказ — деньги не списаны. Настоящая оплата подключится после выбора страны продавца и расчёта себестоимости.
            </p>
            <div className="flex flex-col gap-tight sm:flex-row">
              <Button icon={<Lock size={15} />} iconPosition="start" variant="soft" block disabled>
                Картой — скоро
              </Button>
              <Button icon={<Lock size={15} />} iconPosition="start" variant="soft" block disabled>
                Telegram Stars — скоро
              </Button>
            </div>
          </div>
        )}

        <Link href="/orders" className="text-[0.9375rem] text-blue">
          Все мои видео
        </Link>
      </div>

      <Adaptive open={another} onOpenChange={setAnother} title="Какой мем сделать?" description="Люди из этого видео будут назначены на роли по порядку — их можно поменять.">
        <ul className="flex flex-col gap-tight pt-2">
          {templates.map((x) => (
            <li key={x.id}>
              <button type="button" onClick={() => makeAnother(x.id)} className="flex w-full items-center justify-between rounded-row bg-fill px-4 py-3 text-left hover:bg-fill-hover">
                <span className="font-medium">{x.title}</span>
                <span className="text-[0.8125rem] text-mute">{rolesWord(x.roles)}</span>
              </button>
            </li>
          ))}
        </ul>
      </Adaptive>
    </div>
  );
}
