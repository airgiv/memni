"use client";
/**
 * A light decorative stream of hearts above the Like button: they rise,
 * drift a little and fade. A Like adds a small burst. Purely decorative —
 * aria-hidden, stopped in hidden tabs, on inactive screens and under
 * prefers-reduced-motion. It never represents a count of anything.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { usePageVisible, useReducedMotion } from "@/client/hooks";

const COLORS = ["#ff5470", "#ff7a8f", "#ffffff", "#ffb3c0"];

export interface HeartStreamHandle {
  burst(): void;
}

function heartSvg(color: string, size: number) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path fill="${color}" d="M12 21s-7.5-4.6-9.6-9.3C.9 8.3 3.1 4.5 6.9 4.5c2.1 0 3.5 1.1 4.3 2.4.8-1.3 2.2-2.4 4.3-2.4 3.8 0 6 3.8 4.5 7.2C19.5 16.4 12 21 12 21z"/></svg>`;
}

export const HeartStream = forwardRef<HeartStreamHandle, { active: boolean }>(function HeartStream({ active }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const visible = usePageVisible();
  const reduced = useReducedMotion();
  const running = active && visible && !reduced;
  const animations = useRef(new Set<Animation>());

  const spawn = (big = false) => {
    const el = box.current;
    if (!el) return;
    const size = big ? 16 + Math.random() * 10 : 11 + Math.random() * 8;
    const node = document.createElement("span");
    node.innerHTML = heartSvg(COLORS[Math.floor(Math.random() * COLORS.length)], Math.round(size));
    node.style.cssText = "position:absolute;left:50%;bottom:0;will-change:transform,opacity;";
    el.appendChild(node);
    const drift = (Math.random() - 0.5) * (big ? 70 : 44);
    const rise = (big ? 150 : 190) + Math.random() * 90;
    const duration = (big ? 1500 : 3000) + Math.random() * 900;
    const anim = node.animate(
      [
        { transform: "translate(-50%, 0) scale(0.6)", opacity: 0 },
        { transform: `translate(calc(-50% + ${drift * 0.35}px), -${rise * 0.2}px) scale(1)`, opacity: big ? 0.95 : 0.7, offset: 0.15 },
        { transform: `translate(calc(-50% + ${drift * -0.2}px), -${rise * 0.6}px) scale(1)`, opacity: big ? 0.8 : 0.5, offset: 0.6 },
        { transform: `translate(calc(-50% + ${drift}px), -${rise}px) scale(0.9)`, opacity: 0 },
      ],
      { duration, easing: "cubic-bezier(0.25, 0.6, 0.3, 1)" },
    );
    animations.current.add(anim);
    anim.onfinish = () => {
      animations.current.delete(anim);
      node.remove();
    };
  };

  useImperativeHandle(ref, () => ({
    burst() {
      if (reduced || !visible) return;
      for (let i = 0; i < 6; i++) window.setTimeout(() => spawn(true), i * 70);
    },
  }));

  // the gentle stream
  useEffect(() => {
    if (!running) return;
    let timer = 0;
    const loop = () => {
      spawn();
      timer = window.setTimeout(loop, 1100 + Math.random() * 1300);
    };
    timer = window.setTimeout(loop, 600);
    return () => window.clearTimeout(timer);
    // spawn only touches refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  // hidden tab or inactive screen: freeze what is in flight
  useEffect(() => {
    for (const a of animations.current) {
      if (running) a.play();
      else a.pause();
    }
  }, [running]);

  return <div ref={box} aria-hidden className="pointer-events-none absolute bottom-full left-1/2 h-64 w-24 -translate-x-1/2" />;
});
