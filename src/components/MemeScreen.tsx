"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "@/ui/rapui";
import { Button } from "@/ui/Button";
import { VideoPlayer } from "@/ui/VideoPlayer";
import { api } from "@/client/api";
import { money } from "@/client/money";
import type { Money } from "@/lib/domain/types";

export function MemeScreen({
  meme,
  price,
  paymentsLive,
}: {
  meme: { id: string; title: string; example: { src: string; poster: string }; aspectRatio: string };
  price: Money | null;
  paymentsLive: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    try {
      const { id } = await api<{ id: string }>("/api/drafts", { method: "POST", json: { templateId: meme.id } });
      router.push(`/create/${id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className="page grid items-start gap-5 pt-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12 lg:pt-6">
      <div className="mx-auto w-full max-w-[min(100%,calc(66dvh*9/16))] overflow-hidden rounded-card bg-surface lg:max-w-[min(100%,calc((100dvh-7rem)*9/16))]">
        {/* the example keeps its original sound — it plays when the user presses play */}
        <VideoPlayer src={meme.example.src} poster={meme.example.poster} aspect={meme.aspectRatio.replace(":", " / ")} />
      </div>
      <div className="flex flex-col gap-4 lg:sticky lg:top-24 lg:pt-8">
        <h1 className="text-[2rem] leading-tight font-medium tracking-[-0.03em] lg:text-[3rem]">{meme.title}</h1>
        {price && (
          <p className="text-[1rem] text-ink-2">
            Видео — {money(price)}
            {!paymentsLive && <span className="text-mute"> · оплата тестовая</span>}
          </p>
        )}
        <div className="fixed inset-x-0 bottom-0 z-30 bg-paper/95 px-4 pt-3 pb-[calc(var(--safe-bottom)+12px)] backdrop-blur-md lg:static lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          <Button variant="accent" size="lg" block onClick={start} state={busy ? "loading" : undefined}>
            Сделать с собой
          </Button>
        </div>
      </div>
    </div>
  );
}
