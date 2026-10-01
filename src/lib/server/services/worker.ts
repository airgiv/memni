/**
 * One step of the video pipeline for one leased job. The worker loop
 * (worker/index.ts) claims a job, calls `step`, and repeats.
 *
 *   queued ─(internal frame)─submit──▶ generating ──poll──▶ assembling ──ffmpeg──▶ ready
 *      │                   │                    │
 *      └── rejected ──▶ failed ◀── provider failed      └─ duration mismatch ─▶ needs_review
 *
 * Money safety:
 *  - the attempt counter and our external id are saved BEFORE the provider call;
 *  - a submit that timed out is never re-sent blindly: we look the task up by
 *    external id if the provider supports it, otherwise the job goes to
 *    needs_review instead of risking a second paid generation;
 *  - retries are manual only (services/jobs.ts retryJob) and capped per job.
 */
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfig } from "../../config";
import type { Job } from "../../domain/types";
import { videoProviderFor, VideoProviderError, type VideoProvider, type VideoStatus } from "../../providers/video";
import { getMeme } from "../../../memes";
import { renderScenePrompt } from "../../domain/prompts";
import { getImageProvider, ImageProviderError } from "../../providers/image";
import { referenceFrame, readRef } from "./previews";
import { assembleWithOriginalAudio, AssemblyCheckError, DurationMismatchError, runFfmpeg } from "../media";
import { getRepo } from "../repo";
import { getStorage, keys } from "../storage";
import { isTerminalFailure } from "./jobs";
import { refundFor } from "../pricing";

const MAX_GENERATION_MS = 2 * 60 * 60 * 1000;

function pollDelay(job: Job, provider: VideoProvider) {
  return provider.isDemo ? 1500 : Math.min(60_000, 10_000 + job.attempts * 5_000);
}

function publicUrl(src: string): string | undefined {
  if (/^https?:\/\//.test(src)) return src;
  const base = process.env.TEMPLATE_MEDIA_BASE_URL ?? getConfig().appUrl;
  if (!base || base.includes("localhost")) return undefined;
  return new URL(src, base).toString();
}

export async function step(job: Job, workerId: string): Promise<Job> {
  const after = await stepInner(job, workerId);
  // a failure the user cannot retry: the (test) payment goes back
  if (isTerminalFailure(after)) await refundFor(after.id);
  return after;
}

async function stepInner(job: Job, workerId: string): Promise<Job> {
  const repo = getRepo();
  const provider = videoProviderFor(job.provider);
  const save = (patch: Partial<Job>) => repo.updateJob(job.id, patch, workerId);
  const release = { lockedBy: undefined, lockedUntil: undefined };

  try {
    switch (job.status) {
      case "queued":
        return await submit(job, provider, save);
      case "submitting":
        // we crashed or timed out mid-submit: find out what happened, never resend blindly
        return await recoverSubmit(job, provider, save);
      case "generating": {
        if (!job.providerTaskId) return await recoverSubmit(job, provider, save);
        if (Date.now() - new Date(job.updatedAt).getTime() > MAX_GENERATION_MS && Date.now() - new Date(job.createdAt).getTime() > MAX_GENERATION_MS)
          return await save({ status: "needs_review", error: "The video service has not answered for too long — a person will check", errorCode: "stuck", ...release });
        const st = await provider.status(job.providerTaskId);
        return await onStatus(job, st, provider, save);
      }
      case "assembling":
        return await assemble(job, provider, save);
      default:
        return await save(release);
    }
  } catch (e) {
    if (e instanceof VideoProviderError && (e.code === "timeout" || e.code === "network")) {
      // transient while polling: keep the job, look again later
      return await save({ nextPollAt: new Date(Date.now() + 30_000).toISOString(), ...release });
    }
    console.error(`[worker] job ${job.id} failed`, e);
    return await save({
      status: "failed",
      error: e instanceof Error ? e.message : "Unknown error",
      errorCode: e instanceof VideoProviderError ? e.code : e instanceof ImageProviderError && e.code === "safety" ? "rejected_input" : "internal",
      finishedAt: new Date().toISOString(),
      ...release,
    });
  }
}

type Save = (patch: Partial<Job>) => Promise<Job>;

async function submit(job: Job, provider: VideoProvider, save: Save): Promise<Job> {
  const repo = getRepo();
  if (job.attempts >= job.maxAttempts)
    return save({ status: "failed", error: "No attempts left for this video", errorCode: "attempts", lockedBy: undefined, lockedUntil: undefined });
  const t = getMeme(job.input.templateId);
  const attempt = job.attempts + 1;
  const externalId = `${job.id}-a${attempt}`;
  // 0) direct mode with a model that needs one image: prepare the internal reference frame once
  if (job.input.internalFrame && !job.input.sceneImageKey) {
    if (!t) return save({ status: "failed", error: "Meme configuration missing", errorCode: "config", lockedBy: undefined, lockedUntil: undefined });
    const key = `u/${job.userId}/jobs/${job.id}/internal-frame.jpg`;
    const image = getImageProvider();
    const out = await image.scene({
      meme: t,
      prompt: renderScenePrompt(t, job.input.spec),
      referenceFrame: await referenceFrame(t),
      people: await Promise.all(job.input.people.map(async (p) => ({ role: t.roles.find((r) => r.id === p.roleId)!, photos: await Promise.all(p.referenceKeys.map(readRef)) }))),
      variant: 0,
    });
    await getStorage().put(key, out.bytes, out.mime);
    job = await save({ input: { ...job.input, sceneImageKey: key } });
  }
  // 1) persist intent first: if we die after the provider accepted, we know what to look for
  job = await save({ status: "submitting", attempts: attempt, providerExternalId: externalId, providerTaskId: undefined });

  let sceneImageUrl: string | undefined;
  let sourceVideoUrl: string | undefined;
  let peopleImageUrls: string[][] = job.input.people.map(() => []);
  if (provider.capabilities.needsPublicUrls) {
    const storage = getStorage();
    sceneImageUrl = job.input.sceneImageKey ? ((await storage.signedUrl(job.input.sceneImageKey, 3600)) ?? undefined) : undefined;
    sourceVideoUrl = publicUrl(job.input.sourceVideo.src);
    peopleImageUrls = await Promise.all(
      job.input.people.map(async (p) => (await Promise.all(p.referenceKeys.map((k) => storage.signedUrl(k, 3600)))).filter((u): u is string => Boolean(u))),
    );
    const missing = !sourceVideoUrl || (job.input.mode === "preview" && !sceneImageUrl) || peopleImageUrls.some((u) => u.length === 0);
    if (missing)
      return save({
        status: "failed",
        error: "The video service needs public file URLs: connect Supabase Storage and set TEMPLATE_MEDIA_BASE_URL",
        errorCode: "config",
        attempts: attempt - 1,
        lockedBy: undefined,
        lockedUntil: undefined,
      });
  }

  try {
    const { taskId } = await provider.submit({
      jobId: job.id,
      externalId,
      prompt: job.input.prompt,
      negativePrompt: job.input.negativePrompt,
      durationSec: job.input.durationSec,
      aspectRatio: job.input.aspectRatio,
      // an internal reference frame makes a direct job image-driven, like the preview path
      mode: job.input.sceneImageKey ? "preview" : job.input.mode,
      sceneImageUrl,
      sourceVideoUrl,
      peopleImageUrls,
      characterOrientation: t?.generation.klingCharacterOrientation,
      callbackUrl: process.env.VIDEO_WEBHOOK_URL,
      demoFail: job.input.demoFail,
    });
    await repo.addUsage({
      id: randomUUID(),
      userId: job.userId,
      kind: "video",
      provider: provider.name,
      isDemo: provider.isDemo,
      refId: job.id,
      estimatedCost: job.estimatedCost,
      currency: "USD",
      createdAt: new Date().toISOString(),
    });
    return save({ status: "generating", providerTaskId: taskId, nextPollAt: new Date(Date.now() + pollDelay(job, provider)).toISOString(), lockedBy: undefined, lockedUntil: undefined });
  } catch (e) {
    if (e instanceof VideoProviderError && (e.code === "timeout" || e.code === "network")) {
      // unknown whether the provider created the task
      return recoverSubmit(job, provider, save);
    }
    if (e instanceof VideoProviderError && (e.code === "rejected" || e.code === "unsupported" || e.code === "config")) {
      // the provider refused before starting: this attempt did not cost anything
      return save({ status: "failed", error: e.message, errorCode: e.code === "rejected" ? "rejected_input" : e.code, attempts: attempt - 1, finishedAt: new Date().toISOString(), lockedBy: undefined, lockedUntil: undefined });
    }
    throw e;
  }
}

async function recoverSubmit(job: Job, provider: VideoProvider, save: Save): Promise<Job> {
  if (job.providerTaskId) return save({ status: "generating", nextPollAt: new Date().toISOString(), lockedBy: undefined, lockedUntil: undefined });
  if (job.providerExternalId && provider.canFindByExternalId) {
    const found = await provider.findByExternalId(job.providerExternalId);
    if (found) return save({ status: "generating", providerTaskId: found.taskId, nextPollAt: new Date().toISOString(), lockedBy: undefined, lockedUntil: undefined });
    // provider says it has no such task → safe to submit again (same attempt number)
    return save({ status: "queued", attempts: Math.max(0, job.attempts - 1), lockedBy: undefined, lockedUntil: undefined });
  }
  return save({
    status: "needs_review",
    error: "Could not tell whether the video service accepted the task. To avoid paying twice, resubmission is stopped until a person checks",
    errorCode: "unknown_submit",
    lockedBy: undefined,
    lockedUntil: undefined,
  });
}

async function onStatus(job: Job, st: VideoStatus, provider: VideoProvider, save: Save): Promise<Job> {
  switch (st.state) {
    case "queued":
    case "running":
      return save({ nextPollAt: new Date(Date.now() + pollDelay(job, provider)).toISOString(), lockedBy: undefined, lockedUntil: undefined });
    case "failed":
      return save({ status: "failed", error: st.error ?? "The video service could not create the video", errorCode: "provider_failed", finishedAt: new Date().toISOString(), lockedBy: undefined, lockedUntil: undefined });
    case "succeeded": {
      const next = await save({ status: "assembling", actualCost: st.actualCost ?? job.actualCost });
      return assemble(next, provider, save, st);
    }
  }
}

async function localOrDownload(src: string, dir: string, name: string): Promise<string> {
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`Could not download ${src}: HTTP ${res.status}`);
    const p = join(dir, name);
    await writeFile(p, Buffer.from(await res.arrayBuffer()));
    return p;
  }
  return join(process.cwd(), "public", src);
}

async function assemble(job: Job, provider: VideoProvider, save: Save, known?: VideoStatus): Promise<Job> {
  const repo = getRepo();
  const storage = getStorage();
  const c = getConfig();
  const dir = await mkdtemp(join(tmpdir(), "memme-job-"));
  try {
    // 1) raw result from the provider (kept for audit / manual review)
    let rawKey = job.rawResultKey;
    if (!rawKey || !(await storage.exists(rawKey))) {
      const st = known ?? (job.providerTaskId ? await provider.status(job.providerTaskId) : undefined);
      if (!st || st.state !== "succeeded") throw new Error("The video service result is not available");
      const bytes = await provider.fetchResult(st, job);
      rawKey = keys.raw(job.userId, job.id, job.attempts);
      await storage.put(rawKey, bytes, "video/mp4");
      await repo.recordResultFile({ userId: job.userId, jobId: job.id, kind: "raw", storageKey: rawKey });
      job = await save({ rawResultKey: rawKey });
    }
    const rawFile = join(dir, "raw.mp4");
    await writeFile(rawFile, await storage.get(rawKey));

    // 2) original audio, exact bounds from the template
    const audioFile = await localOrDownload(job.input.audio.src, dir, "audio.m4a");
    const outFile = join(dir, "final.mp4");
    const meta = await assembleWithOriginalAudio({
      videoFile: rawFile,
      audioFile,
      audioStartSec: job.input.audio.startSec,
      audioEndSec: job.input.audio.endSec,
      outFile,
      toleranceSec: c.limits.durationToleranceSec,
    });
    const finalKey = keys.result(job.userId, job.id);
    await storage.put(finalKey, await readFile(outFile), "video/mp4");
    // a poster frame from the finished video (the player shows it before play)
    const posterFile = join(dir, "poster.jpg");
    await runFfmpeg(["-ss", String(Math.min(1, meta.durationSec / 2)), "-i", outFile, "-frames:v", "1", "-q:v", "3", posterFile]);
    await storage.put(keys.poster(job.userId, job.id), await readFile(posterFile), "image/jpeg");
    await repo.recordResultFile({ userId: job.userId, jobId: job.id, kind: "final", storageKey: finalKey, durationSec: meta.durationSec, hasAudio: meta.hasAudio });
    if (job.actualCost !== undefined) await repo.updateUsage(job.id, { actualCost: job.actualCost });
    return save({
      status: "ready",
      resultKey: finalKey,
      resultMeta: meta,
      finishedAt: new Date().toISOString(),
      lockedBy: undefined,
      lockedUntil: undefined,
    });
  } catch (e) {
    if (e instanceof DurationMismatchError)
      return save({ status: "needs_review", error: e.message, errorCode: "duration_mismatch", finishedAt: new Date().toISOString(), lockedBy: undefined, lockedUntil: undefined });
    if (e instanceof AssemblyCheckError)
      return save({ status: "failed", error: e.message, errorCode: "assembly_check", finishedAt: new Date().toISOString(), lockedBy: undefined, lockedUntil: undefined });
    throw e;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
