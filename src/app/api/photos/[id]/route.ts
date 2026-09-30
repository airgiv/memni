import { requireUserId } from "@/lib/server/auth";
import { handle, json, type RouteCtx } from "@/lib/server/http";
import { removePhoto } from "@/lib/server/services/people";

export const DELETE = handle(async (_req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  await removePhoto(await requireUserId(), id);
  return json({ ok: true });
});
