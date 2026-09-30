import { publicConfig } from "@/lib/config";
import { requireUserId } from "@/lib/server/auth";
import { handle, json } from "@/lib/server/http";
import { getRepo } from "@/lib/server/repo";
import { listDrafts } from "@/lib/server/services/drafts";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const userId = await requireUserId();
  const repo = getRepo();
  const cfg = publicConfig();
  const [drafts, user] = await Promise.all([listDrafts(userId), repo.getUser(userId)]);
  return json({
    config: cfg,
    user: { kind: user?.kind ?? "anon", displayName: user?.displayName ?? null },
    drafts,
  });
});
