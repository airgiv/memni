"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/ui/rapui";
import { Users, Video } from "@/ui/icons";
import { useMe } from "./AppProvider";

const NAV = [
  { href: "/people", label: "Мои люди", Icon: Users },
  { href: "/orders", label: "Мои видео", Icon: Video },
];

export function Header() {
  const { me } = useMe();
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 bg-paper/90 pt-(--safe-top) backdrop-blur-md">
      <div className="page flex h-14 items-center gap-3">
        <Link href="/" className="text-[1.3rem] font-semibold tracking-[-0.04em] text-ink">
          memni<span className="text-flame">.</span>
        </Link>
        {me?.config.isDemo && (
          <Badge variant="warning" size="sm">
            демо
          </Badge>
        )}
        <nav className="ml-auto flex items-center gap-tight" aria-label="Разделы">
          {NAV.map(({ href, label, Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={`flex h-control-sm items-center gap-2 rounded-pill px-3 text-[0.9375rem] font-medium transition-colors duration-(--rap-dur-fast) ease-rm ${
                  active ? "bg-surface text-ink" : "text-ink-2 hover:bg-fill"
                }`}
              >
                <Icon size={18} />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
