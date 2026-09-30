import { notFound } from "next/navigation";
import { getTemplate } from "@/lib/templates";
import { getConfig } from "@/lib/config";
import { videoPrice } from "@/lib/server/pricing";
import { MemeScreen } from "@/components/MemeScreen";

export default async function MemePage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  const t = getTemplate(templateId);
  if (!t) notFound();
  return (
    <MemeScreen
      meme={{ id: t.id, title: t.title, example: t.media.example, aspectRatio: t.aspectRatio }}
      price={videoPrice(t)}
      paymentsLive={getConfig().payments.live}
    />
  );
}
