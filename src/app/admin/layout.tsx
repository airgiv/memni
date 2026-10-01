import "@fontsource-variable/onest";
import "../globals.css";

export const metadata = { title: "Media · Мемме", robots: { index: false } };

/** Operator pages: English only, outside the localized site. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ background: "#09090b", colorScheme: "dark" }}>
      <body>{children}</body>
    </html>
  );
}
