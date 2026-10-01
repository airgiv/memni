"use client";
/** Header for the catalog and account pages (meme pages have none — the video fills the screen). */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/i18n/client";
import { LOCALES, PUBLISHED_LOCALES, type LocaleCode } from "@/i18n/locales";
import { cn } from "@/ui/cn";
import { LanguageSelect } from "./LanguageSelect";

export function SiteHeader() {
  const { m, locale } = useI18n();
  const pathname = usePathname() ?? "/";
  const seg = LOCALES[locale].segment;
  // catalog, people and videos have the same path in every language
  const rest = pathname.split("/").slice(2).join("/");
  const alternates = Object.fromEntries(PUBLISHED_LOCALES.map((l) => [l, `/${LOCALES[l].segment}${rest ? `/${rest}` : ""}`])) as Partial<Record<LocaleCode, string>>;
  const links = [
    { href: `/${seg}`, label: m.nav.catalog },
    { href: `/${seg}/people`, label: m.nav.people },
    { href: `/${seg}/videos`, label: m.nav.videos },
  ];
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 pt-[var(--safe-top)] backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href={`/${seg}`} className="text-[18px] font-semibold tracking-tight" aria-label={m.nav.home}>
          {m.brand}
        </Link>
        <nav aria-label={m.nav.catalog} className="flex flex-1 items-center gap-1 overflow-x-auto">
          {links.map((l) => {
            const active = l.href === `/${seg}` ? pathname === l.href : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn("whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[14px] transition-colors", active ? "text-fg" : "text-muted hover:text-fg")}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <LanguageSelect alternates={alternates} className="w-auto min-w-[120px] max-sm:hidden" />
      </div>
      <div className="mx-auto flex max-w-6xl justify-end px-4 pb-2 sm:hidden">
        <LanguageSelect alternates={alternates} className="h-9 min-w-[140px] text-sm" />
      </div>
    </header>
  );
}
