import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { VideoView } from "@/components/VideoView";
import { getMessages, localeFromSegment } from "@/i18n";
import { anyContent, MEMES } from "@/memes";

export async function generateMetadata({ params }: PageProps<"/[locale]/videos/[id]">): Promise<Metadata> {
  const locale = localeFromSegment((await params).locale);
  if (!locale) notFound();
  return { title: `${getMessages(locale).result.title} · Мемме`, robots: { index: false } };
}

export default async function VideoPage({ params }: PageProps<"/[locale]/videos/[id]">) {
  const p = await params;
  const locale = localeFromSegment(p.locale);
  if (!locale) notFound();
  const titles = Object.fromEntries(MEMES.map((m) => [m.id, anyContent(m, locale).title]));
  return (
    <>
      <SiteHeader />
      <VideoView id={p.id} titles={titles} />
    </>
  );
}
