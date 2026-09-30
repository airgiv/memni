"use client";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/ui/button";
import { Spinner } from "@/ui/spinner";
import { api, ApiError } from "@/client/api";
import type { ClientTemplate } from "@/lib/templates/client";
import type { DraftDTO, PersonDTO } from "@/lib/server/present";
import type { DraftOp } from "@/lib/server/services/drafts";
import { useMe } from "../AppProvider";
import { useDraft } from "./useDraft";
import { ParticipantStep } from "./ParticipantStep";
import { PurchaseDialog, type PurchaseRequest } from "./PurchaseDialog";
import { StepStrip } from "./StepStrip";

/** ?s=1..N — a person, ?s=go — summary with the two actions, ?s=preview — the shared photo preview */
type Step = { kind: "person"; index: number } | { kind: "go" } | { kind: "preview" };

function parseStep(s: string | null, total: number): Step | null {
  if (s === "go" || s === "preview") return { kind: s };
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 && n <= total ? { kind: "person", index: n - 1 } : null;
}
const stepParam = (s: Step) => (s.kind === "person" ? String(s.index + 1) : s.kind);

export function Constructor({ template: t }: { template: ClientTemplate }) {
  const { draftId } = useParams<{ draftId: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const { draft, error, reload, mutate } = useDraft(draftId);
  const { me } = useMe();
  const [people, setPeople] = useState<PersonDTO[]>([]);
  const [purchase, setPurchase] = useState<PurchaseRequest | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadPeople = useCallback(async () => {
    try {
      setPeople(await api<PersonDTO[]>("/api/people"));
    } catch {
      /* no saved people shown */
    }
  }, []);
  useEffect(() => {
    void loadPeople();
  }, [loadPeople]);

  const step: Step | null = useMemo(() => {
    const fromUrl = parseStep(search.get("s"), t.roles.length);
    if (fromUrl) return fromUrl;
    if (!draft) return null;
    const open = draft.roles.findIndex((r) => !r.ready);
    if (open >= 0) return { kind: "person", index: open };
    return draft.previews.length ? { kind: "preview" } : { kind: "go" };
  }, [search, draft, t.roles.length]);
  const go = useCallback((s: Step) => router.push(`?s=${stepParam(s)}`, { scroll: false }), [router]);
  // a derived step is pinned in the URL, so adding a photo never jumps ahead; «назад» keeps everything
  const pinned = search.get("s");
  useEffect(() => {
    if (!pinned && step) router.replace(`?s=${stepParam(step)}`, { scroll: false });
  }, [pinned, step, router]);

  const change = useCallback(
    async (op: DraftOp) => {
      try {
        return await mutate(op);
      } catch (e) {
        toast.error((e as Error).message);
      }
    },
    [mutate],
  );
  const refresh = useCallback(async () => {
    await Promise.all([reload(), loadPeople()]);
  }, [reload, loadPeople]);

  const requestPreview = () => {
    if (!draft) return;
    const q = draft.quotes.preview;
    const send = async (purchaseKey?: string) => {
      try {
        await api(`/api/drafts/${draftId}/previews`, { method: "POST", json: q.free ? {} : { acceptAmountMinor: q.price?.amountMinor ?? null, purchaseKey } });
        await reload();
        go({ kind: "preview" });
      } catch (e) {
        await reload();
        toast.error(e instanceof ApiError && e.status === 402 ? "Цена изменилась — проверьте ещё раз" : (e as Error).message);
        throw e;
      }
    };
    if (q.free) {
      // the button itself says «бесплатно»: no hidden charge, so no extra dialog
      setBusy("preview");
      void send().finally(() => setBusy(null));
    } else setPurchase({ title: "Фото-превью", price: q.price, onConfirm: send });
  };

  const requestVideo = (mode: "preview" | "direct", previewId?: string) => {
    if (!draft) return;
    const price = draft.quotes.video.price;
    setPurchase({
      title: "Создать видео",
      price,
      onConfirm: async () => {
        try {
          const res = await api<{ job: { id: string } }>(`/api/drafts/${draftId}/video`, { method: "POST", json: { mode, previewId, acceptAmountMinor: price?.amountMinor ?? null } });
          router.push(`/orders/${res.job.id}`);
        } catch (e) {
          await reload();
          toast.error((e as Error).message);
          throw e;
        }
      },
    });
  };

  if (error)
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 pt-24 text-center">
        <p>{error.status === 404 ? "Черновик не найден" : error.message}</p>
        <Link href="/" className="rounded-lg bg-surface-2 px-4 py-2 text-[14px]">
          К мемам
        </Link>
      </div>
    );
  if (!draft || !step)
    return (
      <div className="grid place-items-center pt-32">
        <Spinner label="Загружаем" />
      </div>
    );

  const current = step.kind === "person" ? step.index : "final";
  const back = step.kind === "person" ? (step.index === 0 ? `/m/${t.id}` : `?s=${step.index}`) : step.kind === "go" ? `?s=${t.roles.length}` : "?s=go";

  let body: React.ReactNode;
  if (step.kind === "person") {
    const last = step.index === t.roles.length - 1;
    body = (
      <ParticipantStep
        key={step.index}
        template={t}
        draftId={draftId}
        index={step.index}
        role={draft.roles[step.index]}
        savedPeople={people}
        change={change}
        reload={refresh}
        nextLabel="Дальше"
        onNext={() => go(last ? { kind: "go" } : { kind: "person", index: step.index + 1 })}
      />
    );
  } else if (!draft.ready) {
    const open = draft.roles.findIndex((r) => !r.ready);
    body = (
      <div className="flex flex-col items-start gap-3 pt-6">
        <p>Добавьте фото всех участников</p>
        <Button onClick={() => go({ kind: "person", index: Math.max(0, open) })}>К участникам</Button>
      </div>
    );
  } else if (step.kind === "go") {
    body = <Summary t={t} draft={draft} busy={busy} onEdit={(i) => go({ kind: "person", index: i })} onVideo={() => requestVideo("direct")} onPreview={() => (draft.previews.length ? go({ kind: "preview" }) : requestPreview())} />;
  } else {
    body = (
      <PreviewScreen
        t={t}
        draft={draft}
        onSelect={(id) => void change({ op: "select", previewId: id })}
        onMore={requestPreview}
        onVideo={(id) => requestVideo("preview", id)}
        onDirect={() => requestVideo("direct")}
        onEdit={() => go({ kind: "person", index: 0 })}
      />
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 pt-3 md:gap-4 md:px-6 md:pt-5">
      <div className="flex items-center gap-3">
        <Link href={back} aria-label="Назад" className="grid size-11 place-items-center rounded-lg text-muted hover:bg-surface hover:text-fg md:size-10">
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <StepStrip t={t} draft={draft} current={current} onPerson={(i) => go({ kind: "person", index: i })} onFinal={() => go(draft.previews.length ? { kind: "preview" } : { kind: "go" })} />
      </div>
      {body}
      <PurchaseDialog request={purchase} onClose={() => setPurchase(null)} paymentsLive={me?.config.paymentsLive ?? false} />
    </div>
  );
}

/* ── after the people: who replaces whom, and the two ways on ─────── */

function Summary({
  t,
  draft,
  busy,
  onEdit,
  onVideo,
  onPreview,
}: {
  t: ClientTemplate;
  draft: DraftDTO;
  busy: string | null;
  onEdit: (i: number) => void;
  onVideo: () => void;
  onPreview: () => void;
}) {
  const q = draft.quotes.preview;
  const hasPreviews = draft.previews.length > 0;
  return (
    <div className="flex flex-col gap-5 md:mx-auto md:w-full md:max-w-2xl md:pt-6">
      <ul className="flex flex-wrap justify-center gap-3" aria-label="Участники">
        {t.roles.map((r, i) => {
          const p = draft.roles[i].person;
          const main = p?.photos.find((x) => x.id === p.mainPhotoId) ?? p?.photos[0];
          return (
            <li key={r.id}>
              <button type="button" onClick={() => onEdit(i)} aria-label={`${r.name}: изменить`} className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1.5 hover:border-border-strong">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.cutout.src} alt="" className="h-28 w-21 rounded-lg object-cover object-top md:h-32 md:w-24" />
                <span className="px-1 text-muted" aria-hidden>
                  →
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {main && <img src={main.url} alt="" className="h-28 w-21 rounded-lg object-cover md:h-32 md:w-24" />}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-2 md:flex-row md:justify-center">
        <Button onClick={onVideo} disabled={!draft.video.direct.ok} className="max-md:h-12">
          Создать видео
        </Button>
        <Button variant="secondary" onClick={onPreview} loading={busy === "preview"} disabled={!draft.video.preview.ok} className="max-md:h-12">
          {hasPreviews ? "Фото-превью" : "Сначала фото-превью"}
          {!hasPreviews && q.free && <span className="font-normal text-success">· бесплатно</span>}
        </Button>
      </div>
      {!draft.video.direct.ok && <p className="text-center text-[13px] text-muted">{draft.video.direct.problem}</p>}
      {draft.video.lastJob && (
        <Link href={`/orders/${draft.video.lastJob.id}`} className="self-center text-[13px] text-muted underline-offset-4 hover:text-fg hover:underline">
          Уже созданное видео
        </Link>
      )}
    </div>
  );
}

/* ── the shared photo preview ──────────────────────────────────────── */

function PreviewScreen({
  t,
  draft,
  onSelect,
  onMore,
  onVideo,
  onDirect,
  onEdit,
}: {
  t: ClientTemplate;
  draft: DraftDTO;
  onSelect: (id: string) => void;
  onMore: () => void;
  onVideo: (id: string) => void;
  onDirect: () => void;
  onEdit: () => void;
}) {
  const list = [...draft.previews].reverse();
  const selected = draft.previews.find((p) => p.id === draft.selectedPreviewId) ?? list.find((p) => p.status !== "failed") ?? list[0];
  const pending = draft.previews.some((p) => p.status === "pending");
  const actual = Boolean(selected && selected.status === "ready" && selected.actual);
  const q = draft.quotes.preview;

  return (
    <div className="flex flex-col gap-3">
      <figure className="flex flex-col gap-1.5">
        <div className="relative overflow-hidden rounded-xl bg-black" style={{ aspectRatio: t.aspectRatio.replace(":", " / ") }}>
          {selected?.status === "ready" && selected.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selected.url} alt="Фото-превью" className={`absolute inset-0 size-full object-contain ${selected.actual ? "" : "opacity-50"}`} />
          )}
          {selected?.status === "pending" && (
            <div className="absolute inset-0 grid place-items-center">
              <span className="flex items-center gap-2 rounded-lg bg-black/70 px-3 py-2 text-[14px]">
                <Spinner className="size-4" /> Создаём превью
              </span>
            </div>
          )}
          {selected?.status === "failed" && <div className="absolute inset-0 grid place-items-center p-6 text-center text-danger">{selected.error}</div>}
          {selected?.status === "ready" && !selected.actual && (
            <span className="absolute top-2 left-2 rounded-md bg-black/75 px-2 py-1 text-[12px] text-warning">для прежних фото</span>
          )}
        </div>
        {selected?.isDemo && selected.status === "ready" && <figcaption className="text-[12px] text-muted">Демо: коллаж из ваших фото, не генерация</figcaption>}
      </figure>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {list.length > 1 ? (
          <ul className="flex gap-2 overflow-x-auto" aria-label="Варианты">
            {list.map((p) => (
              <li key={p.id} className="shrink-0">
                <button
                  type="button"
                  disabled={p.status !== "ready"}
                  onClick={() => onSelect(p.id)}
                  aria-pressed={p.id === selected?.id}
                  aria-label={`Вариант ${p.seq}${p.actual ? "" : ", для прежних фото"}`}
                  className={`relative block h-11 w-20 overflow-hidden rounded-md border-2 bg-surface ${p.id === selected?.id ? "border-accent" : "border-transparent hover:border-border-strong"} ${
                    p.actual ? "" : "opacity-50"
                  }`}
                >
                  {p.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.url} alt="" className="size-full object-cover" />
                  ) : (
                    <span className="grid size-full place-items-center">{p.status === "pending" ? <Spinner className="size-4" /> : <span className="text-[11px] text-danger">ошибка</span>}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <span className="hidden md:block" />
        )}
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <Button variant="ghost" onClick={onEdit} className="max-md:order-3 max-md:h-11">
            Изменить людей
          </Button>
          {selected?.status !== "pending" && (
          <Button variant="secondary" onClick={onMore} disabled={pending || !draft.video.preview.ok} className="max-md:order-2 max-md:h-12">
            {actual ? "Ещё вариант" : "Новое превью"}
            {q.free && <span className="font-normal text-success">· бесплатно</span>}
          </Button>
          )}
          {actual ? (
            <Button onClick={() => onVideo(selected!.id)} className="max-md:order-1 max-md:h-12">
              Создать видео
            </Button>
          ) : selected?.status === "pending" ? null : (
            <Button onClick={onDirect} disabled={!draft.video.direct.ok || pending} className="max-md:order-1 max-md:h-12">
              Создать видео без превью
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
