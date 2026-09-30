import { requireUserId } from "@/lib/server/auth";
import { handle, json, type RouteCtx } from "@/lib/server/http";
import { getRepo } from "@/lib/server/repo";
import { UserError } from "@/lib/server/services/errors";
import { publicJob } from "@/lib/server/services/jobs";
import { getStorage } from "@/lib/server/storage";

type P = { id: string };

export const GET = handle(async (_req: Request, ctx: RouteCtx<P>) => {
  const { id } = await ctx.params;
  const userId = await requireUserId();
  const repo = getRepo();
  const job = await repo.getJob(userId, id);
  if (!job) throw new UserError("not_found", "Видео не найдено", 404);
  const order = await repo.getOrderForJob(userId, id);
  return json({ job: publicJob(job), order });
});

export const DELETE = handle(async (_req: Request, ctx: RouteCtx<P>) => {
  const { id } = await ctx.params;
  const keys = await getRepo().deleteJob(await requireUserId(), id);
  await getStorage().remove(keys);
  return json({ ok: true });
});
