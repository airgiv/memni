import { TEMPLATES } from "@/lib/templates";
import { getConfig } from "@/lib/config";
import { Catalog } from "@/components/Catalog";

export const dynamic = "force-dynamic";

export default function Home() {
  const c = getConfig();
  const templates = TEMPLATES.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    kind: t.kind,
    demoMaterials: t.demoMaterials,
    durationSec: t.durationSec,
    aspectRatio: t.aspectRatio,
    roles: t.roles.map((r) => ({ id: r.id, name: r.name, tone: r.tone })),
    price: t.price,
    example: t.media.example,
  }));
  return <Catalog templates={templates} isDemo={c.isDemo} />;
}
