import { requireUserId } from "@/lib/server/auth";
import { handle, json, type RouteCtx } from "@/lib/server/http";
import { publicJob, retryJob } from "@/lib/server/services/jobs";

export const POST = handle(async (_req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  return json({ job: publicJob(await retryJob(await requireUserId(), id)) });
});
