"use client";
/**
 * The one persistent widget at the bottom of the meme page.
 *
 * Two layouts:
 *  - with `body`: two stable positions. Collapsed shows only `peek` (title and
 *    primary action); expanded rises to nearly the full viewport and only the
 *    body scrolls. Drag (touch, mouse, pen), wheel/trackpad, the handle button
 *    and the keyboard all move it.
 *  - without `body`: the widget fits its content (up to a max height, then
 *    scrolls inside) — used by the creation steps.
 *
 * Dragging down from the body collapses the sheet only when the body is
 * already scrolled to its top and the gesture started there, so normal
 * reading never dismisses it.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "./cn";

const DRAG_THRESHOLD = 6;
const FLICK_VELOCITY = 0.45; // px/ms
const WHEEL_EXPAND = 30;
const WHEEL_COLLAPSE = 140;

function useViewportHeight() {
  const [h, setH] = useState(0);
  useEffect(() => {
    const read = () => setH(Math.round(window.visualViewport?.height ?? window.innerHeight));
    read();
    window.addEventListener("resize", read);
    window.visualViewport?.addEventListener("resize", read);
    return () => {
      window.removeEventListener("resize", read);
      window.visualViewport?.removeEventListener("resize", read);
    };
  }, []);
  return h;
}

/** env(safe-area-inset-top) in px (0 outside notched phones). */
function useSafeTop() {
  const [v, setV] = useState(0);
  useEffect(() => {
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;top:0;height:var(--safe-top,0px);visibility:hidden;pointer-events:none";
    document.body.appendChild(probe);
    setV(probe.getBoundingClientRect().height);
    probe.remove();
  }, []);
  return v;
}

function useIsDesktop() {
  const [d, setD] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setD(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return d;
}

function isInteractive(el: EventTarget | null): boolean {
  return el instanceof Element && Boolean(el.closest("button, a, input, textarea, select, label, [role=button], [role=combobox], [role=switch], [role=radio], [data-no-drag]"));
}

export interface SheetProps {
  peek: React.ReactNode;
  body?: React.ReactNode;
  expanded: boolean;
  onExpandedChange: (v: boolean) => void;
  labels: { expand: string; collapse: string; region: string };
  /** visible height in the collapsed state (page uses it to place floating controls) */
  onCollapsedHeight?: (h: number) => void;
  /** phones, creation steps: the widget never covers more than this share of the screen */
  fitMaxRatio?: number;
  className?: string;
}

export function Sheet({ peek, body, expanded, onExpandedChange, labels, onCollapsedHeight, fitMaxRatio = 0.72, className }: SheetProps) {
  const vh = useViewportHeight();
  const safeTop = useSafeTop();
  const desktop = useIsDesktop();
  const hasBody = Boolean(body);
  const peekRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [peekH, setPeekH] = useState(0);
  const [drag, setDrag] = useState<number | null>(null); // live offset while dragging
  const dragRef = useRef<{ startY: number; startOffset: number; active: boolean; samples: { t: number; y: number }[]; pointerId?: number; source: "pointer" | "touch" } | null>(null);
  const suppressClick = useRef(false);
  const wheel = useRef({ acc: 0, last: 0, startedAtTop: false });

  // measured heights
  useLayoutEffect(() => {
    const el = peekRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPeekH(Math.ceil(el.getBoundingClientRect().height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // expanded landing: nearly the full viewport; creation steps: capped so the video stays visible above
  const fullH = vh ? (desktop ? Math.min(vh - 72, 880) : vh - 8 - safeTop) : 0;
  const maxH = hasBody || desktop ? fullH : Math.round(vh * fitMaxRatio);
  const HANDLE = hasBody ? 22 : 0;
  const collapsedVisible = Math.min(peekH + HANDLE, maxH || Infinity);
  const H = hasBody ? maxH : collapsedVisible;
  const collapsedOffset = hasBody ? Math.max(0, H - collapsedVisible) : 0;
  const offset = drag ?? (hasBody && !expanded ? collapsedOffset : 0);
  // phones: the sheet slides (transform, no layout); desktop: a floating card that grows (height), so its
  // rounded bottom edge stays on screen and nothing below the title shows through when collapsed
  const visibleH = hasBody ? Math.max(0, H - offset) : H;

  useEffect(() => {
    if (collapsedVisible > 0) onCollapsedHeight?.(collapsedVisible);
  }, [collapsedVisible, onCollapsedHeight]);

  /* ── dragging ─────────────────────────────────────────────────────── */

  const begin = (y: number, source: "pointer" | "touch", pointerId?: number) => {
    dragRef.current = { startY: y, startOffset: offset, active: false, samples: [{ t: performance.now(), y }], pointerId, source };
  };
  const move = (y: number): boolean => {
    const d = dragRef.current;
    if (!d) return false;
    const dy = y - d.startY;
    if (!d.active) {
      if (Math.abs(dy) < DRAG_THRESHOLD) return false;
      d.active = true;
    }
    d.samples.push({ t: performance.now(), y });
    if (d.samples.length > 6) d.samples.shift();
    let next = d.startOffset + dy;
    // soft resistance past both ends
    if (next < 0) next = next / 4;
    if (next > collapsedOffset) next = collapsedOffset + (next - collapsedOffset) / 4;
    setDrag(next);
    return true;
  };
  const end = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || !d.active) {
      setDrag(null);
      return;
    }
    // the click that ends a drag must not toggle anything — but only that one
    suppressClick.current = true;
    window.setTimeout(() => (suppressClick.current = false), 350);
    const s = d.samples;
    const first = s[0];
    const last = s[s.length - 1];
    const v = last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0;
    const current = d.startOffset + (last.y - d.startY);
    const shouldExpand = v < -FLICK_VELOCITY ? true : v > FLICK_VELOCITY ? false : current < collapsedOffset / 2;
    setDrag(null);
    onExpandedChange(shouldExpand);
  };

  // pointer drags (mouse, pen, touch on the handle/title) follow the pointer on window,
  // so leaving the sheet mid-drag does not lose it and child buttons keep their clicks
  const onPointerDown = (e: React.PointerEvent) => {
    if (!hasBody || e.button !== 0) return;
    // the scrolling body: touches are handled by the touch listeners below (they respect scroll),
    // the mouse selects text there
    if (bodyRef.current?.contains(e.target as Node)) return;
    const id = e.pointerId;
    begin(e.clientY, "pointer", id);
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== id || dragRef.current?.source !== "pointer") return;
      if (move(ev.clientY)) ev.preventDefault();
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (dragRef.current?.source === "pointer") end();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };
  const onClickCapture = (e: React.MouseEvent) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    }
  };

  // touch on the scrolling body: drag down only from the very top
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || !hasBody) return;
    let startedAtTop = false;
    const ts = (e: TouchEvent) => {
      startedAtTop = el.scrollTop <= 0;
      if (startedAtTop && expanded) begin(e.touches[0].clientY, "touch");
    };
    const tm = (e: TouchEvent) => {
      const d = dragRef.current;
      if (!d || d.source !== "touch") return;
      const dy = e.touches[0].clientY - d.startY;
      if (!d.active && (dy < 0 || el.scrollTop > 0 || !startedAtTop)) {
        // scrolling the content up, or not at top: let the browser scroll
        dragRef.current = null;
        return;
      }
      if (move(e.touches[0].clientY) && e.cancelable) e.preventDefault();
    };
    const te = () => {
      if (dragRef.current?.source === "touch") end();
    };
    el.addEventListener("touchstart", ts, { passive: true });
    el.addEventListener("touchmove", tm, { passive: false });
    el.addEventListener("touchend", te);
    el.addEventListener("touchcancel", te);
    return () => {
      el.removeEventListener("touchstart", ts);
      el.removeEventListener("touchmove", tm);
      el.removeEventListener("touchend", te);
      el.removeEventListener("touchcancel", te);
    };
    // begin/move/end read refs and current offsets; rebinding on expanded/offset is enough
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasBody, expanded, collapsedOffset]);

  /* ── wheel / trackpad ─────────────────────────────────────────────── */

  const onWheel = useCallback(
    (e: WheelEvent) => {
      if (!hasBody) return;
      const w = wheel.current;
      const now = performance.now();
      const newGesture = now - w.last > 250;
      w.last = now;
      if (newGesture) {
        w.acc = 0;
        w.startedAtTop = (bodyRef.current?.scrollTop ?? 0) <= 0;
      }
      if (!expanded) {
        if (e.deltaY > 0) {
          e.preventDefault();
          w.acc += e.deltaY;
          if (w.acc > WHEEL_EXPAND) {
            w.acc = 0;
            onExpandedChange(true);
          }
        }
        return;
      }
      const inBody = bodyRef.current?.contains(e.target as Node);
      const atTop = (bodyRef.current?.scrollTop ?? 0) <= 0;
      if (inBody && atTop && w.startedAtTop && e.deltaY < 0) {
        w.acc += e.deltaY;
        if (w.acc < -WHEEL_COLLAPSE) {
          w.acc = 0;
          onExpandedChange(false);
        }
      } else if (!inBody && e.deltaY < 0) {
        // scrolling up over the title area while expanded
        w.acc += e.deltaY;
        if (w.acc < -WHEEL_EXPAND) {
          w.acc = 0;
          onExpandedChange(false);
        }
      }
    },
    [hasBody, expanded, onExpandedChange],
  );
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  /* ── keyboard ─────────────────────────────────────────────────────── */

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && hasBody && expanded) {
      e.stopPropagation();
      onExpandedChange(false);
    }
  };
  const onHandleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      onExpandedChange(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      onExpandedChange(false);
    }
  };

  const ready = vh > 0;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center lg:bottom-6">
      <section
        ref={panelRef}
        data-sheet
        aria-label={labels.region}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onClickCapture={onClickCapture}
        className={cn(
          "pointer-events-auto relative flex w-full flex-col overflow-hidden border border-white/[0.09] bg-[#121214]/[0.9] shadow-[0_-8px_40px_rgb(0_0_0/0.45)] backdrop-blur-2xl backdrop-saturate-150",
          "rounded-t-[26px] border-b-0 lg:mx-4 lg:max-w-[600px] lg:rounded-[26px] lg:border-b",
          drag === null && "transition-[transform,height] duration-[420ms] ease-[var(--ease-sheet)] motion-reduce:transition-none",
          !ready && "invisible",
          className,
        )}
        style={{
          height: (desktop ? visibleH : H) || undefined,
          maxHeight: maxH || undefined,
          transform: desktop ? undefined : `translate3d(0, ${offset}px, 0)`,
        }}
      >
        {hasBody && (
          <button
            type="button"
            onClick={() => onExpandedChange(!expanded)}
            onKeyDown={onHandleKey}
            aria-expanded={expanded}
            aria-controls="sheet-body"
            aria-label={expanded ? labels.collapse : labels.expand}
            style={{ touchAction: "none" }}
            className="group mx-auto flex h-[22px] w-24 shrink-0 cursor-grab items-center justify-center active:cursor-grabbing"
          >
            <span className="block h-[5px] w-10 rounded-full bg-white/25 transition-colors group-hover:bg-white/45" aria-hidden />
          </button>
        )}
        <div ref={peekRef} className={cn("shrink-0", !hasBody && "min-h-0 overflow-y-auto overscroll-contain")} style={!hasBody ? { maxHeight: maxH || undefined, touchAction: "pan-y" } : { touchAction: "none" }}>
          {peek}
        </div>
        {hasBody && (
          <div
            ref={bodyRef}
            id="sheet-body"
            inert={!expanded}
            className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain transition-opacity duration-300", !expanded && drag === null && "opacity-0")}
            style={{ touchAction: "pan-y" }}
          >
            {body}
          </div>
        )}
      </section>
    </div>
  );
}

/** Whether an event started on an interactive element (exported for tests/other gestures). */
export { isInteractive };
