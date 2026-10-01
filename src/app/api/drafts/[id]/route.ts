import { requireUserId } from "@/lib/server/auth";
import { body, handle, json, type RouteCtx } from "@/lib/server/http";
import { presentDraft } from "@/lib/server/present";
import { getRepo } from "@/lib/server/repo";
import { draftView, mutateDraft, type DraftOp } from "@/lib/server/services/drafts";
import { UserError } from "@/lib/server/services/errors";
import { getStorage } from "@/lib/server/storage";
import { requestBilling } from "@/lib/server/billing-request";

type P = { id: string };

export const GET = handle(async (_req: Request, ctx: RouteCtx<P>) => {
  const { id } = await ctx.params;
  return json(presentDraft(await draftView(await requireUserId(), id, await requestBilling())));
});

const OPS = new Set(["assign", "swap", "clear", "look", "select"]);

export const PATCH = handle(async (req: Request, ctx: RouteCtx<P>) => {
  const { id } = await ctx.params;
  const userId = await requireUserId();
  const b = await body<DraftOp & { version: number }>(req);
  if (!OPS.has(b.op) || typeof b.version !== "number") throw new UserError("bad_op", "Invalid action");
  const { version, ...op } = b;
  return json(presentDraft(await mutateDraft(userId, id, version, op as DraftOp, await requestBilling())));
});

export const DELETE = handle(async (_req: Request, ctx: RouteCtx<P>) => {
  const { id } = await ctx.params;
  const keys = await getRepo().deleteDraft(await requireUserId(), id);
  await getStorage().remove(keys);
  return json({ ok: true });
});
