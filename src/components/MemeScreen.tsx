"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/ui/button";
import { api } from "@/client/api";

/** The meme: the real video with its original sound, one line of how it works, one action. */
export function MemeScreen({ meme }: { meme: { id: string; title: string; example: { src: string; poster: string }; aspectRatio: string; ready: boolean } }) {
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
    <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 pt-4 md:px-6 md:pt-8">
      <div className="overflow-hidden rounded-xl bg-black" style={{ aspectRatio: meme.aspectRatio.replace(":", " / ") }}>
        {meme.ready ? (
          // native controls: play and the sound toggle are keyboard and screen-reader accessible
          <video src={meme.example.src} poster={meme.example.poster} controls playsInline preload="metadata" className="size-full" aria-label={`${meme.title}, видео со звуком`} />
        ) : (
          <div className="grid size-full place-items-center p-6 text-center text-muted">Видео ещё не подключено</div>
        )}
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] font-semibold tracking-tight md:text-[26px]">{meme.title}</h1>
          <p className="text-[14px] text-muted">Выбери людей → настрой образы → создай видео</p>
        </div>
        <Button onClick={start} loading={busy} disabled={!meme.ready} size="md" className="max-md:h-12 max-md:w-full">
          Заменить людей
        </Button>
      </div>
    </div>
  );
}
