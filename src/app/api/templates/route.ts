import { TEMPLATES } from "@/lib/templates";
import { json } from "@/lib/server/http";

// templates are public config; prompts stay server-side
export function GET() {
  return json(
    TEMPLATES.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      kind: t.kind,
      demoMaterials: t.demoMaterials,
      durationSec: t.durationSec,
      aspectRatio: t.aspectRatio,
      roles: t.roles.length,
      price: t.price,
      example: t.media.example,
    })),
  );
}
