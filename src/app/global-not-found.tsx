import type { Metadata } from "next";
import "@fontsource-variable/onest";
import "./globals.css";

export const metadata: Metadata = { title: "Page not found · Мемме" };

/** Unmatched URLs (no locale segment, unknown language, removed pages). English is the default locale. */
export default function GlobalNotFound() {
  return (
    <html lang="en" style={{ background: "#09090b", colorScheme: "dark" }}>
      <body>
        <main className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center gap-3 px-6">
          <p className="text-[17px] font-semibold">Мемме</p>
          <h1 className="text-[28px] font-semibold">Page not found</h1>
          <p className="text-muted">This page doesn’t exist or isn’t available in this language.</p>
          <a href="/en" className="mt-2 rounded-xl bg-[#f5f5f7] px-4 py-2.5 text-[15px] font-medium text-[#0b0b0d] hover:bg-[#dedee3]">
            Go to memes
          </a>
        </main>
      </body>
    </html>
  );
}
