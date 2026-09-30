import type { Metadata, Viewport } from "next";
import "@fontsource-variable/onest";
import "./globals.css";
import { AppProvider } from "@/components/AppProvider";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "memni — видео-мемы с друзьями",
  description: "Выбери людей → настрой образы → создай видео.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark",
  themeColor: "#0e0e10",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // dark is set on the server: no light flash before hydration
    <html lang="ru" style={{ background: "#0e0e10", colorScheme: "dark" }}>
      <body>
        <AppProvider>
          <Header />
          <main className="pb-[calc(var(--safe-bottom)+24px)]">{children}</main>
        </AppProvider>
      </body>
    </html>
  );
}
