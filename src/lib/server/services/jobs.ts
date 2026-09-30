/**
 * Starting and retrying video jobs. Two honest paths:
 *  - "preview": the chosen, still-actual scene image + people's photos + roles + looks;
 *  - "direct":  people's photos + roles + looks + the source clip, no prepared image
 *               (no hidden paid picture is generated for it).
 * The job gets a frozen copy of every input and the price; the idempotency key
 * comes from those inputs, so a repeated click, a second tab or a network
 * retry returns the same job and the same (test) purchase.
 */
import { randomUUID } from "node:crypto";
import { getConfig } from "../../config";
import { fingerprint } from "../../domain/hash";
import { VIDEO_NEGATIVE_PROMPT, videoPrompt, videoPromptDirect, type ScenePerson } from "../../domain/prompts";
import type { Job, JobInput, VideoMode } from "../../domain/types";
import { getVideoProvider, planVideoInputs } from "../../providers/video";
import { getRepo, LimitError } from "../repo";
import { getStorage } from "../storage";
import { acceptedAmountMatches, videoPrice } from "../pricing";
import { loadDraft } from "./drafts";
import { UserError } from "./errors";
import type { DemoFlags } from "./previews";

export class VideoPriceError extends UserError {
  constructor(public price: ReturnType<typeof videoPrice>) {
    super("price_required", "Подтвердите цену видео", 402);
  }
}

export async function startVideo(
  userId: string,
  draftId: string,
  req: { mode: VideoMode; previewId?: string; acceptAmountMinor?: number | null },
  demo: DemoFlags,
): Promise<{ job: Job; created: boolean }> {
  const c = getConfig();
  const repo = getRepo();
  const storage = getStorage();
  const { t, draft, ctx, rec } = await loadDraft(userId, draftId);

  const people: (ScenePerson & { personId: string; photoKeys: string[] })[] = [];
  for (const role of t.roles) {
    const a = draft.assignments[role.id];
    const inputs = a ? ctx.people.get(a.personId) : undefined;
    if (!a || !inputs || inputs.photos.length < t.photoRequirements.minPhotos) throw new UserError("not_ready", "Добавьте фото всех участников");
    people.push({ role, person: inputs.person, look: a.look, personId: a.personId, photoKeys: inputs.photos.slice(0, 3).map((p) => p.storageKey) });
  }

  let scene = undefined as undefined | { id: string; storageKey: string };
  if (req.mode === "preview") {
    const p = req.previewId ? ctx.previews.get(req.previewId) : undefined;
    if (!p || p.kind !== "scene" || p.status !== "ready" || !p.storageKey) throw new UserError("no_preview", "Выберите готовое превью");
    // never send an outdated picture: it was made for other photos or settings
    if (p.fingerprint !== rec.inputsFingerprint) throw new UserError("stale_preview", "Превью сделано для прежних фото. Создайте новое или выберите «Сразу видео»", 409);
    scene = { id: p.id, storageKey: p.storageKey };
  }

  const provider = getVideoProvider();
  const plan = planVideoInputs(t, provider.capabilities, req.mode);
  if (!plan.ok) throw new UserError("unsupported", plan.problem ?? "Видео пока недоступно", 422);

  const price = videoPrice(t);
  if (!acceptedAmountMatches(price, req.acceptAmountMinor)) throw new VideoPriceError(price);

  const idempotencyKey = fingerprint({ draftId, inputs: rec.inputsFingerprint, mode: req.mode, scene: scene?.id ?? null, provider: provider.name });
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

  const input: JobInput = {
    templateId: t.id,
    templateVersion: t.version,
    promptVersion: t.pipeline.promptVersion,
    mode: req.mode,
    prompt: req.mode === "preview" ? videoPrompt(t, draft.scene.optionId, people) : videoPromptDirect(t, draft.scene.optionId, people),
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
    // duplicate click: drop the copies we just made, return the existing job (no second charge)
    await storage.remove(copied);
    return result;
  }
  // test purchase: the real payment step comes later; nothing is charged now
  await repo.createOrder({
    id: randomUUID(),
    userId,
    kind: "video",
    refId: jobId,
    idempotencyKey: `video:${jobId}`,
    amountMinor: price?.amountMinor ?? null,
    currency: price?.currency ?? c.pricing.currency,
    priceIsExample: price?.isExample ?? true,
    status: "test_paid",
    method: "test",
    createdAt: now,
  });
  try {
    await repo.updateDraft({ ...draft, lastJobId: jobId, version: draft.version + 1, updatedAt: now }, draft.version);
  } catch {
    /* the draft moved on; the job is still listed under «Мои видео» */
  }
  return result;
}

const NOT_RETRYABLE = ["rejected_input", "duration_mismatch", "unsupported", "config"];

/** Manual retry within the attempt budget, already paid for. Never automatic. */
export async function retryJob(userId: string, jobId: string): Promise<Job> {
  const repo = getRepo();
  const job = await repo.getJob(userId, jobId);
  if (!job) throw new UserError("not_found", "Видео не найдено", 404);
  if (job.status !== "failed") throw new UserError("not_failed", "Повторить можно только видео с ошибкой");
  if (NOT_RETRYABLE.includes(job.errorCode ?? "")) throw new UserError("not_retryable", "Повтор не поможет — попробуйте другие фото");
  if (job.attempts >= job.maxAttempts) throw new UserError("attempts", "Попытки закончились. Оплата возвращена", 429);
  return repo.updateJob(job.id, { status: "queued", error: undefined, errorCode: undefined, providerTaskId: undefined, nextPollAt: undefined, lockedBy: undefined, lockedUntil: undefined, finishedAt: undefined });
}

export function isTerminalFailure(job: Pick<Job, "status" | "attempts" | "maxAttempts" | "errorCode">) {
  return job.status === "failed" && (job.attempts >= job.maxAttempts || NOT_RETRYABLE.includes(job.errorCode ?? ""));
}

/** One clear reason, without provider names or technical details. */
function friendlyError(job: Job): string | null {
  if (job.status === "needs_review") return "Видео проверяем вручную. Повторно ничего не спишем";
  if (job.status !== "failed") return null;
  switch (job.errorCode) {
    case "rejected_input":
      return "Сервис не принял фото. Попробуйте другие";
    case "config":
    case "unsupported":
      return "Видео сейчас недоступно. Оплата возвращена";
    case "attempts":
      return "Попытки закончились. Оплата возвращена";
  }
  return isTerminalFailure(job) ? "Видео не получилось. Оплата возвращена" : "Видео не получилось. Повтор — без оплаты";
}

/** Browser-safe job: no storage keys, provider names or internal ids. */
export function publicJob(job: Job) {
  return {
    id: job.id,
    draftId: job.draftId,
    status: job.status,
    isDemo: job.isDemo,
    mode: job.input.mode,
    templateId: job.input.templateId,
    durationSec: job.input.durationSec,
    price: job.input.price,
    error: friendlyError(job),
    hasResult: Boolean(job.resultKey),
    resultMeta: job.resultMeta ?? null,
    attemptsLeft: Math.max(0, job.maxAttempts - job.attempts),
    retryable: job.status === "failed" && !isTerminalFailure(job),
    createdAt: job.createdAt,
  };
}
export type PublicJob = ReturnType<typeof publicJob>;
