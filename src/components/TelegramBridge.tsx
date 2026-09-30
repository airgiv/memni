"use client";
/**
 * Telegram Mini App adapter. The app is one codebase: in a normal browser this
 * renders nothing. Inside Telegram it: signals ready + expands, follows the
 * Telegram colour scheme, exposes safe-area insets as CSS vars, drives the
 * native Back button from the router, and sends raw initData to the server,
 * which verifies the signature before trusting anything (/api/auth/telegram).
 */
import Script from "next/script";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface Insets { top: number; bottom: number; left: number; right: number }
interface TgWebApp {
  initData: string;
  colorScheme: "light" | "dark";
  version: string;
  ready(): void;
  expand(): void;
  isVersionAtLeast(v: string): boolean;
  safeAreaInset?: Insets;
  contentSafeAreaInset?: Insets;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  onEvent(e: string, cb: () => void): void;
  offEvent(e: string, cb: () => void): void;
}
declare global {
  interface Window { Telegram?: { WebApp?: TgWebApp } }
}

export function TelegramBridge({ onLogin }: { onLogin: () => void }) {
  const [tg, setTg] = useState<TgWebApp | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const loggedIn = useRef(false);
  const [inTelegram, setInTelegram] = useState(false);

  // Telegram opens Mini Apps with #tgWebAppData=… in the URL; only then load its script
  useEffect(() => {
    let flag = false;
    try {
      flag = location.hash.includes("tgWebApp") || sessionStorage.getItem("memni_tg") === "1";
      if (flag) sessionStorage.setItem("memni_tg", "1");
    } catch {
      flag = location.hash.includes("tgWebApp");
    }
    setInTelegram(flag);
  }, []);

  useEffect(() => {
    if (!tg) return;
    tg.ready();
    tg.expand();
    const root = document.documentElement;
    root.dataset.telegram = "1";
    const apply = () => {
      root.dataset.rapTheme = tg.colorScheme === "dark" ? "dark" : "light";
      const s = tg.safeAreaInset;
      const c = tg.contentSafeAreaInset;
      root.style.setProperty("--tg-safe-top", `${(s?.top ?? 0) + (c?.top ?? 0)}px`);
      root.style.setProperty("--tg-safe-bottom", `${(s?.bottom ?? 0) + (c?.bottom ?? 0)}px`);
    };
    apply();
    tg.onEvent("themeChanged", apply);
    tg.onEvent("safeAreaChanged", apply);
    tg.onEvent("contentSafeAreaChanged", apply);
    if (!loggedIn.current && tg.initData) {
      loggedIn.current = true;
      fetch("/api/auth/telegram", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ initData: tg.initData }) })
        .then((r) => r.ok && onLogin())
        .catch(() => {});
    }
    return () => {
      tg.offEvent("themeChanged", apply);
      tg.offEvent("safeAreaChanged", apply);
      tg.offEvent("contentSafeAreaChanged", apply);
    };
  }, [tg, onLogin]);

  useEffect(() => {
    if (!tg) return;
    const back = () => router.back();
    if (pathname === "/") tg.BackButton.hide();
    else {
      tg.BackButton.show();
      tg.BackButton.onClick(back);
    }
    return () => tg.BackButton.offClick(back);
  }, [tg, pathname, router]);

  if (!inTelegram) return null;
  return (
    <Script
      src="https://telegram.org/js/telegram-web-app.js"
      strategy="afterInteractive"
      onLoad={() => {
        const wa = window.Telegram?.WebApp;
        // outside Telegram the script loads but initData is empty → stay a normal website
        if (wa && wa.initData) setTg(wa);
      }}
    />
  );
}
