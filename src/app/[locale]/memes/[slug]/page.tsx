/**
 * A meme landing page — the main entry point from social media, ads, search
 * and shared links. Statically generated per published (locale, meme) pair
 * from configuration; the interactive creation flow hydrates on top.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MemeEditorial } from "@/components/meme/MemeEditorial";
import { MemeExperience } from "@/components/meme/MemeExperience";
import { getMessages, LOCALES, localeFromSegment, type LocaleCode } from "@/i18n";
import { mediaReady } from "@/lib/server/media-ready";
import { abs, hreflang, memeAlternates, suggestionTexts } from "@/lib/site";
import { findMemeBySlug, memeContent, memeLocales, MEMES } from "@/memes";
import { clientMeme } from "@/memes/client";

export const dynamicParams = false;

export function generateStaticParams() {
  return MEMES.flatMap((m) => memeLocales(m).map((l) => ({ locale: LOCALES[l].segment, slug: memeContent(m, l)!.slug })));
}

async function resolve(params: PageProps<"/[locale]/memes/[slug]">["params"]) {
  const p = await params;
  const locale = localeFromSegment(p.locale);
  const meme = locale ? findMemeBySlug(locale, p.slug) : undefined;
  if (!locale || !meme) notFound();
  return { locale, meme, content: memeContent(meme, locale)! };
}

export async function generateMetadata({ params }: PageProps<"/[locale]/memes/[slug]">): Promise<Metadata> {
  const { locale, meme, content } = await resolve(params);
  const alternates = memeAlternates(meme);
  const self = abs(alternates[locale]!);
  const poster = abs(meme.media.poster.src);
  return {
    title: `${content.seo.title} · Мемме`,
    description: content.seo.description,
    // canonical is always this translation itself — never folded into English
    alternates: { canonical: self, languages: hreflang(alternates, meme.defaultLocale) },
    openGraph: {
      type: "video.other",
      url: self,
      siteName: "Мемме",
      title: content.seo.title,
      description: content.seo.description,
      locale: LOCALES[locale].tag.replace("-", "_"),
      alternateLocale: (Object.keys(alternates) as LocaleCode[]).filter((l) => l !== locale).map((l) => LOCALES[l].tag.replace("-", "_")),
      images: [{ url: poster, width: meme.media.poster.width, height: meme.media.poster.height, alt: content.title }],
      videos: [{ url: abs(meme.media.video.src), type: "video/mp4", width: meme.media.poster.width, height: meme.media.poster.height }],
    },
    twitter: { card: "summary_large_image", title: content.seo.title, description: content.seo.description, images: [poster] },
  };
}

export default async function MemePage({ params }: PageProps<"/[locale]/memes/[slug]">) {
  const { locale, meme, content } = await resolve(params);
  const m = getMessages(locale);
  const alternates = memeAlternates(meme);
  const url = abs(alternates[locale]!);

  // structured data describes exactly what the page shows: the clip and the FAQ
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "VideoObject",
      name: content.title,
      description: content.seo.description,
      thumbnailUrl: [abs(meme.media.poster.src)],
      contentUrl: abs(meme.media.video.src),
      duration: `PT${meme.durationSec}S`,
      inLanguage: LOCALES[locale].tag,
      url,
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      inLanguage: LOCALES[locale].tag,
      mainEntity: content.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ];

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <MemeExperience
        meme={clientMeme(meme, content, locale)}
        alternates={alternates}
        suggestions={suggestionTexts(alternates)}
        mediaReady={mediaReady(meme)}
        catalogHref={`/${LOCALES[locale].segment}`}
      >
        <MemeEditorial content={content} sources={meme.sources} m={m} localeTag={LOCALES[locale].tag} />
      </MemeExperience>
    </main>
  );
}
