import { publicConfig } from "@/lib/config";
import { requireUserId } from "@/lib/server/auth";
import { handle, json } from "@/lib/server/http";
import { getRepo } from "@/lib/server/repo";
import { listDrafts } from "@/lib/server/services/drafts";
import { publicJob } from "@/lib/server/services/jobs";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const userId = await requireUserId();
  const repo = getRepo();
  const cfg = publicConfig();
  const [used, drafts, jobs, user] = await Promise.all([
    repo.countUsage(userId, "preview_image"),
    listDrafts(userId),
    repo.listJobs(userId),
    repo.getUser(userId),
  ]);
  return json({
    config: cfg,
    user: { kind: user?.kind ?? "anon", displayName: user?.displayName ?? null },
    quota: { used, limit: cfg.freePreviewsPerUser, left: Math.max(0, cfg.freePreviewsPerUser - used) },
    drafts,
    jobs: jobs.map(publicJob),
  });
});
