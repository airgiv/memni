"use client";
/**
 * The full-viewport video behind the whole meme page: no frame, no margins,
 * cover with a configurable focal point. It loops, starts muted and plays
 * inline; enabling sound plays the clip's original audio track. Under
 * reduced motion it waits on its poster until the user presses play.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useReducedMotion, useSize } from "@/client/hooks";
import { coverBox } from "@/client/cover";
import { useI18n } from "@/i18n/client";
import type { FocalPoint, Region } from "@/memes/types";
import { IconButton } from "@/ui/button";

export interface StageHandle {
  play(): void;
}

export const VideoStage = forwardRef<
  StageHandle,
  {
    src: string | null;
    /** optional VP9/Opus rendition for browsers without H.264 */
    webm?: string | null;
    poster: string;
    media: { w: number; h: number };
    focal: FocalPoint;
    /** region of the reference frame to spotlight (participant being edited) */
    spotlight?: Region | null;
    dimmed?: boolean;
    badge?: string | null;
    missingText?: string | null;
  }
>(function VideoStage({ src, webm, poster, media, focal, spotlight, dimmed, badge, missingText }, ref) {
  const { m } = useI18n();
  const reduced = useReducedMotion();
  const video = useRef<HTMLVideoElement>(null);
  const [box, size] = useSize<HTMLDivElement>();
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const cover = coverBox(size, media, focal);

  useImperativeHandle(ref, () => ({ play: () => void video.current?.play().catch(() => undefined) }));

  // reduced motion: no autoplay; otherwise start (muted autoplay is allowed everywhere)
  useEffect(() => {
    const v = video.current;
    if (!v || !src) return;
    if (reduced) {
      v.pause();
      setPaused(true);
    } else {
      v.play().then(
        () => setPaused(false),
        () => setPaused(true),
      );
    }
  }, [reduced, src]);

  const toggleSound = () => {
    const v = video.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    if (!v.muted && v.paused) void v.play().catch(() => undefined);
  };
  const togglePlay = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  };

  const spot = spotlight && cover.w ? { left: cover.x + spotlight.x * cover.w, top: cover.y + spotlight.y * cover.h, width: spotlight.w * cover.w, height: spotlight.h * cover.h } : null;

  return (
    <div ref={box} className="fixed inset-0 overflow-hidden bg-black">
      {src ? (
        <video
          ref={video}
          key={src}
          poster={poster}
          muted={muted}
          loop
          playsInline
          preload="auto"
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
          className="absolute inset-0 size-full object-cover transition-[object-position] duration-700 ease-[var(--ease-sheet)] motion-reduce:transition-none"
          style={{ objectPosition: `${cover.x}px ${cover.y}px` }}
        >
          <source src={src} type={'video/mp4; codecs="avc1.4D401E, mp4a.40.2"'} />
          {webm && <source src={webm} type={'video/webm; codecs="vp9, opus"'} />}
          {/* last resort: let the browser try the MP4 without a codec hint */}
          <source src={src} />
        </video>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" className="absolute inset-0 size-full object-cover" style={{ objectPosition: `${cover.x}px ${cover.y}px` }} />
      )}

      {/* participant spotlight: everything else gently darkened */}
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-[40px] transition-[left,top,width,height,opacity] duration-700 ease-[var(--ease-sheet)] motion-reduce:transition-none"
        style={
          spot
            ? { ...spot, opacity: 1, boxShadow: "0 0 0 200vmax rgb(0 0 0 / 0.42)", filter: "blur(36px)" }
            : { left: "50%", top: "50%", width: 0, height: 0, opacity: 0 }
        }
      />
      <div aria-hidden data-dim={dimmed ? "on" : "off"} className="pointer-events-none absolute inset-0 bg-black transition-opacity duration-700" style={{ opacity: dimmed ? 0.5 : 0 }} />
      {/* legibility for the floating controls */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/45 to-transparent" />

      <div className="absolute right-3 top-[calc(var(--safe-top)+12px)] z-20 flex gap-2 lg:right-5 lg:top-5">
        {src && (
          <>
            <IconButton tone="glass" label={muted ? m.stage.soundOn : m.stage.soundOff} aria-pressed={!muted} onClick={toggleSound}>
              {muted ? <VolumeX className="size-[18px]" aria-hidden /> : <Volume2 className="size-[18px]" aria-hidden />}
            </IconButton>
            <IconButton tone="glass" label={paused ? m.stage.play : m.stage.pause} onClick={togglePlay}>
              {paused ? <Play className="size-[18px]" aria-hidden /> : <Pause className="size-[18px]" aria-hidden />}
            </IconButton>
          </>
        )}
      </div>

      {badge && (
        <span className="absolute left-1/2 top-[calc(var(--safe-top)+64px)] z-20 -translate-x-1/2 rounded-full border border-white/12 bg-black/50 px-3 py-1 text-[12px] font-medium text-white/90 backdrop-blur-md lg:top-6">
          {badge}
        </span>
      )}
      {missingText && (
        <p className="absolute inset-x-6 top-1/3 z-10 text-center text-sm text-white/80">{missingText}</p>
      )}
    </div>
  );
});
