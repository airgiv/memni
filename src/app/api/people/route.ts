import { requireUserId } from "@/lib/server/auth";
import { body, handle, json } from "@/lib/server/http";
import { presentPerson } from "@/lib/server/present";
import { createPerson, listPeopleWithPhotos } from "@/lib/server/services/people";

export const GET = handle(async () => json((await listPeopleWithPhotos(await requireUserId())).map(presentPerson)));

export const POST = handle(async (req: Request) => {
  const userId = await requireUserId();
  const b = await body<{ name?: string; saved?: boolean }>(req);
  const p = await createPerson(userId, String(b.name ?? ""), Boolean(b.saved));
  return json(presentPerson({ ...p, photos: [] }), 201);
});
