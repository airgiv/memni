"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMe } from "./AppProvider";

const NAV = [
  { href: "/people", label: "Мои люди" },
  { href: "/orders", label: "Мои видео" },
];

export function Header() {
  const { me } = useMe();
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-bg/90 pt-(--safe-top) backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 md:px-6">
        <Link href="/" className="text-[18px] font-semibold tracking-tight">
          memni<span className="text-accent">.</span>
        </Link>
        {me?.config.isDemo && (
          <span className="rounded-md border border-warning/40 px-1.5 py-0.5 text-[11px] font-medium text-warning" title="Генерации не подключены — результаты помечены как пример">
            демо
          </span>
        )}
        <nav className="ml-auto flex items-center gap-1" aria-label="Разделы">
          {NAV.map((n) => {
            const active = pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-9 items-center rounded-lg px-3 text-[14px] transition-colors ${active ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface hover:text-fg"}`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
