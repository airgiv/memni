"use client";
import { useEffect } from "react";

/** Follows the OS light/dark preference (Telegram overrides it when present). */
export function ThemeSync() {
  useEffect(() => {
    const m = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      if (document.documentElement.dataset.telegram) return;
      document.documentElement.dataset.rapTheme = m.matches ? "dark" : "light";
    };
    apply();
    m.addEventListener("change", apply);
    return () => m.removeEventListener("change", apply);
  }, []);
  return null;
}
