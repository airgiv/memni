"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/ui/input";

export interface CatalogItem {
  id: string;
  title: string;
  poster: string;
  aspectRatio: string;
  ready: boolean;
}

/** Home = the catalog: a grid of real video memes and a search. */
export function Catalog({ items }: { items: CatalogItem[] }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? items.filter((i) => i.title.toLowerCase().includes(s)) : items;
  }, [q, items]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 pt-5 md:px-6 md:pt-8">
      <label className="relative block max-w-sm">
        <span className="sr-only">Поиск мемов</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти мем" className="pl-9" />
      </label>

      {shown.length === 0 ? (
        <p className="text-muted">Ничего не нашлось</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Мемы">
          {shown.map((t) => (
            <li key={t.id}>
              <Link href={`/m/${t.id}`} className="group block overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-border-strong">
                <div className="bg-black" style={{ aspectRatio: t.aspectRatio.replace(":", " / ") }}>
                  {t.ready ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.poster} alt="" className="size-full object-cover" loading="lazy" />
                  ) : (
                    <div className="grid size-full place-items-center text-[12px] text-muted">Видео не подключено</div>
                  )}
                </div>
                <p className="truncate px-3 py-2 text-[14px] font-medium">{t.title}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
