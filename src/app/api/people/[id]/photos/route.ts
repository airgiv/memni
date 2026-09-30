import { requireUserId } from "@/lib/server/auth";
import { handle, json, publicPhoto, type RouteCtx } from "@/lib/server/http";
import { addPhoto } from "@/lib/server/services/people";
import { UserError } from "@/lib/server/services/errors";

export const POST = handle(async (req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  const userId = await requireUserId();
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new UserError("no_file", "Выберите фото");
  const res = await addPhoto(userId, id, { bytes: Buffer.from(await file.arrayBuffer()), type: file.type, name: file.name });
  return json({ photo: publicPhoto(res.photo), notes: res.notes }, 201);
});
