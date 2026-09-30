import { requireUserId } from "@/lib/server/auth";
import { body, handle, json } from "@/lib/server/http";
import { listDrafts, openDraft } from "@/lib/server/services/drafts";

export const GET = handle(async () => json(await listDrafts(await requireUserId())));

/** Opens the unfinished draft of this meme or starts one («Сделать с собой»). */
export const POST = handle(async (req: Request) => {
  const userId = await requireUserId();
  const b = await body<{ templateId?: string; fromDraftId?: string }>(req);
  const draft = await openDraft(userId, String(b.templateId ?? ""), b.fromDraftId);
  return json({ id: draft.id }, 201);
});
