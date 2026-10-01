import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { VideosList } from "@/components/VideosList";
import { getMessages, localeFromSegment } from "@/i18n";

export async function generateMetadata({ params }: PageProps<"/[locale]/videos">): Promise<Metadata> {
  const locale = localeFromSegment((await params).locale);
  if (!locale) notFound();
  return { title: `${getMessages(locale).meta.videosTitle} · Мемме`, robots: { index: false } };
}

export default function VideosPage() {
  return (
    <>
      <SiteHeader />
      <VideosList />
    </>
  );
}
