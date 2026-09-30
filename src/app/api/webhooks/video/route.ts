import { getRepo } from "@/lib/server/repo";
import { json } from "@/lib/server/http";

/**
 * Provider callbacks (Kling `callback_url`, Higgsfield `hf_webhook`).
 * The payload is NOT trusted: we only use it to find the job and ask the
 * worker to check the real status with the provider's API right away. A forged
 * or replayed call can therefore at most cause one extra status request.
 * Repeated notifications are harmless for the same reason.
 */
export async function POST(req: Request) {
  const payload = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const data = (payload?.data ?? payload) as Record<string, unknown> | null;
  const taskId = typeof data?.task_id === "string" ? data.task_id : typeof data?.request_id === "string" ? data.request_id : null;
  if (!taskId) return json({ ok: true });
  const repo = getRepo();
  const job = await findJob(repo, taskId);
  if (job && job.status === "generating") await repo.updateJob(job.id, { nextPollAt: new Date().toISOString() });
  return json({ ok: true });
}

async function findJob(repo: ReturnType<typeof getRepo>, taskId: string) {
  const { getVideoProvider } = await import("@/lib/providers/video");
  return repo.getJobByProviderTask(getVideoProvider().name, taskId);
}
