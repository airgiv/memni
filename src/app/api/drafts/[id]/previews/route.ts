import { after } from "next/server";
import { requireUserId } from "@/lib/server/auth";
import { body, demoFlags, handle, json, type RouteCtx } from "@/lib/server/http";
import { presentPreview } from "@/lib/server/present";
import { PriceChangedError, requestScenePreview } from "@/lib/server/services/previews";

/**
 * Starts ONE shared scene preview. Free while the free offer lasts; otherwise
 * the client must send the quoted amount it showed (402 with the quote if not)
 * and a purchase key, so a double click never pays twice.
 */
export const POST = handle(async (req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  const userId = await requireUserId();
  const b = await body<{ acceptAmountMinor?: number | null; purchaseKey?: string }>(req);
  try {
    const { preview, run } = await requestScenePreview(userId, id, { acceptAmountMinor: b.acceptAmountMinor, purchaseKey: b.purchaseKey }, await demoFlags());
    if (run) after(run);
    return json({ preview: presentPreview(preview, preview.fingerprint), reused: !run }, run ? 202 : 200);
  } catch (e) {
    if (e instanceof PriceChangedError) return json({ error: e.message, code: e.code, quote: e.quote }, 402);
    throw e;
  }
});
