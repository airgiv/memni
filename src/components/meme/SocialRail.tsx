"use client";
/**
 * Like · Comments · Share on the right edge of the video, above the
 * collapsed sheet. No counts are shown: we have none, and we do not invent
 * them. Like is a personal mark kept in this browser.
 */
import { useEffect, useRef, useState } from "react";
import { Heart, MessageCircle, Share } from "lucide-react";
import { toast } from "sonner";
import { store } from "@/client/hooks";
import { useI18n } from "@/i18n/client";
import { Dialog } from "@/ui/dialog";
import { HeartStream, type HeartStreamHandle } from "./HeartStream";

export async function shareLink(url: string, title: string, m: ReturnType<typeof useI18n>["m"]) {
  try {
    if (navigator.share) {
      await navigator.share({ title, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast(m.social.linkCopied);
  } catch (e) {
    if ((e as Error).name !== "AbortError") toast.error(m.social.shareFailed);
  }
}

function RailButton({ label, pressed, onClick, children }: { label: string; pressed?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className="grid size-12 place-items-center rounded-full border border-white/12 bg-black/35 text-white backdrop-blur-md transition-colors hover:bg-black/55 lg:size-11"
    >
      {children}
    </button>
  );
}

export function SocialRail({ memeId, title, bottom, active }: { memeId: string; title: string; bottom: number; active: boolean }) {
  const { m } = useI18n();
  const hearts = useRef<HeartStreamHandle>(null);
  const [liked, setLiked] = useState(false);
  const [comments, setComments] = useState(false);
  useEffect(() => setLiked(store.get(`memme:like:${memeId}`) === "1"), [memeId]);

  const like = () => {
    const next = !liked;
    setLiked(next);
    store.set(`memme:like:${memeId}`, next ? "1" : "0");
    if (next) hearts.current?.burst();
  };

  return (
    <>
      <div
        className={`fixed right-3 z-20 flex flex-col items-center gap-3 transition-[opacity,bottom] duration-300 lg:right-6 ${active ? "opacity-100" : "pointer-events-none opacity-0"}`}
        style={{ bottom }}
        aria-hidden={!active}
        inert={!active}
      >
        <div className="relative">
          <HeartStream ref={hearts} active={active} />
          <RailButton label={liked ? m.social.liked : m.social.like} pressed={liked} onClick={like}>
            <Heart className={`size-[22px] ${liked ? "fill-heart text-heart" : ""}`} aria-hidden />
          </RailButton>
        </div>
        <RailButton label={m.social.comments} onClick={() => setComments(true)}>
          <MessageCircle className="size-[22px]" aria-hidden />
        </RailButton>
        <RailButton label={m.social.share} onClick={() => void shareLink(window.location.href.split("?")[0], title, m)}>
          <Share className="size-[21px]" aria-hidden />
        </RailButton>
      </div>
      <Dialog open={comments} onOpenChange={setComments} title={m.social.comments} closeLabel={m.common.close}>
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <MessageCircle className="size-8 text-faint" aria-hidden />
          <p className="text-[15px] text-fg-2">{m.social.commentsEmpty}</p>
          <p className="text-[13px] text-muted">{m.social.commentsNote}</p>
        </div>
      </Dialog>
    </>
  );
}
