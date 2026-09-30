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
  sceneImageUrl?: string;
  sourceVideoUrl?: string;
  referenceImageUrls: string[];
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
  used: string[];
  notPassed: string[];
  problem?: string;
}

/** Decide which of the scenario's inputs this provider can actually receive. */
export function planVideoInputs(t: TemplateDef, caps: VideoCapabilities, providerName: string): InputPlan {
  const used: string[] = [];
  const notPassed: string[] = [];
  const need = t.pipeline.video;
  if (need.needsMotionReference) {
    if (!caps.motionReference)
      return { ok: false, used, notPassed, problem: `${providerName} не принимает исходный ролик для движений — сценарий этого шаблона недоступен` };
    used.push("исходный ролик шаблона (движения и тайминг)");
  }
  if (need.needsImageReference) {
    if (!caps.imageReference)
      return { ok: false, used, notPassed, problem: `${providerName} не принимает утверждённое изображение — сценарий недоступен` };
    used.push("утверждённое фото сцены (внешность и композиция)");
  }
  if (need.wantsPerPersonReferences) {
    if (caps.perPersonReferences) used.push("отдельные фото участников (сходство)");
    else notPassed.push("отдельные фото участников — модель принимает только одно изображение");
  }
  used.push("инструкции о ролях, собранные сервером");
  if (t.durationSec > caps.maxDurationSec)
    return { ok: false, used, notPassed, problem: `Ролик длиннее, чем поддерживает ${providerName} (${caps.maxDurationSec} с)` };
  return { ok: true, used, notPassed };
}
