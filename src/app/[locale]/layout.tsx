import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import "@fontsource-variable/onest";
import "../globals.css";
import { Providers } from "@/components/Providers";
import { getMessages, LOCALES, localeFromSegment, PUBLISHED_LOCALES } from "@/i18n";
import { siteUrl } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return PUBLISHED_LOCALES.map((l) => ({ locale: LOCALES[l].segment }));
}

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  applicationName: "Мемме",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark",
  themeColor: "#09090b",
};

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const locale = localeFromSegment((await params).locale);
  if (!locale) notFound();
  return (
    // dark is rendered on the server: no light flash before hydration
    <html lang={LOCALES[locale].tag} style={{ background: "#09090b", colorScheme: "dark" }}>
      <body>
        <Providers locale={locale} messages={getMessages(locale)}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
