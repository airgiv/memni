/**
 * Where meme media live on disk. Licensed clips are never in git or in
 * public/: they are imported into MEDIA_DIR (default .media locally, a mounted
 * volume in production) and served by /media/[...path].
 */
import { isAbsolute, join, normalize, sep } from "node:path";

export function mediaDir(): string {
  const d = process.env.MEDIA_DIR ?? ".media";
  return isAbsolute(d) ? d : join(process.cwd(), d);
}

/** Absolute file path for a media `src` from the meme config ("/media/…" or a /public path). */
export function mediaFile(src: string): string {
  if (src.startsWith("/media/")) {
    const root = normalize(mediaDir());
    const p = normalize(join(root, src.slice("/media/".length)));
    if (!p.startsWith(root + sep)) throw new Error("bad media path");
    return p;
  }
  return join(process.cwd(), "public", src);
}
