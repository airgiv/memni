import { requireUserId } from "@/lib/server/auth";
import { handle, json, publicPhoto, type RouteCtx } from "@/lib/server/http";
import { addPhotoToRole } from "@/lib/server/services/people";
import { UserError } from "@/lib/server/services/errors";

/** Photo for the person in this role; the first photo creates and casts the person. */
export const POST = handle(async (req: Request, ctx: RouteCtx<{ id: string; roleId: string }>) => {
  const { id, roleId } = await ctx.params;
  const userId = await requireUserId();
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new UserError("no_file", "Выберите фото");
  const save = form?.get("save") !== "false";
  const res = await addPhotoToRole(userId, id, roleId, { bytes: Buffer.from(await file.arrayBuffer()), type: file.type, name: file.name }, save);
  return json({ photo: publicPhoto(res.photo), personId: res.personId, notes: res.notes }, 201);
});
