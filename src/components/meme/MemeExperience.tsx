"use client";
/**
 * The meme page after hydration: the original video fills the viewport and
 * one persistent bottom widget carries everything — the landing, each
 * participant, review, the shared preview, generation and the result.
 *
 * Where you are lives in the URL (?d=draft&s=step&j=job), so reloads,
 * the Back button and switching language all return to the same place.
 * Server-rendered editorial content arrives as `children` and stays in the
 * initial HTML for crawlers; the sheet only reveals it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { api, ApiError } from "@/client/api";
import { useIsDesktop, usePolling } from "@/client/hooks";
import { errorText, useI18n } from "@/i18n/client";
import type { LocaleCode } from "@/i18n/locales";
import type { Money } from "@/lib/domain/types";
import type { DraftDTO, PreviewDTO } from "@/lib/server/present";
import type { PublicJob } from "@/lib/server/services/jobs";
import type { ClientMeme } from "@/memes/client";
import { Button, IconButton } from "@/ui/button";
import { Sheet } from "@/ui/sheet";
import { LanguageSelect } from "../LanguageSelect";
import { LocaleSuggestion, type SuggestionText } from "../LocaleSuggestion";
import { EdgeGlow } from "./EdgeGlow";
import { JobStep } from "./JobStep";
import { ParticipantRail } from "./ParticipantRail";
import { ParticipantStep } from "./ParticipantStep";
import { PreviewStep } from "./PreviewStep";
import { PurchaseDialog } from "./PurchaseDialog";
import { ReviewStep } from "./ReviewStep";
import { SocialRail } from "./SocialRail";
import { useDraft } from "./useDraft";
import { VideoStage } from "./VideoStage";

interface Nav {
  /** "" landing · "p:<roleId>" · "review" · "preview" · "video" */
  s: string;
  d: string | null;
  j: string | null;
}

function readNav(): Nav {
  const q = new URLSearchParams(window.location.search);
  return { s: q.get("s") ?? "", d: q.get("d"), j: q.get("j") };
}

function writeNav(n: Nav, push: boolean) {
  const q = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(n)) {
    if (v) q.set(k, v);
    else q.delete(k);
  }
  const qs = q.toString();
  const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
  if (push) window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

type Purchase = { kind: "preview" } | { kind: "video"; mode: "preview" | "direct"; previewId?: string };

export function MemeExperience({
  meme,
  alternates,
  suggestions,
  mediaReady,
  catalogHref,
  children,
}: {
  meme: ClientMeme;
  alternates: Partial<Record<LocaleCode, string>>;
  suggestions: Partial<Record<LocaleCode, SuggestionText>>;
  mediaReady: boolean;
  catalogHref: string;
  children: React.ReactNode;
}) {
  const { m } = useI18n();
  const desktop = useIsDesktop();
  const [nav, setNavState] = useState<Nav>({ s: "", d: null, j: null });
  const [expanded, setExpanded] = useState(false);
  const [collapsedH, setCollapsedH] = useState(0);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState<"video" | "preview" | null>(null);
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [priceOverride, setPriceOverride] = useState<Money | null>(null);
  const purchaseKey = useRef<string>("");
  const flowRef = useRef<HTMLDivElement>(null);
  const userNavigated = useRef(false);

  // the page itself never scrolls here
  useEffect(() => {
    document.documentElement.classList.add("stage-lock");
    return () => document.documentElement.classList.remove("stage-lock");
  }, []);

  // URL ⇄ state
  useEffect(() => {
    setNavState(readNav());
    const onPop = () => setNavState(readNav());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const navRef = useRef(nav);
  navRef.current = nav;
  const go = useCallback((patch: Partial<Nav>, push = true) => {
    userNavigated.current = true;
    // history first (outside any render/updater: Next's router listens to it), then state
    const next = { ...navRef.current, ...patch };
    navRef.current = next;
    writeNav(next, push);
    setNavState(next);
  }, []);

  const { draft, error: draftError, reload, mutate } = useDraft(nav.d);

  // job status, restored from the URL after a reload
  const [job, setJob] = useState<PublicJob | null>(null);
  const loadJob = useCallback(async () => {
    if (!nav.j) return;
    try {
      const r = await api<{ job: PublicJob }>(`/api/jobs/${nav.j}`);
      setJob(r.job);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) go({ s: "", j: null }, false);
    }
  }, [nav.j, go]);
  useEffect(() => {
    setJob(null);
    void loadJob();
  }, [loadJob]);
  const jobActive = Boolean(job && ["preparing", "generating", "finishing"].includes(job.stage));
  usePolling(() => void loadJob(), 2000, jobActive);

  // a draft id that no longer exists (deleted, other browser) → back to the landing
  useEffect(() => {
    if (draftError && draftError.status === 404) go({ s: "", d: null }, false);
  }, [draftError, go]);

  const step = nav.s.startsWith("p:") ? "participant" : nav.s === "review" || nav.s === "preview" || nav.s === "video" ? nav.s : "landing";
  const roleId = step === "participant" ? nav.s.slice(2) : null;
  const role = meme.roles.find((r) => r.id === roleId) ?? null;
  const roleIndex = role ? meme.roles.indexOf(role) : -1;
  const previewPending = Boolean(draft?.previews.some((p) => p.status === "pending"));

  // focus the widget content when the person moves between steps
  useEffect(() => {
    if (userNavigated.current && step !== "landing") flowRef.current?.focus({ preventScroll: true });
  }, [nav.s, step]);

  // a step that needs a draft but has none (e.g. a shared link) → landing
  useEffect(() => {
    if (step !== "landing" && step !== "video" && !nav.d) go({ s: "" }, false);
  }, [step, nav.d, go]);

  /* ── actions ───────────────────────────────────────────────────────── */

  const firstOpenRole = (d: DraftDTO) => meme.roles.find((_, i) => !d.roles[i]?.ready)?.id ?? null;

  const startFlow = async () => {
    setStarting(true);
    try {
      const { id } = await api<{ id: string }>("/api/drafts", { method: "POST", json: { memeId: meme.id } });
      const d = await api<DraftDTO>(`/api/drafts/${id}`);
      const open = firstOpenRole(d);
      setExpanded(false);
      go({ d: id, s: open ? `p:${open}` : "review", j: null });
    } catch (e) {
      toast.error(errorText(m, e));
    } finally {
      setStarting(false);
    }
  };

  const afterParticipant = () => {
    if (!draft) return;
    const after = meme.roles.slice(roleIndex + 1).find((r) => !draft.roles[meme.roles.indexOf(r)]?.ready);
    const any = firstOpenRole(draft);
    go({ s: after ? `p:${after.id}` : any ? `p:${any}` : "review" });
  };

  const requestPreview = async (accept?: Money) => {
    if (!draft) return;
    setBusy("preview");
    try {
      await api(`/api/drafts/${draft.id}/previews`, {
        method: "POST",
        json: accept ? { acceptAmountMinor: accept.amountMinor, acceptCurrency: accept.currency, purchaseKey: purchaseKey.current } : {},
      });
      setPurchase(null);
      await reload();
      go({ s: "preview" });
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) {
        const q = (e.data as { quote?: { price: Money } })?.quote;
        if (q) setPriceOverride(q.price);
        await reload();
        openPurchase({ kind: "preview" });
      } else toast.error(errorText(m, e));
    } finally {
      setBusy(null);
    }
  };

  const openPurchase = (p: Purchase) => {
    if (p.kind === "preview" && purchase?.kind !== "preview") purchaseKey.current = crypto.randomUUID();
    setPurchase(p);
  };

  const onPreviewClick = () => {
    if (!draft) return;
    if (draft.quotes.preview.free) void requestPreview();
    else {
      setPriceOverride(null);
      openPurchase({ kind: "preview" });
    }
  };

  const startVideo = async (p: Extract<Purchase, { kind: "video" }>, accept: Money) => {
    if (!draft) return;
    setBusy("video");
    try {
      const r = await api<{ job: PublicJob }>(`/api/drafts/${draft.id}/video`, {
        method: "POST",
        json: { mode: p.mode, previewId: p.previewId, acceptAmountMinor: accept.amountMinor, acceptCurrency: accept.currency },
      });
      setPurchase(null);
      setJob(r.job);
      go({ s: "video", j: r.job.id });
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) {
        const price = (e.data as { price?: Money })?.price;
        if (price) setPriceOverride(price);
      } else {
        toast.error(errorText(m, e));
        if (e instanceof ApiError && e.code === "stale_preview") await reload();
        setPurchase(null);
      }
    } finally {
      setBusy(null);
    }
  };

  const confirmPurchase = (price: Money) => {
    if (!purchase) return;
    if (purchase.kind === "preview") void requestPreview(price);
    else void startVideo(purchase, price);
  };

  const selectPreview = (p: PreviewDTO) => void mutate({ op: "select", previewId: p.id }).catch((e) => toast.error(errorText(m, e)));

  const retryJob = async () => {
    if (!job) return;
    setBusy("video");
    try {
      const r = await api<{ job: PublicJob }>(`/api/jobs/${job.id}/retry`, { method: "POST" });
      setJob(r.job);
    } catch (e) {
      toast.error(errorText(m, e));
    } finally {
      setBusy(null);
    }
  };

  const makeAnother = async () => {
    setStarting(true);
    try {
      const { id } = await api<{ id: string }>("/api/drafts", { method: "POST", json: { memeId: meme.id, fromDraftId: job?.draftId } });
      const d = await api<DraftDTO>(`/api/drafts/${id}`);
      setJob(null);
      go({ d: id, j: null, s: firstOpenRole(d) ? `p:${firstOpenRole(d)}` : "review" });
    } catch (e) {
      toast.error(errorText(m, e));
    } finally {
      setStarting(false);
    }
  };

  /* ── stage ─────────────────────────────────────────────────────────── */

  const resultReady = step === "video" && job?.stage === "ready";
  const stageSrc = resultReady ? `/api/files/job/${job!.id}` : mediaReady ? meme.media.video : null;
  const focal = role && !desktop ? role.focal : desktop ? meme.media.focal.desktop : meme.media.focal.mobile;
  const generating = previewPending && step === "preview" ? true : step === "video" && jobActive;
  const badge = resultReady && job?.isDemo ? m.stage.resultDemo : meme.media.placeholder ? m.stage.placeholder : null;
  const purchasePrice = useMemo(() => {
    if (!purchase || !draft) return null;
    return priceOverride ?? (purchase.kind === "preview" ? draft.quotes.preview.price : draft.quotes.video.price);
  }, [purchase, draft, priceOverride]);

  /* ── sheet content ─────────────────────────────────────────────────── */

  const landingPeek = (
    <div className="px-5 pb-[calc(var(--safe-bottom)+18px)] pt-1 lg:px-7 lg:pb-6">
      <h1 className="text-[26px] font-semibold leading-tight tracking-tight lg:text-[28px]">{meme.title}</h1>
      <p className="mt-1 text-[15px] text-fg-2">{meme.tagline}</p>
      <Button variant="primary" size="lg" className="mt-4 w-full" loading={starting} onClick={() => void startFlow()} disabled={!mediaReady}>
        {m.landing.replacePeople}
      </Button>
    </div>
  );

  const landingBody = (
    <div className="px-5 pb-[calc(var(--safe-bottom)+28px)] lg:px-7">
      {children}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <Link href={catalogHref} className="text-[14px] font-medium text-fg-2 underline-offset-4 hover:text-fg hover:underline">
          {m.landing.allMemes}
        </Link>
        <LanguageSelect alternates={alternates} className="min-w-[150px]" />
      </div>
    </div>
  );

  const flowHeader = (
    <div className="flex items-center justify-between gap-3 pb-3.5">
      <ParticipantRail meme={meme} draft={draft} current={role?.id ?? (step === "review" ? "review" : null)} onSelect={(id) => go({ s: `p:${id}` })} onReview={() => go({ s: "review" })} />
      <IconButton label={m.flow.closeEditor} onClick={() => go({ s: "" })}>
        <X className="size-5" aria-hidden />
      </IconButton>
    </div>
  );

  let flow: React.ReactNode = null;
  if (step !== "landing") {
    let content: React.ReactNode;
    if (step === "video") {
      content = <JobStep job={job} title={meme.title} onRetry={() => void retryJob()} onEdit={() => go({ s: `p:${meme.roles[0].id}`, j: null })} onAnother={() => void makeAnother()} busy={busy === "video" || starting} />;
    } else if (!draft) {
      content = <div className="h-40" aria-busy />;
    } else if (step === "participant" && role) {
      content = <ParticipantStep key={role.id} meme={meme} role={role} data={draft.roles[roleIndex] ?? null} draft={draft} mutate={mutate} reload={reload} onContinue={afterParticipant} />;
    } else if (step === "review") {
      content = draft.ready ? (
        <ReviewStep meme={meme} draft={draft} busy={busy} onEdit={(id) => go({ s: `p:${id}` })} onPreview={onPreviewClick} onCreateVideo={() => { setPriceOverride(null); openPurchase({ kind: "video", mode: "direct" }); }} />
      ) : null;
    } else if (step === "preview") {
      content = (
        <PreviewStep
          draft={draft}
          busy={busy}
          onSelect={selectPreview}
          onCreateVideo={(p) => { setPriceOverride(null); openPurchase({ kind: "video", mode: "preview", previewId: p.id }); }}
          onCreateDirect={() => { setPriceOverride(null); openPurchase({ kind: "video", mode: "direct" }); }}
          onNewVersion={onPreviewClick}
          onEdit={() => go({ s: `p:${meme.roles[0].id}` })}
        />
      );
    }
    flow = (
      <div ref={flowRef} tabIndex={-1} className="px-5 pt-4 outline-none lg:px-7 lg:pt-5">
        {step !== "video" && flowHeader}
        {content}
      </div>
    );
  }

  // review without a complete cast (e.g. a photo was removed elsewhere) → first open participant
  useEffect(() => {
    if (step === "review" && draft && !draft.ready) {
      const open = firstOpenRole(draft);
      if (open) go({ s: `p:${open}` }, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, draft]);

  return (
    <>
      <VideoStage
        src={stageSrc}
        webm={resultReady ? null : meme.media.videoWebm}
        poster={meme.media.poster}
        media={{ w: meme.media.width, h: meme.media.height }}
        focal={focal}
        spotlight={role?.region ?? null}
        dimmed={generating}
        badge={badge}
        missingText={!mediaReady ? m.stage.mediaMissing : null}
      />
      <EdgeGlow on={generating} />
      <Link
        href={catalogHref}
        aria-label={m.nav.home}
        className="fixed left-4 top-[calc(var(--safe-top)+18px)] z-20 text-[17px] font-semibold tracking-tight text-white/90 [text-shadow:0_1px_12px_rgb(0_0_0/0.5)] hover:text-white lg:left-6 lg:top-6"
      >
        {m.brand}
      </Link>
      <SocialRail memeId={meme.id} title={meme.title} bottom={collapsedH + (desktop ? 24 : 0) + 16} active={step === "landing" && !expanded && collapsedH > 0} />
      {step === "landing" && <LocaleSuggestion alternates={alternates} texts={suggestions} />}
      <Sheet
        expanded={step === "landing" && expanded}
        onExpandedChange={setExpanded}
        labels={{ expand: m.sheet.expand, collapse: m.sheet.collapse, region: step === "landing" ? meme.title : m.flow.participants }}
        onCollapsedHeight={step === "landing" ? setCollapsedH : undefined}
        peek={step === "landing" ? landingPeek : flow}
        body={step === "landing" ? landingBody : undefined}
      />
      {purchase && draft && purchasePrice && (
        <PurchaseDialog
          open
          onOpenChange={(v) => !v && setPurchase(null)}
          kind={purchase.kind}
          price={purchasePrice}
          billing={draft.billing}
          durationSec={meme.durationSec}
          busy={busy !== null}
          onConfirm={confirmPurchase}
          onBillingChanged={async () => {
            setPriceOverride(null);
            await reload();
          }}
        />
      )}
    </>
  );
}
