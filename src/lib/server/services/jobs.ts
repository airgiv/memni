/**
 * Starting and retrying video jobs. The job gets a frozen copy of every input
 * (prompt, template version, copies of the approved images), so editing the
 * draft afterwards can never change a running generation. The idempotency key
 * is derived from the confirmed scene: pressing «Создать видео» twice, from
 * two tabs, or after a network timeout returns the same job.
 */
import { randomUUID } from "node:crypto";
import { getConfig } from "../../config";
import { fingerprint } from "../../domain/hash";
import { VIDEO_NEGATIVE_PROMPT, videoPrompt } from "../../domain/prompts";
import type { Job, JobInput } from "../../domain/types";
import { getVideoProvider, planVideoInputs } from "../../providers/video";
import { getRepo, LimitError } from "../repo";
import { getStorage } from "../storage";
import { loadDraft } from "./drafts";
import { UserError } from "./errors";
import type { DemoFlags } from "./previews";

export async function startVideo(userId: string, draftId: string, demo: DemoFlags): Promise<{ job: Job; created: boolean }> {
  const c = getConfig();
  const repo = getRepo();
  const storage = getStorage();
  const { t, draft, ctx, rec } = await loadDraft(userId, draftId);
  const scene = draft.sceneConfirmedPreviewId ? ctx.previews.get(draft.sceneConfirmedPreviewId) : undefined;
  if (!scene?.storageKey) throw new UserError("scene_unconfirmed", "Сначала подтвердите финальное фото сцены");

  const provider = getVideoProvider();
  const plan = planVideoInputs(t, provider.capabilities, provider.name);
  if (!plan.ok) throw new UserError("unsupported", plan.problem ?? "Сценарий недоступен", 422);

  const idempotencyKey = fingerprint({ draftId, scene: scene.id, fp: rec.sceneFingerprint, provider: provider.name });
  const jobId = randomUUID();

  // freeze inputs: copy the files the job depends on into its own folder
  const base = `u/${userId}/jobs/${jobId}`;
  const copy = async (key: string, name: string) => {
    const dest = `${base}/${name}`;
    await storage.put(dest, await storage.get(key), "image/jpeg");
    return dest;
  };
  const sceneImageKey = await copy(scene.storageKey, "scene.jpg");
  const people: JobInput["people"] = [];
  const scenePeople = [];
  for (const role of t.roles) {
    const a = draft.assignments[role.id]!;
    const inputs = ctx.people.get(a.personId)!;
    const conf = ctx.previews.get(a.confirmedPreviewId!)!;
    const main = inputs.photos.find((p) => p.id === inputs.person.mainPhotoId) ?? inputs.photos[0];
    people.push({
      roleId: role.id,
      personId: a.personId,
      previewKey: await copy(conf.storageKey!, `look-${role.id}.jpg`),
      referenceKeys: main ? [await copy(main.storageKey, `photo-${role.id}.jpg`)] : [],
    });
    scenePeople.push({ role, person: inputs.person, look: a.look });
  }

  const input: JobInput = {
    templateId: t.id,
    templateVersion: t.version,
    promptVersion: t.pipeline.promptVersion,
    prompt: videoPrompt(t, draft.scene.optionId, scenePeople),
    negativePrompt: VIDEO_NEGATIVE_PROMPT,
    durationSec: t.durationSec,
    aspectRatio: t.aspectRatio,
    sceneImageKey,
    sourceVideo: t.media.source,
    audio: t.media.audio,
    people,
    scenePreviewId: scene.id,
    sceneFingerprint: rec.sceneFingerprint,
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
    result = await repo.createJobOnce(job, {
      perUser: c.limits.maxActiveJobsPerUser,
      global: c.limits.maxActiveJobsGlobal,
      perDay: c.limits.maxJobsPerUserPerDay,
    });
  } catch (e) {
    await storage.remove([sceneImageKey, ...people.flatMap((p) => [p.previewKey!, ...p.referenceKeys])]);
    if (e instanceof LimitError) throw new UserError(e.code, e.message, 429);
    throw e;
  }
  if (!result.created) {
    // duplicate click: drop the copies we just made, return the existing job
    await storage.remove([sceneImageKey, ...people.flatMap((p) => [p.previewKey!, ...p.referenceKeys])]);
    return result;
  }
  // test order: shows the future payment step; nothing is charged
  await repo.createOrder({
    id: randomUUID(),
    userId,
    jobId,
    amountMinor: t.price?.amountMinor ?? null,
    currency: t.price?.currency ?? "RUB",
    priceIsExample: t.price?.isExample ?? true,
    status: "test",
    method: "none",
    createdAt: now,
  });
  // remember the job on the draft (best effort: a version conflict here is harmless)
  try {
    await repo.updateDraft({ ...draft, lastJobId: jobId, version: draft.version + 1, updatedAt: now }, draft.version);
  } catch {
    /* the draft moved on; the job is still listed under «Мои видео» */
  }
  return result;
}

/** Manual retry within the attempt budget. Never automatic. */
export async function retryJob(userId: string, jobId: string): Promise<Job> {
  const repo = getRepo();
  const job = await repo.getJob(userId, jobId);
  if (!job) throw new UserError("not_found", "Видео не найдено", 404);
  if (job.status !== "failed") throw new UserError("not_failed", "Повторить можно только задание с ошибкой");
  if (job.errorCode === "rejected_input" || job.errorCode === "duration_mismatch")
    throw new UserError("not_retryable", "Эту ошибку повтор не исправит — нужны другие материалы или ручная проверка");
  if (job.attempts >= job.maxAttempts)
    throw new UserError("attempts", "Попытки для этого видео закончились. Мы не запускаем бесконечные перегенерации", 429);
  return repo.updateJob(job.id, { status: "queued", error: undefined, errorCode: undefined, providerTaskId: undefined, nextPollAt: undefined, lockedBy: undefined, lockedUntil: undefined, finishedAt: undefined });
}

export function publicJob(job: Job) {
  // never expose storage keys or the provider's internal ids to the browser
  const { input, lockedBy, lockedUntil, providerExternalId, rawResultKey, ...rest } = job;
  void lockedBy;
  void lockedUntil;
  void providerExternalId;
  void rawResultKey;
  return {
    ...rest,
    resultKey: undefined,
    hasResult: Boolean(job.resultKey),
    input: { templateId: input.templateId, templateVersion: input.templateVersion, durationSec: input.durationSec, promptVersion: input.promptVersion, roles: input.people.map((p) => ({ roleId: p.roleId, personId: p.personId })) },
    retryable: job.status === "failed" && job.attempts < job.maxAttempts && !["rejected_input", "duration_mismatch"].includes(job.errorCode ?? ""),
  };
}
export type PublicJob = ReturnType<typeof publicJob>;
