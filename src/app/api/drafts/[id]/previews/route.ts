import { after } from "next/server";
import { requireUserId } from "@/lib/server/auth";
import { body, demoFlags, handle, json, publicPreview, type RouteCtx } from "@/lib/server/http";
import { requestPersonPreview, requestScenePreview } from "@/lib/server/services/previews";

/**
 * Starts ONE image generation. Runs only on this explicit request, never on
 * settings changes. Answers immediately with the pending preview; the image
 * call continues after the response and the client polls the draft.
 */
export const POST = handle(async (req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  const userId = await requireUserId();
  const b = await body<{ roleId?: string }>(req);
  const demo = await demoFlags();
  const { preview, run } = b.roleId
    ? await requestPersonPreview(userId, id, b.roleId, demo)
    : await requestScenePreview(userId, id, demo);
  if (run) after(run);
  return json({ preview: publicPreview(preview), reused: !run }, run ? 202 : 200);
});
