import { TEMPLATES } from "@/lib/templates";
import { Catalog } from "@/components/Catalog";

export default function Home() {
  const items = TEMPLATES.map((t) => ({ id: t.id, title: t.title, poster: t.media.example.poster, aspectRatio: t.aspectRatio }));
  return <Catalog items={items} />;
}
