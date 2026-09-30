"use client";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { EmptyState, Input } from "@/ui/rapui";
import { Search, X } from "@/ui/icons";

export interface CatalogItem {
  id: string;
  title: string;
  poster: string;
  aspectRatio: string;
}

/** The home page is the catalog: tiles only — a picture and a name, the whole tile opens the meme. */
export function Catalog({ items }: { items: CatalogItem[] }) {
  const [q, setQ] = useState("");
  const [mobileSearch, setMobileSearch] = useState(false);
  const mobileInput = useRef<HTMLInputElement>(null);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? items.filter((i) => i.title.toLowerCase().includes(s)) : items;
  }, [q, items]);

  return (
    <div className="page flex flex-col gap-4 pt-2 md:gap-6 md:pt-4">
      <div className="hidden max-w-md md:block">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти мем" prefix={<Search size={18} />} aria-label="Поиск мемов" />
      </div>

      {shown.length === 0 ? (
        <EmptyState size="sm" title="Ничего не нашлось" />
      ) : (
        <ul className="grid grid-cols-2 gap-tile sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" aria-label="Мемы">
          {shown.map((t) => (
            <li key={t.id}>
              <Link
                href={`/m/${t.id}`}
                className="group block overflow-hidden rounded-[20px] bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <div className="overflow-hidden" style={{ aspectRatio: t.aspectRatio.replace(":", " / ") }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={t.poster}
                    alt=""
                    className="size-full object-cover transition-[scale] duration-(--rap-dur) ease-soft group-hover:scale-103"
                    loading="lazy"
                  />
                </div>
                <p className="truncate px-3 py-2.5 text-[0.9375rem] font-medium tracking-[-0.01em]">{t.title}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* phone: a compact search at the bottom, out of the tiles' way */}
      <div className="fixed right-4 bottom-[calc(var(--safe-bottom)+16px)] left-4 z-30 flex justify-end md:hidden">
        {mobileSearch ? (
          <div className="flex w-full items-center gap-tight rounded-pill bg-surface p-1 shadow-pop">
            <Input ref={mobileInput} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти мем" aria-label="Поиск мемов" className="flex-1" autoFocus />
            <button
              type="button"
              aria-label="Закрыть поиск"
              onClick={() => {
                setQ("");
                setMobileSearch(false);
              }}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-fill text-ink"
            >
              <X size={18} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            aria-label="Поиск"
            onClick={() => setMobileSearch(true)}
            className="grid size-13 place-items-center rounded-full bg-surface text-ink shadow-pop focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Search size={20} />
          </button>
        )}
      </div>
    </div>
  );
}
