import { existsSync } from "node:fs";
import type { MemeDef } from "../../memes/types";
import { mediaFile } from "./media-files";

/** Are the meme's real media files in place (imported with `npm run media:import`)? */
export function mediaReady(m: MemeDef): boolean {
  const files = [m.media.video.src, m.media.source.src, m.media.audio.src, m.media.referenceFrame.src, ...m.roles.flatMap((r) => [r.cutout.src, r.face.src]), ...(m.media.mobile ? [m.media.mobile.video.src, m.media.mobile.poster.src] : [])];
  return files.every((src) => /^https?:\/\//.test(src) || existsSync(mediaFile(src)));
}
