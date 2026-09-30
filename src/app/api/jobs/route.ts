import { requireUserId } from "@/lib/server/auth";
import { handle, json } from "@/lib/server/http";
import { getRepo } from "@/lib/server/repo";
import { publicJob } from "@/lib/server/services/jobs";

export const GET = handle(async () => json((await getRepo().listJobs(await requireUserId())).map(publicJob)));
