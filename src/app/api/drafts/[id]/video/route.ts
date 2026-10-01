import { requireUserId } from "@/lib/server/auth";
import { body, demoFlags, handle, json, type RouteCtx } from "@/lib/server/http";
import { publicJob, startVideo, VideoPriceError } from "@/lib/server/services/jobs";
import { UserError } from "@/lib/server/services/errors";
import { requestBilling } from "@/lib/server/billing-request";

/** Idempotent: the same inputs and mode always map to the same job and the same purchase. */
export const POST = handle(async (req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  const b = await body<{ mode?: string; previewId?: string; acceptAmountMinor?: number | null; acceptCurrency?: string | null }>(req);
  if (b.mode !== "preview" && b.mode !== "direct") throw new UserError("bad_mode", "Invalid request");
  try {
    const { job, created } = await startVideo(
      await requireUserId(),
      id,
      { mode: b.mode, previewId: b.previewId, acceptAmountMinor: b.acceptAmountMinor, acceptCurrency: b.acceptCurrency },
      await requestBilling(),
      await demoFlags(),
    );
    return json({ job: publicJob(job), created }, created ? 201 : 200);
  } catch (e) {
    if (e instanceof VideoPriceError) return json({ error: e.message, code: e.code, price: e.price }, 402);
    throw e;
  }
});
