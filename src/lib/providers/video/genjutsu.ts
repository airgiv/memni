/**
 * Genjutsu Motion Transfer (a Higgsfield AI product) — alternative for side-by-side tests.
 *
 * STATUS: PREPARED, NOT VERIFIED. Based on docs.higgsfield.ai excerpts:
 *   POST https://api.higgsfield.ai/higgsfield/genjutsu/motion-transfer/v1.0
 *        Authorization: Key {KEY_ID}:{KEY_SECRET}
 *        { video_url, image_urls: [1..8], prompt, resolution: "720p" }
 *        → { request_id, status_url, cancel_url }
 *   GET  https://api.higgsfield.ai/requests/{request_id}/status
 *        status: queued | in_progress | completed | failed | nsfw | canceled
 * The shape of the completed result (where the video URL is) was NOT
 * confirmed; `pickVideoUrl` tries the likely fields and fails loudly otherwise.
 * Unlike Kling motion control it accepts several images, so the scene still
 * AND each person's approved look can be passed.
 */
import type { AppConfig } from "../../config";
import type { Job } from "../../domain/types";
import { VideoProviderError, type VideoProvider, type VideoStatus, type VideoSubmitRequest } from "./types";

const BASE = "https://api.higgsfield.ai";

function pickVideoUrl(j: Record<string, unknown>): string | undefined {
  const candidates = [j.video, j.output, j.result, j];
  for (const c of candidates) {
    if (!c || typeof c !== "object") continue;
    const o = c as Record<string, unknown>;
    if (typeof o.url === "string") return o.url;
    const v = o.video as Record<string, unknown> | undefined;
    if (v && typeof v.url === "string") return v.url;
  }
  return undefined;
}

export class GenjutsuVideoProvider implements VideoProvider {
  readonly name = "genjutsu:motion-transfer";
  readonly isDemo = false;
  readonly canFindByExternalId = false;
  readonly capabilities = {
    motionReference: true,
    imageReference: true,
    perPersonReferences: true,
    withoutPreview: "any" as const,
    maxReferenceImages: 8,
    needsPublicUrls: true,
    maxDurationSec: 30,
    // motion transfer redraws the people from the images (unverified on real material)
    replaces: "whole-person" as const,
  };

  constructor(private cfg: AppConfig["genjutsu"]) {}

  private async request(method: "GET" | "POST", url: string, body?: unknown) {
    if (!this.cfg.apiKey) throw new VideoProviderError("config", "GENJUTSU_API_KEY is not set (format KEY_ID:KEY_SECRET)");
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: { authorization: `Key ${this.cfg.apiKey}`, "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      throw new VideoProviderError((e as Error).name === "TimeoutError" ? "timeout" : "network", "No answer from Genjutsu");
    }
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || !json) throw new VideoProviderError(res.status >= 500 ? "network" : "rejected", `Genjutsu: HTTP ${res.status}`);
    return json;
  }

  async submit(req: VideoSubmitRequest) {
    if (!req.sourceVideoUrl) throw new VideoProviderError("unsupported", "Public URLs are required");
    // scene image first (preview mode), then each person's photos, within the 8-image limit
    const people = req.peopleImageUrls.flatMap((urls) => urls.slice(0, req.mode === "preview" ? 1 : 3));
    const images = [...(req.sceneImageUrl ? [req.sceneImageUrl] : []), ...people].slice(0, this.capabilities.maxReferenceImages);
    if (images.length === 0) throw new VideoProviderError("unsupported", "No images for the video");
    const hook = req.callbackUrl ? `?hf_webhook=${encodeURIComponent(req.callbackUrl)}` : "";
    const json = await this.request("POST", `${this.cfg.baseUrl ?? BASE}/higgsfield/genjutsu/motion-transfer/v1.0${hook}`, {
      video_url: req.sourceVideoUrl,
      image_urls: images,
      prompt: req.prompt,
      resolution: "720p",
    });
    if (typeof json.request_id !== "string") throw new VideoProviderError("unknown", "Genjutsu returned no request_id");
    return { taskId: json.request_id };
  }

  async status(taskId: string): Promise<VideoStatus> {
    const j = await this.request("GET", `${this.cfg.baseUrl ?? BASE}/requests/${encodeURIComponent(taskId)}/status`);
    switch (j.status) {
      case "queued":
        return { state: "queued" };
      case "in_progress":
        return { state: "running" };
      case "completed":
        return { state: "succeeded", videoUrl: pickVideoUrl(j) };
      case "nsfw":
        return { state: "failed", error: "The service declined the material under its safety rules" };
      default:
        return { state: "failed", error: `Genjutsu: ${String(j.status)}` };
    }
  }

  async findByExternalId(): Promise<null> {
    return null;
  }

  async fetchResult(status: VideoStatus, _job: Job) {
    if (!status.videoUrl) throw new VideoProviderError("unknown", "Could not find the video URL in the Genjutsu response");
    const res = await fetch(status.videoUrl);
    if (!res.ok) throw new VideoProviderError("network", `Could not download the video: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  estimateCost() {
    return undefined;
  }
}
