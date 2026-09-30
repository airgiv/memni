"use client";
import { useEffect, useState } from "react";
import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger, toast } from "@/ui/rapui";
import { Switch } from "@/ui/Switch";
import { api } from "@/client/api";

/** Demo-only switches to see errors and retries without real providers. */
export function DemoPanel({ onChange }: { onChange: () => Promise<unknown> }) {
  const [flags, setFlags] = useState({ failPreview: false, failVideo: false });
  useEffect(() => {
    api<typeof flags>("/api/demo").then(setFlags).catch(() => {});
  }, []);
  const set = async (next: Partial<typeof flags> & { resetQuota?: boolean }) => {
    const merged = { ...flags, ...next };
    await api("/api/demo", { method: "POST", json: merged });
    setFlags({ failPreview: merged.failPreview, failVideo: merged.failVideo });
    await onChange();
  };
  return (
    <Collapsible className="rounded-card border border-dashed border-line p-2">
      <CollapsibleTrigger size="sm">Демо-настройки для проверки</CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-3 p-3">
          <Switch checked={flags.failPreview} onCheckedChange={(v) => void set({ failPreview: v })} label="Превью будут завершаться ошибкой" />
          <Switch checked={flags.failVideo} onCheckedChange={(v) => void set({ failVideo: v })} label="Видео завершится ошибкой видеосервиса" />
          <Button
            size="sm"
            variant="soft"
            onClick={async () => {
              await set({ resetQuota: true });
              toast.success("Демо-счётчик превью сброшен");
            }}
          >
            Вернуть бесплатные демо-превью
          </Button>
          <p className="text-[0.8125rem] text-mute">Работает только в демо-режиме и не влияет на реальные сервисы.</p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
