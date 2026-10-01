/**
 * Serves imported meme media from MEDIA_DIR (a volume in production). Public
 * by design — it is the landing video — with Range support for Safari.
 */
import { open, stat } from "node:fs/promises";
import { mediaFile } from "@/lib/server/media-files";

const TYPES: Record<string, string> = { mp4: "video/mp4", webm: "video/webm", m4a: "audio/mp4", jpg: "image/jpeg", png: "image/png" };

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (path.some((p) => p === ".." || p.includes("\0"))) return new Response("Not found", { status: 404 });
  let file: string;
  let size: number;
  try {
    file = mediaFile(`/media/${path.join("/")}`);
    const st = await stat(file);
    if (!st.isFile()) throw new Error("not a file");
    size = st.size;
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const type = TYPES[file.split(".").pop() ?? ""] ?? "application/octet-stream";
  const headers: Record<string, string> = { "content-type": type, "accept-ranges": "bytes", "cache-control": "public, max-age=600" };
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  let start = 0;
  let end = size - 1;
  let status = 200;
  if (m) {
    start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    status = 206;
    headers["content-range"] = `bytes ${start}-${end}/${size}`;
  }
  headers["content-length"] = String(end - start + 1);
  const fh = await open(file, "r");
  const stream = fh.createReadStream({ start, end });
  const body = new ReadableStream({
    start(c) {
      stream.on("data", (chunk) => c.enqueue(new Uint8Array(chunk as Buffer)));
      stream.on("end", () => c.close());
      stream.on("error", (e) => c.error(e));
    },
    cancel() {
      stream.destroy();
    },
  });
  return new Response(body, { status, headers });
}
