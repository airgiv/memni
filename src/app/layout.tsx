import type { Metadata, Viewport } from "next";
import "@rapui/react/styles.css";
import "@rapui/react/fonts";
import "./globals.css";
import { AppProvider } from "@/components/AppProvider";
import { Header } from "@/components/Header";
import { ThemeSync } from "@/components/ThemeSync";

export const metadata: Metadata = {
  title: "memni — видео-мемы с вами и друзьями",
  description: "Выберите мем, назначьте друзей на роли и получите видео с оригинальным звуком.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f5" },
    { media: "(prefers-color-scheme: dark)", color: "#161616" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="rap-root">
        <ThemeSync />
        <AppProvider>
          <Header />
          <main className="pb-[calc(var(--safe-bottom)+96px)] lg:pb-16">{children}</main>
        </AppProvider>
      </body>
    </html>
  );
}
