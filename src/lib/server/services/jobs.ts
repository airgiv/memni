/**
 * Starting and retrying video jobs. Two honest paths:
 *  - "preview": the approved, still-actual preview image + people's photos + roles + looks;
 *  - "direct":  people's photos + roles + looks + the source clip. When the model
 *               needs one prepared image, the worker makes an internal reference
 *               frame first — it is never shown and never charged separately.
 * The job gets a frozen copy of every input, the structured generation spec
 * and the price; the idempotency key comes from those inputs, so a repeated
 * click, a second tab or a network retry returns the same job and purchase.
 */
import { randomUUID } from "node:crypto";
import { getConfig } from "../../config";
import { fingerprint } from "../../domain/hash";
import { buildSpec, renderVideoDirectPrompt, renderVideoPrompt, VIDEO_NEGATIVE_PROMPT } from "../../domain/prompts";
import type { Job, JobInput, Money, VideoMode } from "../../domain/types";
import type { BillingContext } from "../../commerce/billing";
import { getImageProvider } from "../../providers/image";
import { getVideoProvider, planVideoInputs, replacementScope } from "../../providers/video";
import { getRepo, LimitError } from "../repo";
import { getStorage } from "../storage";
import { acceptedPriceMatches, chargeOrder, videoPrice } from "../pricing";
import { loadDraft } from "./drafts";
import { UserError } from "./errors";
import { collectParticipants, type DemoFlags } from "./previews";

export class VideoPriceError extends UserError {
  constructor(public price: Money) {
    super("price_required", "Confirm the video price", 402);
  }
}

export async function startVideo(
  userId: string,
  draftId: string,
  req: { mode: VideoMode; previewId?: string; acceptAmountMinor?: number | null; acceptCurrency?: string | null },
  billing: BillingContext,
  demo: DemoFlags,
): Promise<{ job: Job; created: boolean }> {
  const c = getConfig();
  const repo = getRepo();
  const storage = getStorage();
  const loaded = await loadDraft(userId, draftId);
  const { t, draft, ctx, rec } = loaded;
  const people = collectParticipants(t, loaded);

  let scene = undefined as undefined | { id: string; storageKey: string };
  if (req.mode === "preview") {
    const p = req.previewId ? ctx.previews.get(req.previewId) : undefined;
    if (!p || p.kind !== "scene" || p.status !== "ready" || !p.storageKey) throw new UserError("no_preview", "Choose a finished preview");
    // never send an outdated picture: it was made for other photos or settings
    if (p.fingerprint !== rec.inputsFingerprint) throw new UserError("stale_preview", "This preview was made with earlier settings", 409);
    scene = { id: p.id, storageKey: p.storageKey };
  }

  const provider = getVideoProvider();
  const imageProvider = getImageProvider();
  const plan = planVideoInputs(t, provider.capabilities, req.mode, imageProvider);
  if (!plan.ok) throw new UserError("unsupported", plan.problem ?? "no_direct", 422);
  const scope = replacementScope(provider.capabilities, imageProvider);
  const spec = buildSpec(t, people, scope);

  const price = videoPrice(t, billing);
  if (!acceptedPriceMatches(price, { amountMinor: req.acceptAmountMinor, currency: req.acceptCurrency })) throw new VideoPriceError(price);

  const idempotencyKey = fingerprint({ draftId, inputs: rec.inputsFingerprint, mode: req.mode, scene: scene?.id ?? null, provider: provider.name });
  const existing = await repo.listJobs(userId).then((jobs) => jobs.find((j) => j.idempotencyKey === idempotencyKey));
  if (existing) return { job: existing, created: false };

  const jobId = randomUUID();
  // freeze inputs: copy every file the job depends on into its own folder
  const base = `u/${userId}/jobs/${jobId}`;
  const copied: string[] = [];
  const copy = async (key: string, name: string) => {
    const dest = `${base}/${name}`;
    await storage.put(dest, await storage.get(key), "image/jpeg");
    copied.push(dest);
    return dest;
  };
  const sceneImageKey = scene ? await copy(scene.storageKey, "scene.jpg") : undefined;
  const frozenPeople: JobInput["people"] = [];
  for (const p of people)
    frozenPeople.push({
      roleId: p.role.id,
      personId: p.personId,
      look: p.look,
      referenceKeys: await Promise.all(p.photoKeys.map((k, i) => copy(k, `${p.role.id}-${i}.jpg`))),
    });

  // with a prepared image (approved preview or internal frame) the model animates it
  const fromImage = req.mode === "preview" || Boolean(plan.internalFrame);
  const input: JobInput = {
    templateId: t.id,
    templateVersion: t.version,
    promptVersion: t.generation.promptVersion,
    mode: req.mode,
    spec,
    scope,
    internalFrame: plan.internalFrame,
    prompt: fromImage ? renderVideoPrompt(t, spec) : renderVideoDirectPrompt(t, spec),
    negativePrompt: VIDEO_NEGATIVE_PROMPT,
    durationSec: t.durationSec,
    aspectRatio: t.aspectRatio,
    sceneImageKey,
    scenePreviewId: scene?.id,
    inputsFingerprint: rec.inputsFingerprint,
    sourceVideo: t.media.source,
    audio: t.media.audio,
    people: frozenPeople,
    price,
    ...(provider.isDemo && demo.failVideo ? { demoFail: "generating" as const } : {}),
  };
  const now = new Date().toISOString();
  const job: Job = {
    id: jobId,
    userId,
    draftId,
    idempotencyKey,
    status: "queued",
    input,
    provider: provider.name,
    isDemo: provider.isDemo,
    attempts: 0,
    maxAttempts: c.limits.maxVideoAttemptsPerJob,
    estimatedCost: provider.estimateCost(t.durationSec),
    costCurrency: "USD",
    createdAt: now,
    updatedAt: now,
  };

  let result: { job: Job; created: boolean };
  try {
    result = await repo.createJobOnce(job, { perUser: c.limits.maxActiveJobsPerUser, global: c.limits.maxActiveJobsGlobal, perDay: c.limits.maxJobsPerUserPerDay });
  } catch (e) {
    await storage.remove(copied);
    if (e instanceof LimitError) throw new UserError(e.code, e.message, 429);
    throw e;
  }
  if (!result.created) {
    // duplicate click raced us: drop our copies, return the existing job (no second charge)
    await storage.remove(copied);
    return result;
  }
  // the purchase is keyed by the job, so it can exist only once
  await repo.createOrder(await chargeOrder({ userId, kind: "video", refId: jobId, idempotencyKey: `video:${jobId}`, price, billing }));
  try {
    await repo.updateDraft({ ...draft, lastJobId: jobId, version: draft.version + 1, updatedAt: now }, draft.version);
  } catch {
    /* the draft moved on; the job is still listed under "My videos" */
  }
  return result;
}

const NOT_RETRYABLE = ["rejected_input", "duration_mismatch", "unsupported", "config"];

/** Manual retry within the attempt budget, already paid for. Never automatic. */
export async function retryJob(userId: string, jobId: string): Promise<Job> {
  const repo = getRepo();
  const job = await repo.getJob(userId, jobId);
  if (!job) throw new UserError("not_found", "Video not found", 404);
  if (job.status !== "failed") throw new UserError("not_failed", "Only a failed video can be retried");
  if (NOT_RETRYABLE.includes(job.errorCode ?? "")) throw new UserError("not_retryable", "Retrying will not help — try other photos");
  if (job.attempts >= job.maxAttempts) throw new UserError("attempts", "No attempts left. The payment was refunded", 429);
  return repo.updateJob(job.id, { status: "queued", error: undefined, errorCode: undefined, providerTaskId: undefined, nextPollAt: undefined, lockedBy: undefined, lockedUntil: undefined, finishedAt: undefined });
}

export function isTerminalFailure(job: Pick<Job, "status" | "attempts" | "maxAttempts" | "errorCode">) {
  return job.status === "failed" && (job.attempts >= job.maxAttempts || NOT_RETRYABLE.includes(job.errorCode ?? ""));
}

/** One stable reason code, without provider names or technical details. The browser localizes it. */
function errorKey(job: Job): string | null {
  if (job.status === "needs_review") return "review";
  if (job.status !== "failed") return null;
  switch (job.errorCode) {
    case "rejected_input":
      return "rejected";
    case "config":
    case "unsupported":
      return "unavailable";
    case "attempts":
      return "attempts";
  }
  return isTerminalFailure(job) ? "failed_refunded" : "failed_retry";
}

/** Generation stage shown to people — no percentages unless a provider reports them. */
export function jobStage(status: Job["status"]): "preparing" | "generating" | "finishing" | "ready" | "failed" | "review" {
  switch (status) {
    case "queued":
    case "submitting":
      return "preparing";
    case "generating":
      return "generating";
    case "assembling":
      return "finishing";
    case "ready":
      return "ready";
    case "needs_review":
      return "review";
    default:
      return "failed";
  }
}

/** Browser-safe job: no storage keys, provider names or internal ids. */
export function publicJob(job: Job) {
  return {
    id: job.id,
    draftId: job.draftId,
    status: job.status,
    stage: jobStage(job.status),
    isDemo: job.isDemo,
    mode: job.input.mode,
    memeId: job.input.templateId,
    durationSec: job.input.durationSec,
    scope: job.input.scope ?? "whole-person",
    price: job.input.price,
    errorKey: errorKey(job),
    hasResult: Boolean(job.resultKey),
    resultMeta: job.resultMeta ?? null,
    attemptsLeft: Math.max(0, job.maxAttempts - job.attempts),
    retryable: job.status === "failed" && !isTerminalFailure(job),
    createdAt: job.createdAt,
  };
}
export type PublicJob = ReturnType<typeof publicJob>;
