import type { Job } from "../../domain/types";
import type { TemplateDef } from "../../templates/types";

/** What a video model can take. Only supported combinations are ever sent. */
export interface VideoCapabilities {
  /** a reference clip whose motion/timing is transferred */
  motionReference: boolean;
  /** a still image defining appearance and composition */
  imageReference: boolean;
  /** separate reference images per person, in addition to the scene image */
  perPersonReferences: boolean;
  maxReferenceImages: number;
  /**
   * Can it work WITHOUT a prepared scene image, from people's photos only?
   *  "any"           — yes, with several reference images;
   *  "single-person" — only for a one-person meme (the photo is the character image);
   *  "none"          — no.
   */
  withoutPreview: "any" | "single-person" | "none";
  /** inputs must be public HTTPS URLs (not bytes) */
  needsPublicUrls: boolean;
  maxDurationSec: number;
}

export interface VideoSubmitRequest {
  jobId: string;
  /** our id, sent to the provider so a lost response can be found again */
  externalId: string;
  prompt: string;
  negativePrompt?: string;
  durationSec: number;
  aspectRatio: string;
  mode: "preview" | "direct";
  /** only in "preview" mode */
  sceneImageUrl?: string;
  sourceVideoUrl?: string;
  /** per role, in template order: that person's photos (main first) */
  peopleImageUrls: string[][];
  callbackUrl?: string;
  characterOrientation?: "image" | "video";
  /** demo only: which stage to fail at */
  demoFail?: "generating";
}

export type VideoState = "queued" | "running" | "succeeded" | "failed";

export interface VideoStatus {
  state: VideoState;
  videoUrl?: string;
  error?: string;
  actualCost?: number;
}

export class VideoProviderError extends Error {
  constructor(
    public code: "timeout" | "network" | "rejected" | "config" | "unsupported" | "unknown",
    message: string,
  ) {
    super(message);
  }
}

export interface VideoProvider {
  readonly name: string;
  readonly isDemo: boolean;
  readonly capabilities: VideoCapabilities;
  /** Whether lookup by our external id is available (used after a timeout). */
  readonly canFindByExternalId: boolean;
  submit(req: VideoSubmitRequest): Promise<{ taskId: string }>;
  status(taskId: string): Promise<VideoStatus>;
  findByExternalId(externalId: string): Promise<({ taskId: string } & VideoStatus) | null>;
  /** Download the finished raw video. */
  fetchResult(status: VideoStatus, job: Job): Promise<Buffer>;
  estimateCost(durationSec: number): number | undefined;
}

export interface InputPlan {
  ok: boolean;
  /** short user-facing reason when not ok */
  problem?: string;
}

/**
 * Can this provider run the template's scenario in this mode? Only supported
 * combinations are ever sent; an unsupported path is reported, not faked.
 */
export function planVideoInputs(t: TemplateDef, caps: VideoCapabilities, mode: "preview" | "direct"): InputPlan {
  if (t.pipeline.video.needsMotionReference && !caps.motionReference)
    return { ok: false, problem: "Видео для этого мема пока недоступно" };
  if (t.durationSec > caps.maxDurationSec) return { ok: false, problem: "Этот мем слишком длинный для видеосервиса" };
  if (mode === "preview") return caps.imageReference ? { ok: true } : { ok: false, problem: "Видео по превью пока недоступно" };
  if (caps.withoutPreview === "any") return { ok: true };
  if (caps.withoutPreview === "single-person" && t.roles.length === 1) return { ok: true };
  return { ok: false, problem: "Для этого мема видео без превью пока недоступно" };
}
