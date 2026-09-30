import type { Metadata, Viewport } from "next";
import "@rapui/react/styles.css";
import "@rapui/react/fonts";
import "./globals.css";
import { AppProvider } from "@/components/AppProvider";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "memni — видео-мемы с друзьями",
  description: "Выберите мем, добавьте фото — и получите видео с оригинальным звуком.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark",
  themeColor: "#121212",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // dark is set on the server: no light flash before hydration
    <html lang="ru" data-rap-theme="dark" style={{ background: "#121212" }} suppressHydrationWarning>
      <body className="rap-root">
        <AppProvider>
          <Header />
          <main className="pb-[calc(var(--safe-bottom)+112px)] lg:pb-16">{children}</main>
        </AppProvider>
      </body>
    </html>
  );
}
