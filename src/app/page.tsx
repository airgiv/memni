import { TEMPLATES } from "@/lib/templates";
import { mediaReady } from "@/lib/server/media-ready";
import { Catalog } from "@/components/Catalog";

export const dynamic = "force-dynamic";

export default function Home() {
  const items = TEMPLATES.map((t) => ({ id: t.id, title: t.title, poster: t.media.example.poster, aspectRatio: t.aspectRatio, ready: mediaReady(t) }));
  return <Catalog items={items} />;
}
