import { notFound } from "next/navigation";
import { getTemplate } from "@/lib/templates";
import { mediaReady } from "@/lib/server/media-ready";
import { MemeScreen } from "@/components/MemeScreen";

export const dynamic = "force-dynamic";

export default async function MemePage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  const t = getTemplate(templateId);
  if (!t) notFound();
  return <MemeScreen meme={{ id: t.id, title: t.title, example: t.media.example, aspectRatio: t.aspectRatio, ready: mediaReady(t) }} />;
}
