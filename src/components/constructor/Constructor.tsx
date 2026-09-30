"use client";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, EmptyState, FancyIcon, Skeleton, Spinner, toast } from "@/ui/rapui";
import { ArrowLeft } from "@/ui/icons";
import { Button } from "@/ui/Button";
import { api, ApiError } from "@/client/api";
import { money } from "@/client/money";
import type { ClientTemplate } from "@/lib/templates/client";
import type { DraftDTO, PersonDTO, PreviewDTO } from "@/lib/server/present";
import type { DraftOp } from "@/lib/server/services/drafts";
import type { Money } from "@/lib/domain/types";
import { useMe } from "../AppProvider";
import { useDraft } from "./useDraft";
import { ParticipantStep } from "./ParticipantStep";
import { PurchaseDialog, type PurchaseRequest } from "./PurchaseDialog";

/** ?s=1..N — participant, ?s=go — preview or video, ?s=preview — the shared preview */
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
  const paymentsLive = me?.config.paymentsLive ?? false;

  const loadPeople = useCallback(async () => {
    try {
      setPeople(await api<PersonDTO[]>("/api/people"));
    } catch {
      /* the strip just stays empty */
    }
  }, []);
  useEffect(() => {
    void loadPeople();
  }, [loadPeople]);

  const step: Step | null = useMemo(() => {
    const fromUrl = parseStep(search.get("s"), t.roles.length);
    if (fromUrl) return fromUrl;
    if (!draft) return null;
    // after a reload: continue where it stopped
    const open = draft.roles.findIndex((r) => !r.ready);
    if (open >= 0) return { kind: "person", index: open };
    return draft.previews.length ? { kind: "preview" } : { kind: "go" };
  }, [search, draft, t.roles.length]);
  const go = useCallback((s: Step) => router.push(`?s=${stepParam(s)}`, { scroll: false }), [router]);
  // a step derived after load is pinned in the URL, so uploading a photo never jumps ahead
  const pinned = search.get("s");
  useEffect(() => {
    if (!pinned && step) router.replace(`?s=${stepParam(step)}`, { scroll: false });
  }, [pinned, step, router]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [step?.kind, step?.kind === "person" ? step.index : -1]);

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

  /* ── paid actions ─────────────────────────────────────────────── */

  const requestPreview = async () => {
    if (!draft) return;
    const q = draft.quotes.preview;
    const send = async (purchaseKey?: string) => {
      try {
        await api(`/api/drafts/${draftId}/previews`, {
          method: "POST",
          json: q.free ? {} : { acceptAmountMinor: q.price?.amountMinor ?? null, purchaseKey },
        });
        await reload();
        go({ kind: "preview" });
      } catch (e) {
        if (e instanceof ApiError && e.status === 402) {
          // the offer changed (e.g. the free preview was used in another tab): show the real price
          await reload();
          toast("Бесплатное превью уже использовано — проверьте цену");
          return;
        }
        toast.error((e as Error).message);
        throw e;
      }
    };
    if (q.free) {
      setBusy("preview");
      try {
        await send();
      } finally {
        setBusy(null);
      }
    } else setPurchase({ title: "Превью", price: q.price, onConfirm: send });
  };

  const requestVideo = (mode: "preview" | "direct", previewId?: string) => {
    if (!draft) return;
    const price = draft.quotes.video.price;
    setPurchase({
      title: "Видео",
      price,
      onConfirm: async () => {
        try {
          const res = await api<{ job: { id: string } }>(`/api/drafts/${draftId}/video`, {
            method: "POST",
            json: { mode, previewId, acceptAmountMinor: price?.amountMinor ?? null },
          });
          router.push(`/orders/${res.job.id}`);
        } catch (e) {
          await reload();
          toast.error((e as Error).message);
          throw e;
        }
      },
    });
  };

  /* ── render ───────────────────────────────────────────────────── */

  if (error)
    return (
      <div className="page pt-10">
        <EmptyState
          icon={<FancyIcon icon="ghost" tone="plum" float />}
          title={error.status === 404 ? "Черновик не найден" : "Не удалось открыть"}
          action={
            <Link href="/">
              <Button variant="soft">К мемам</Button>
            </Link>
          }
        />
      </div>
    );
  if (!draft || !step)
    return (
      <div className="page grid gap-6 pt-4 lg:grid-cols-2">
        <Skeleton className="aspect-[3/4] w-full" />
        <div className="flex flex-col gap-3">
          <Skeleton height={36} width="70%" shape="pill" />
          <Skeleton height={160} />
        </div>
      </div>
    );

  let body: React.ReactNode;
  let primary: React.ReactNode = null;

  if (step.kind === "person") {
    const role = draft.roles[step.index];
    const last = step.index === t.roles.length - 1;
    body = <ParticipantStep template={t} draftId={draftId} index={step.index} role={role} savedPeople={people} change={change} reload={refresh} />;
    primary = (
      <Button variant="accent" size="lg" block disabled={!role.ready} onClick={() => go(last ? { kind: "go" } : { kind: "person", index: step.index + 1 })}>
        Дальше
      </Button>
    );
  } else if (!draft.ready) {
    const open = draft.roles.findIndex((r) => !r.ready);
    body = <EmptyState title="Добавьте фото всех участников" />;
    primary = (
      <Button variant="accent" size="lg" block onClick={() => go({ kind: "person", index: Math.max(0, open) })}>
        К участникам
      </Button>
    );
  } else if (step.kind === "go") {
    const q = draft.quotes.preview;
    const hasPreviews = draft.previews.length > 0;
    body = (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
        <Cast t={t} draft={draft} onOpen={(i) => go({ kind: "person", index: i })} />
        <div className="grid gap-tile">
          <Choice
            title={hasPreviews ? "Превью" : "Посмотреть превью"}
            hint={hasPreviews ? `${draft.previews.length} ${draft.previews.length === 1 ? "вариант" : "варианта"}` : q.free ? "Бесплатно" : money(q.price)}
            onClick={() => (hasPreviews ? go({ kind: "preview" }) : void requestPreview())}
            busy={busy === "preview"}
            disabledReason={draft.video.preview.ok ? undefined : draft.video.preview.problem}
          />
          <Choice
            title="Сразу видео"
            hint={draft.quotes.video.price ? money(draft.quotes.video.price) : "Тестовый запуск"}
            onClick={() => requestVideo("direct")}
            disabledReason={draft.video.direct.ok ? undefined : draft.video.direct.problem}
          />
        </div>
        <LastJob job={draft.video.lastJob} />
      </div>
    );
  } else {
    body = (
      <PreviewScreen
        t={t}
        draft={draft}
        busy={busy}
        onSelect={(id) => void change({ op: "select", previewId: id })}
        onMore={requestPreview}
        onVideo={(id) => requestVideo("preview", id)}
        onDirect={() => requestVideo("direct")}
        onEdit={() => go({ kind: "person", index: 0 })}
      />
    );
  }

  const back =
    step.kind === "person"
      ? step.index === 0
        ? `/m/${t.id}`
        : `?s=${step.index}`
      : step.kind === "go"
        ? `?s=${t.roles.length}`
        : "?s=go";

  return (
    <div className="page flex flex-col gap-4 pt-1 lg:pt-4">
      <Link href={back} className="flex w-fit items-center gap-1.5 rounded-pill py-1 pr-3 text-[0.9375rem] text-ink-2 hover:text-ink" aria-label="Назад">
        <ArrowLeft size={18} /> {t.title}
      </Link>
      <div key={stepParam(step)} className="fun:animate-fade-in">
        {body}
      </div>
      {primary && (
        <>
          <div className="hidden lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-12">
            <div />
            <div>{primary}</div>
          </div>
          <div className="fixed inset-x-0 bottom-0 z-30 bg-paper/95 px-4 pt-3 pb-[calc(var(--safe-bottom)+12px)] backdrop-blur-md lg:hidden">{primary}</div>
        </>
      )}
      <PurchaseDialog request={purchase} onClose={() => setPurchase(null)} paymentsLive={paymentsLive} />
    </div>
  );
}

/* ── pieces ─────────────────────────────────────────────────────── */

/** who replaces whom: the cutout from the video next to the user's photo */
function Cast({ t, draft, onOpen }: { t: ClientTemplate; draft: DraftDTO; onOpen: (index: number) => void }) {
  return (
    <ul className="flex flex-wrap justify-center gap-3" aria-label="Участники">
      {t.roles.map((r, i) => {
        const p = draft.roles[i].person;
        const main = p?.photos.find((x) => x.id === p.mainPhotoId) ?? p?.photos[0];
        return (
          <li key={r.id}>
            <button type="button" onClick={() => onOpen(i)} aria-label={`Участник ${i + 1}: изменить`} className="flex items-center rounded-card bg-surface p-1.5 hover:bg-fill-hover">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.cutout.src} alt="" className="h-20 w-15 rounded-[16px] object-cover" />
              <span className="px-1 text-mute">→</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {main && <img src={main.url} alt="" className="h-20 w-15 rounded-[16px] object-cover" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Choice({ title, hint, onClick, busy, disabledReason }: { title: string; hint: string; onClick: () => void; busy?: boolean; disabledReason?: string }) {
  const disabled = Boolean(disabledReason) || busy;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-24 items-center justify-between gap-4 rounded-card bg-surface px-6 py-5 text-left transition-colors duration-(--rap-dur-fast) ease-rm hover:bg-fill-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
    >
      <span className="flex flex-col gap-1">
        <span className="text-[1.25rem] font-medium tracking-[-0.02em]">{title}</span>
        {disabledReason && <span className="text-[0.8125rem] text-mute">{disabledReason}</span>}
      </span>
      {busy ? <Spinner size="sm" label="Создаём" /> : <span className="shrink-0 rounded-pill bg-fill px-3 py-1 text-[0.9375rem] font-medium">{hint}</span>}
    </button>
  );
}

function LastJob({ job }: { job: DraftDTO["video"]["lastJob"] }) {
  if (!job) return null;
  return (
    <Link href={`/orders/${job.id}`} className="self-center text-[0.9375rem] text-ink-2 underline-offset-4 hover:underline">
      Видео по этому черновику
    </Link>
  );
}

function PreviewScreen({
  t,
  draft,
  busy,
  onSelect,
  onMore,
  onVideo,
  onDirect,
  onEdit,
}: {
  t: ClientTemplate;
  draft: DraftDTO;
  busy: string | null;
  onSelect: (id: string) => void;
  onMore: () => Promise<void>;
  onVideo: (previewId: string) => void;
  onDirect: () => void;
  onEdit: () => void;
}) {
  const list = [...draft.previews].reverse();
  const selected = draft.previews.find((p) => p.id === draft.selectedPreviewId) ?? list.find((p) => p.status !== "failed") ?? list[0];
  const pending = draft.previews.some((p) => p.status === "pending");
  const q = draft.quotes.preview;
  const newLabel = (base: string) => `${base} · ${q.free ? "бесплатно" : money(q.price)}`;
  const videoPrice: Money | null = draft.quotes.video.price;

  const main = !selected ? null : selected.status === "pending" ? (
    <div className="absolute inset-0 grid place-items-center">
      <Skeleton className="absolute inset-0 rounded-none" />
      <span className="relative flex items-center gap-2 rounded-pill bg-surface px-4 py-2 text-[0.9375rem] shadow-pop">
        <Spinner size="sm" label="" /> Создаём превью
      </span>
    </div>
  ) : selected.status === "failed" ? (
    <div className="absolute inset-0 grid place-items-center p-8 text-center text-[0.9375rem] text-ink-2">{selected.error}</div>
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img key={selected.url} src={selected.url!} alt="Превью" className="absolute inset-0 size-full object-cover fun:animate-fade-in" />
  );

  const actual = Boolean(selected && selected.status === "ready" && selected.actual);
  return (
    <div className="grid items-start gap-5 pb-36 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-12 lg:pb-0">
      <figure className="mx-auto flex w-full max-w-[min(100%,calc(48dvh*9/16))] flex-col gap-2 lg:sticky lg:top-24 lg:max-w-[min(100%,calc((100dvh-8rem)*9/16))]">
        <div className="relative w-full overflow-hidden rounded-card bg-surface" style={{ aspectRatio: t.aspectRatio.replace(":", " / ") }}>
          {main}
          {selected?.status === "ready" && !selected.actual && (
            <span className="absolute top-3 left-3">
              <Badge variant="warning">для прежних фото</Badge>
            </span>
          )}
        </div>
        {selected?.isDemo && selected.status === "ready" && <figcaption className="text-[0.8125rem] text-mute">Демо: коллаж из ваших фото, не генерация</figcaption>}
      </figure>

      <div className="flex flex-col gap-5">
        {list.length > 1 && (
          <ul className="flex gap-tile overflow-x-auto pb-1 [scrollbar-width:none]" aria-label="Варианты">
            {list.map((p: PreviewDTO) => (
              <li key={p.id} className="shrink-0">
                <button
                  type="button"
                  disabled={p.status !== "ready"}
                  onClick={() => onSelect(p.id)}
                  aria-pressed={p.id === selected?.id}
                  aria-label={`Вариант ${p.seq}${p.actual ? "" : ", для прежних фото"}`}
                  className={`relative block h-28 w-[63px] overflow-hidden rounded-[14px] bg-fill focus-visible:outline-2 focus-visible:outline-ring ${
                    p.id === selected?.id ? "shadow-[0_0_0_3px_var(--rap-ring)]" : ""
                  } ${p.actual ? "" : "opacity-50"}`}
                >
                  {p.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.url} alt="" className="size-full object-cover" />
                  )}
                  {p.status === "pending" && (
                    <span className="grid size-full place-items-center">
                      <Spinner size="sm" label="" />
                    </span>
                  )}
                  {p.status === "failed" && <span className="grid size-full place-items-center text-[0.6875rem] text-danger">ошибка</span>}
                </button>
              </li>
            ))}
          </ul>
        )}

        {selected?.status === "ready" && !selected.actual && <Alert variant="warning" title="Фото или образ изменились">Создайте новое превью или сразу видео.</Alert>}

        {/* phone: the two actions stay under the thumb */}
        <div className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-tight bg-paper/95 px-4 pt-3 pb-[calc(var(--safe-bottom)+12px)] backdrop-blur-md lg:static lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          {actual ? (
            <Button variant="accent" size="lg" block disabled={!draft.video.preview.ok} onClick={() => onVideo(selected!.id)}>
              {`Создать видео${videoPrice ? ` · ${money(videoPrice)}` : ""}`}
            </Button>
          ) : (
            <Button variant="accent" size="lg" block disabled={pending} onClick={() => void onMore()} state={busy === "preview" ? "loading" : undefined}>
              {newLabel("Новое превью")}
            </Button>
          )}
          {actual ? (
            <Button variant="soft" size="lg" block disabled={pending} onClick={() => void onMore()} state={busy === "preview" ? "loading" : undefined}>
              {newLabel("Ещё вариант")}
            </Button>
          ) : (
            <Button variant="soft" size="lg" block disabled={!draft.video.direct.ok} onClick={onDirect}>
              {`Сразу видео${videoPrice ? ` · ${money(videoPrice)}` : ""}`}
            </Button>
          )}
          {!draft.video.preview.ok && <p className="text-[0.8125rem] text-mute">{draft.video.preview.problem}</p>}
        </div>
        <button type="button" onClick={onEdit} className="self-start text-[0.9375rem] text-ink-2 underline-offset-4 hover:underline">
          Изменить участников
        </button>
        <LastJob job={draft.video.lastJob} />
      </div>
    </div>
  );
}
