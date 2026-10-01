import { timingSafeEqual } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { json } from "@/lib/server/http";
import { mediaDir } from "@/lib/server/media-files";
import { importHotelLobby } from "@/lib/server/media-import";
import { mediaReady } from "@/lib/server/media-ready";
import { getMeme } from "@/memes";

export const maxDuration = 600;

function authorized(req: Request): boolean {
  const expected = process.env.ADMIN_TOKEN;
  const given = req.headers.get("x-admin-token") ?? "";
  if (!expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET() {
  return json({ ready: mediaReady(getMeme("hotel-lobby")!) });
}

/** Upload the source video(s) and run the import on the server's volume. */
export async function POST(req: Request) {
  if (!process.env.ADMIN_TOKEN) return json({ error: "ADMIN_TOKEN is not set on the server" }, 503);
  if (!authorized(req)) return json({ error: "Wrong admin token" }, 401);
  const form = await req.formData().catch(() => null);
  const h = form?.get("horizontal");
  const v = form?.get("vertical");
  if (!(h instanceof File) || h.size === 0) return json({ error: "Choose the horizontal video" }, 400);
  const tmp = join(mediaDir(), ".upload");
  await mkdir(tmp, { recursive: true });
  const hp = join(tmp, "horizontal.mp4");
  const vp = v instanceof File && v.size > 0 ? join(tmp, "vertical.mp4") : null;
  try {
    await writeFile(hp, Buffer.from(await h.arrayBuffer()));
    if (vp && v instanceof File) await writeFile(vp, Buffer.from(await v.arrayBuffer()));
    const log: string[] = [];
    await importHotelLobby(hp, vp, (l) => log.push(l));
    return json({ ok: true, log });
  } catch (e) {
    console.error("media import failed", e);
    return json({ error: e instanceof Error ? e.message.slice(0, 300) : "Import failed" }, 500);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
