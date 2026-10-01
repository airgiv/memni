/** The catalog — a secondary entry point. English by default; each locale lists its published memes. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogView, type CatalogItem } from "@/components/CatalogView";
import { SiteHeader } from "@/components/SiteHeader";
import { getMessages, LOCALES, localeFromSegment } from "@/i18n";
import { abs, catalogAlternates, hreflang } from "@/lib/site";
import { anyContent, memeContent, memeLocales, memePath, MEMES } from "@/memes";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const locale = localeFromSegment((await params).locale);
  if (!locale) notFound();
  const m = getMessages(locale);
  const alternates = catalogAlternates();
  return {
    title: m.meta.catalogTitle,
    description: m.meta.catalogDescription,
    alternates: { canonical: abs(alternates[locale]!), languages: hreflang(alternates) },
    openGraph: { type: "website", siteName: "Мемме", title: m.meta.catalogTitle, description: m.meta.catalogDescription, url: abs(alternates[locale]!) },
  };
}

export default async function CatalogPage({ params }: PageProps<"/[locale]">) {
  const locale = localeFromSegment((await params).locale);
  if (!locale) notFound();
  const m = getMessages(locale);
  const items: CatalogItem[] = MEMES.map((meme) => {
    const own = memeContent(meme, locale);
    // a meme without a translation here links to its primary-language page
    const shownIn = own ? locale : memeLocales(meme).includes(meme.defaultLocale) ? meme.defaultLocale : memeLocales(meme)[0];
    const content = own ?? anyContent(meme, shownIn);
    return {
      id: meme.id,
      href: memePath(meme, shownIn) ?? "#",
      title: content.title,
      summary: content.summary,
      poster: meme.media.poster.src,
      focal: meme.media.focal.mobile,
      people: meme.roles.length,
      languages: memeLocales(meme),
      shownIn,
      markets: meme.markets,
    };
  }).filter((i) => i.languages.length > 0);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pb-[calc(var(--safe-bottom)+40px)] pt-8 sm:px-6 lg:pt-12">
        <h1 className="text-[30px] font-semibold tracking-tight lg:text-[36px]">{m.catalog.title}</h1>
        <p className="mt-1 max-w-xl text-[15px] text-muted">{m.catalog.subtitle}</p>
        <CatalogView items={items} />
      </main>
    </>
  );
}
