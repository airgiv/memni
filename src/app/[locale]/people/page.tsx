import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PeopleManager } from "@/components/PeopleManager";
import { SiteHeader } from "@/components/SiteHeader";
import { getMessages, localeFromSegment } from "@/i18n";

export async function generateMetadata({ params }: PageProps<"/[locale]/people">): Promise<Metadata> {
  const locale = localeFromSegment((await params).locale);
  if (!locale) notFound();
  // private, per-browser content: not for search engines
  return { title: `${getMessages(locale).meta.peopleTitle} · Мемме`, robots: { index: false } };
}

export default function PeoplePage() {
  return (
    <>
      <SiteHeader />
      <PeopleManager />
    </>
  );
}
