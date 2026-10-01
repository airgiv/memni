import { requireUserId } from "@/lib/server/auth";
import { handle, json, type RouteCtx } from "@/lib/server/http";
import { getRepo } from "@/lib/server/repo";
import { UserError } from "@/lib/server/services/errors";
import { publicJob } from "@/lib/server/services/jobs";
import { getStorage, keys } from "@/lib/server/storage";

type P = { id: string };

export const GET = handle(async (_req: Request, ctx: RouteCtx<P>) => {
  const { id } = await ctx.params;
  const userId = await requireUserId();
  const repo = getRepo();
  const job = await repo.getJob(userId, id);
  if (!job) throw new UserError("not_found", "Video not found", 404);
  const order = await repo.getOrderForRef(userId, id);
  return json({ job: publicJob(job), order: order && { amountMinor: order.amountMinor, currency: order.currency, priceIsExample: order.priceIsExample, status: order.status } });
});

export const DELETE = handle(async (_req: Request, ctx: RouteCtx<P>) => {
  const { id } = await ctx.params;
  const userId = await requireUserId();
  const files = await getRepo().deleteJob(userId, id);
  await getStorage().remove([...files, keys.poster(userId, id)]);
  return json({ ok: true });
});
