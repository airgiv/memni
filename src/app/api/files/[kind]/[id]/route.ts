import { getConfig } from "@/lib/config";
import { requireUserId } from "@/lib/server/auth";
import { handle, type RouteCtx } from "@/lib/server/http";
import { getRepo } from "@/lib/server/repo";
import { UserError } from "@/lib/server/services/errors";
import { getStorage, keys } from "@/lib/server/storage";

/**
 * Private files. The id is looked up WITH the caller's user id, so a file of
 * another user is simply "not found". Local mode streams the bytes (with
 * Range support — Safari needs it for video); Supabase mode redirects to a
 * signed URL that lives for one minute.
 */
export const GET = handle(async (req: Request, ctx: RouteCtx<{ kind: string; id: string }>) => {
  const { kind, id } = await ctx.params;
  const userId = await requireUserId();
  const repo = getRepo();
  let key: string | undefined;
  let type = "image/jpeg";
  let filename = "memme";
  if (kind === "photo") key = (await repo.getPhoto(userId, id))?.storageKey;
  else if (kind === "preview") key = (await repo.getPreview(userId, id))?.storageKey;
  else if (kind === "jobscene") key = (await repo.getJob(userId, id))?.input.sceneImageKey;
  else if (kind === "jobposter") {
    const job = await repo.getJob(userId, id);
    key = job?.status === "ready" ? keys.poster(userId, id) : undefined;
  }
  else if (kind === "job") {
    const job = await repo.getJob(userId, id);
    key = job?.status === "ready" ? job.resultKey : undefined;
    type = "video/mp4";
    filename = `memme-${job?.input.templateId ?? "video"}-${id.slice(0, 8)}.mp4`;
  }
  if (!key) throw new UserError("not_found", "File not found", 404);
  const download = new URL(req.url).searchParams.has("download");

  if (getConfig().dataMode === "supabase") {
    const url = await getStorage().signedUrl(key, 60);
    return Response.redirect(url!, 302);
  }
  const data = await getStorage().get(key);
  const headers: Record<string, string> = {
    "content-type": key.endsWith(".png") ? "image/png" : type,
    "cache-control": "private, max-age=300",
    "accept-ranges": "bytes",
    "x-content-type-options": "nosniff",
  };
  if (download) headers["content-disposition"] = `attachment; filename="${filename}"`;
  const range = req.headers.get("range");
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range);
  if (m) {
    const start = m[1] ? Number(m[1]) : Math.max(0, data.length - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), data.length - 1) : data.length - 1;
    if (start >= data.length || start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${data.length}` } });
    return new Response(new Uint8Array(data.subarray(start, end + 1)), {
      status: 206,
      headers: { ...headers, "content-range": `bytes ${start}-${end}/${data.length}`, "content-length": String(end - start + 1) },
    });
  }
  return new Response(new Uint8Array(data), { headers: { ...headers, "content-length": String(data.length) } });
});
