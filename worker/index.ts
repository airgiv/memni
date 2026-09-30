/**
 * Background worker: leases video jobs and moves them through
 * submit → poll → download → mux original audio → verify.
 *
 *   npm run worker           (reads .env / .env.local like Next does)
 *
 * Several workers may run at once: leases (locked_until) keep them apart.
 */
import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const { getRepo } = await import("../src/lib/server/repo");
const { step } = await import("../src/lib/server/services/worker");
const { getConfig } = await import("../src/lib/config");

const workerId = `w-${process.pid}-${randomUUID().slice(0, 8)}`;
const LEASE_MS = 5 * 60_000;
const IDLE_MS = 1000;
let stopping = false;

process.on("SIGINT", () => (stopping = true));
process.on("SIGTERM", () => (stopping = true));

const c = getConfig();
console.log(`[worker] ${workerId} data=${c.dataMode} video=${c.videoMode}`);

while (!stopping) {
  let job = null;
  try {
    job = await getRepo().claimJob(workerId, LEASE_MS);
    if (job) {
      const before = job.status;
      const after = await step(job, workerId);
      if (after.status !== before) console.log(`[worker] ${job.id.slice(0, 8)} ${before} → ${after.status}${after.error ? ` (${after.error})` : ""}`);
    }
  } catch (e) {
    console.error("[worker] loop error", e);
  }
  if (!job) await new Promise((r) => setTimeout(r, IDLE_MS));
}
console.log("[worker] stopped");
