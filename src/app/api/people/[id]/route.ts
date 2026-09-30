import { requireUserId } from "@/lib/server/auth";
import { body, handle, json, type RouteCtx } from "@/lib/server/http";
import { presentPerson } from "@/lib/server/present";
import { getRepo } from "@/lib/server/repo";
import { deletePerson, updatePerson } from "@/lib/server/services/people";

type P = { id: string };

export const PATCH = handle(async (req: Request, ctx: RouteCtx<P>) => {
  const { id } = await ctx.params;
  const userId = await requireUserId();
  const b = await body<{ name?: string; saved?: boolean; mainPhotoId?: string; appearanceNote?: string | null }>(req);
  const p = await updatePerson(userId, id, b);
  return json(presentPerson({ ...p, photos: await getRepo().listPhotos(userId, [id]) }));
});

/** Deletes the person, all their source photos and every preview made from them. */
export const DELETE = handle(async (_req: Request, ctx: RouteCtx<P>) => {
  const { id } = await ctx.params;
  return json(await deletePerson(await requireUserId(), id));
});
