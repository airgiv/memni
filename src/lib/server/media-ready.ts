import { existsSync } from "node:fs";
import { join } from "node:path";
import type { TemplateDef } from "../templates/types";

/** Are the template's real media files in place (imported with `npm run media:import`)? */
export function mediaReady(t: TemplateDef): boolean {
  const files = [t.media.example.src, t.media.source.src, t.media.audio.src, t.media.referenceFrame.src, ...t.roles.map((r) => r.cutout.src)];
  return files.every((src) => /^https?:\/\//.test(src) || existsSync(join(process.cwd(), "public", src)));
}
