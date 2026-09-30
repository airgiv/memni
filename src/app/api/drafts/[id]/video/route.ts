import { requireUserId } from "@/lib/server/auth";
import { demoFlags, handle, json, type RouteCtx } from "@/lib/server/http";
import { publicJob, startVideo } from "@/lib/server/services/jobs";

/** Idempotent: the same confirmed scene always maps to the same job. */
export const POST = handle(async (_req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  const { job, created } = await startVideo(await requireUserId(), id, await demoFlags());
  return json({ job: publicJob(job), created }, created ? 201 : 200);
});
