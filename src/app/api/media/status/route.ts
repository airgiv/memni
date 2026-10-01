import { json } from "@/lib/server/http";
import { mediaReady } from "@/lib/server/media-ready";
import { getMeme } from "@/memes";

/** Are a meme's licensed media imported on this server? (Pages are static; the browser asks.) */
export async function GET(req: Request) {
  const m = getMeme(new URL(req.url).searchParams.get("meme") ?? "");
  return json({ ready: m ? mediaReady(m) : false });
}
