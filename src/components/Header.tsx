"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@/ui/rapui";
import { previewsLeftText } from "@/client/api";
import { useMe } from "./AppProvider";

const NAV = [
  { href: "/", label: "Мемы" },
  { href: "/people", label: "Мои люди" },
  { href: "/orders", label: "Мои видео" },
];

export function Header() {
  const { me } = useMe();
  const pathname = usePathname();
  const cfg = me?.config;
  return (
    <>
    <header className="sticky top-0 z-40 bg-paper/90 pt-(--safe-top) backdrop-blur-md">
      <div className="page flex h-16 items-center gap-3">
        <Link href="/" className="mr-1 text-[1.35rem] font-semibold tracking-[-0.04em] text-ink">
          memni<span className="text-flame">.</span>
        </Link>
        {cfg?.isDemo && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Badge variant="warning" dot>
                  Демо-режим
                </Badge>
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-72">
              Ключи моделей не подключены: вместо генераций показываются помеченные примеры. Сходство с людьми здесь не проверяется.
            </TooltipContent>
          </Tooltip>
        )}
        <nav className="ml-auto hidden items-center gap-tight md:flex" aria-label="Разделы">
          {NAV.map((n) => {
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-pill px-4 py-2 text-[0.9375rem] font-medium tracking-[-0.01em] transition-colors duration-(--rap-dur-fast) ease-rm ${
                  active ? "bg-ink text-paper" : "text-ink hover:bg-fill"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        {me && (
          <span className="ml-auto hidden text-[0.8125rem] text-mute sm:inline md:ml-3">{previewsLeftText(me.quota.left)}</span>
        )}
      </div>
    </header>
      {/* mobile: bottom tab bar keeps one thumb-reachable way around.
          Rendered outside <header>: its backdrop-filter would become the containing block of a fixed child. */}
      <nav
        aria-label="Разделы"
        className="fixed inset-x-0 bottom-0 z-40 flex justify-around gap-tight border-t border-line bg-surface/95 px-2 pt-2 pb-[calc(var(--safe-bottom)+8px)] backdrop-blur-md md:hidden data-[hidden=true]:hidden"
        data-hidden={pathname.startsWith("/create/")}
      >
        {NAV.map((n) => {
          const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={`flex-1 rounded-pill py-2 text-center text-[0.875rem] font-medium ${active ? "bg-ink text-paper" : "text-ink"}`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
