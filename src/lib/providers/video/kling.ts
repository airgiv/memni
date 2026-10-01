/**
 * Kling AI — direct API, Motion Control (character image + motion reference video).
 *
 * STATUS: PREPARED, NOT VERIFIED. The official docs (kling.ai/document-api)
 * could not be opened from the build environment; the fields below come from
 * the official pages as quoted by search results and must be checked in the
 * docs before the first paid call:
 *
 *   auth    Authorization: Bearer <JWT HS256 {iss: AccessKey, exp: now+1800, nbf: now-5}> signed with SecretKey
 *   submit  POST {base}/v1/videos/motion-control
 *           { model_name, image_url, video_url, character_orientation: "image"|"video",
 *             mode: "std"|"pro", prompt, keep_original_sound: "no",
 *             callback_url?, external_task_id? }             ← external_task_id: unverified here
 *   query   GET  {base}/v1/videos/motion-control/{task_id}
 *           data.task_status: submitted | processing | succeed | failed
 *           data.task_result.videos[0].url
 *
 * Motion Control takes ONE character image: in "preview" mode it is the chosen
 * scene image; in "direct" mode it can only be the person's photo, so direct
 * mode works for one-person memes only (planVideoInputs reports this).
 * Whether it reliably drives two people from one reference clip must be
 * tested on real material before launch.
 */
import { createHmac } from "node:crypto";
import type { AppConfig } from "../../config";
import type { Job } from "../../domain/types";
import { VideoProviderError, type VideoProvider, type VideoStatus, type VideoSubmitRequest } from "./types";

function b64url(buf: Buffer | string) {
  return Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function klingJwt(ak: string, sk: string, now = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iss: ak, exp: now + 1800, nbf: now - 5 }));
  const sig = b64url(createHmac("sha256", sk).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

interface KlingTask {
  task_id: string;
  task_status: "submitted" | "processing" | "succeed" | "failed";
  task_status_msg?: string;
  task_result?: { videos?: { url: string; duration?: string }[] };
}

export class KlingVideoProvider implements VideoProvider {
  readonly name: string;
  readonly isDemo = false;
  readonly canFindByExternalId = false; // query-by-external-id path not verified yet
  readonly capabilities = {
    motionReference: true,
    imageReference: true,
    perPersonReferences: false,
    // Motion Control takes exactly one character image: without a prepared scene
    // image that can only be the person's own photo, i.e. a one-person meme
    withoutPreview: "single-person" as const,
    maxReferenceImages: 1,
    needsPublicUrls: true,
    // per docs excerpt: character_orientation "image" → reference ≤ 10 s, "video" → ≤ 30 s (we send "video")
    maxDurationSec: 30,
    // the character image drives the whole person (face, hair, body, clothes) — not a face swap
    replaces: "whole-person" as const,
  };

  constructor(private cfg: AppConfig["kling"]) {
    this.name = `kling:${cfg.model}:${cfg.mode}`;
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    if (!this.cfg.accessKey || !this.cfg.secretKey) throw new VideoProviderError("config", "Kling keys are not set");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);
    let res: Response;
    try {
      res = await fetch(`${this.cfg.baseUrl}${path}`, {
        method,
        signal: ctrl.signal,
        headers: {
          authorization: `Bearer ${klingJwt(this.cfg.accessKey, this.cfg.secretKey)}`,
          "content-type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new VideoProviderError((e as Error).name === "AbortError" ? "timeout" : "network", "No answer from Kling");
    } finally {
      clearTimeout(timer);
    }
    const json = (await res.json().catch(() => null)) as { code?: number; message?: string; data?: T } | null;
    if (!res.ok || !json || json.code !== 0 || !json.data)
      throw new VideoProviderError(res.status >= 500 ? "network" : "rejected", `Kling: ${json?.message ?? `HTTP ${res.status}`}`);
    return json.data;
  }

  async submit(req: VideoSubmitRequest) {
    const image = req.mode === "preview" ? req.sceneImageUrl : req.peopleImageUrls.length === 1 ? req.peopleImageUrls[0][0] : undefined;
    if (req.mode === "direct" && req.peopleImageUrls.length !== 1)
      throw new VideoProviderError("unsupported", "Without a prepared image Kling works only for one-person memes");
    if (!image || !req.sourceVideoUrl)
      throw new VideoProviderError("unsupported", "Kling needs public URLs for the image and the source clip");
    const data = await this.request<KlingTask>("POST", "/v1/videos/motion-control", {
      model_name: this.cfg.model,
      image_url: image,
      video_url: req.sourceVideoUrl,
      character_orientation: req.characterOrientation ?? "video",
      mode: this.cfg.mode,
      prompt: req.prompt.slice(0, 2500),
      keep_original_sound: "no",
      callback_url: req.callbackUrl,
      external_task_id: req.externalId,
    });
    return { taskId: data.task_id };
  }

  private toStatus(t: KlingTask): VideoStatus {
    switch (t.task_status) {
      case "submitted":
        return { state: "queued" };
      case "processing":
        return { state: "running" };
      case "succeed":
        return { state: "succeeded", videoUrl: t.task_result?.videos?.[0]?.url };
      default:
        return { state: "failed", error: t.task_status_msg || "Kling could not create the video" };
    }
  }

  async status(taskId: string) {
    return this.toStatus(await this.request<KlingTask>("GET", `/v1/videos/motion-control/${encodeURIComponent(taskId)}`));
  }

  async findByExternalId(): Promise<null> {
    // Not implemented until the documented lookup is verified. The worker then
    // marks the job for manual review instead of risking a second paid submit.
    return null;
  }

  async fetchResult(status: VideoStatus, _job: Job) {
    if (!status.videoUrl) throw new VideoProviderError("unknown", "Kling returned no video URL");
    const res = await fetch(status.videoUrl);
    if (!res.ok) throw new VideoProviderError("network", `Could not download the Kling video: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  estimateCost(durationSec: number) {
    return this.cfg.estimatedCostUsdPerSec ? durationSec * this.cfg.estimatedCostUsdPerSec : undefined;
  }
}
