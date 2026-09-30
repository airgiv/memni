"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Badge, Button, Card, Display, Accent, Lead, toast } from "@/ui/rapui";
import { VideoPlayer } from "@/ui/VideoPlayer";
import { api, formatPrice } from "@/client/api";
import { TONE_VAR } from "@/client/tones";
import type { RoleTone } from "@/lib/templates/types";
import { rolesWord } from "@/lib/templates";
import { useMe } from "./AppProvider";

export interface CatalogTemplate {
  id: string;
  title: string;
  description: string;
  kind: "main" | "demo";
  demoMaterials: boolean;
  durationSec: number;
  aspectRatio: string;
  roles: { id: string; name: string; tone: RoleTone }[];
  price: { amountMinor: number; currency: string; isExample: boolean } | null;
  example: { src: string; poster: string };
}

export function Catalog({ templates, isDemo }: { templates: CatalogTemplate[]; isDemo: boolean }) {
  const { me } = useMe();
  const main = templates.filter((t) => t.kind === "main");
  const extra = templates.filter((t) => t.kind === "demo");
  const titles = Object.fromEntries(templates.map((t) => [t.id, t.title]));
  const drafts = (me?.drafts ?? []).filter((d) => !d.lastJobId).slice(0, 3);

  return (
    <div className="page flex flex-col gap-10 pt-6 md:pt-10">
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] lg:gap-12">
        <section className="flex flex-col gap-4 lg:sticky lg:top-24">
          <Display as="h1" size="lg" className="max-w-3xl">
            Видео-мем, где играете <Accent>вы и друзья</Accent>
          </Display>
          <Lead className="max-w-2xl text-ink-2">
            Выберите мем, назначьте людей на роли и загрузите их фото. Мы подготовим образы, покажем кадр на подтверждение и соберём видео с оригинальным звуком.
          </Lead>
          <ol className="flex flex-wrap gap-tight text-[0.875rem]" aria-label="Как это работает">
            {["Мем", "Роли", "Фото и образы", "Кадр на подтверждение", "Видео со звуком"].map((x, i) => (
              <li key={x} className="rounded-pill bg-surface px-3 py-1.5">
                <span className="text-mute">{i + 1}</span> {x}
              </li>
            ))}
          </ol>
          {isDemo && (
            <Alert variant="warning" title="Демонстрационный режим" className="max-w-3xl">
              Нейросети не подключены. Весь путь работает, но вместо персональных изображений и видео показываются помеченные примеры — это не результат обработки ваших фото. Деньги не списываются.
            </Alert>
          )}
          {drafts.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-[1rem] font-medium">Продолжить</h2>
              <div className="flex flex-wrap gap-tile">
                {drafts.map((d) => (
                  <Link key={d.id} href={`/create/${d.id}`} className="rounded-pill bg-surface px-5 py-3 text-[0.9375rem] font-medium hover:bg-fill-hover">
                    {titles[d.templateId] ?? d.templateId} · {d.assigned ? `назначено: ${d.assigned}` : "без участников"}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>
        <section aria-label="Главный мем" className="flex flex-col gap-4">
          {main.map((t) => (
            <TemplateCard key={t.id} t={t} isDemo={isDemo} featured />
          ))}
        </section>
      </div>

      {extra.length > 0 && (
        <section aria-labelledby="extra-h" className="flex flex-col gap-4">
          <div>
            <h2 id="extra-h" className="text-[1.25rem] font-medium tracking-[-0.02em]">Другие шаблоны</h2>
            <p className="text-[0.9375rem] text-mute">Показывают, что шаблон может быть на одного или на нескольких участников. Материалы — демонстрационные.</p>
          </div>
          <div className="grid gap-tile sm:grid-cols-2 xl:grid-cols-3">
            {extra.map((t) => (
              <TemplateCard key={t.id} t={t} isDemo={isDemo} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function TemplateCard({ t, isDemo, featured }: { t: CatalogTemplate; isDemo: boolean; featured?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    try {
      const { id } = await api<{ id: string }>("/api/drafts", { method: "POST", json: { templateId: t.id } });
      router.push(`/create/${id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Card className="flex flex-col gap-4 p-3 pb-5">
      <div className="overflow-hidden rounded-[22px] bg-ink">
        {/* sound plays only after the user presses play */}
        <VideoPlayer src={t.example.src} poster={t.example.poster} aspect={t.aspectRatio.replace(":", " / ")} title={t.title} className="max-h-[70vh]" />
      </div>
      <div className="flex flex-col gap-2 px-2">
        <div className="flex flex-wrap items-center gap-tight">
          <Badge variant="neutral">{rolesWord(t.roles.length)}</Badge>
          <Badge variant="neutral">{t.durationSec} с</Badge>
          {isDemo || !t.price ? <Badge variant="warning">Тестовая генерация</Badge> : <Badge variant="ink">{formatPrice(t.price)}</Badge>}
          {t.demoMaterials && <Badge variant="outline">демо-материал</Badge>}
        </div>
        <h3 className="text-[1.5rem] font-medium leading-tight tracking-[-0.03em]">{t.title}</h3>
        <p className="text-[0.9375rem] text-ink-2">{t.description}</p>
        {t.price && (
          <p className="text-[0.8125rem] text-mute">
            {formatPrice(t.price)}. Сейчас оплата не подключена — видео создаётся как тестовый заказ.
          </p>
        )}
        <div className="flex items-center gap-2 pt-1" aria-hidden>
          {t.roles.map((r) => (
            <span key={r.id} className="size-3 rounded-full" style={{ background: TONE_VAR[r.tone] }} />
          ))}
        </div>
      </div>
      <div className="px-2">
        <Button variant={featured ? "accent" : "soft"} size="lg" block onClick={start} state={busy ? "loading" : undefined} icon>
          Выбрать мем
        </Button>
      </div>
    </Card>
  );
}
