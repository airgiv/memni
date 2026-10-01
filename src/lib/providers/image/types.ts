import type { ReplacementScope } from "../../domain/types";
import type { MemeDef, MemeRole } from "../../../memes/types";

export interface ImageRef {
  bytes: Buffer;
  mime: string;
}

export interface ScenePreviewRequest {
  meme: MemeDef;
  prompt: string;
  referenceFrame: ImageRef;
  /** each cast person with their photos, main photo first */
  people: { role: MemeRole; photos: ImageRef[] }[];
  variant: number;
  demo?: { fail?: boolean };
}

export interface ImageResult {
  bytes: Buffer;
  mime: string;
  estimatedCostUsd?: number;
}

export type ImageErrorCode = "safety" | "no_image" | "timeout" | "provider" | "config" | "demo_failure";

export class ImageProviderError extends Error {
  constructor(
    public code: ImageErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/**
 * One contract for every image model. The app never knows which model runs;
 * prompts are assembled before this call (lib/domain/prompts.ts).
 */
export interface ImageProvider {
  readonly name: string;
  readonly isDemo: boolean;
  /** max reference images the model accepts in one call */
  readonly maxReferences: number;
  /** "whole-person": can redraw face, hair, body and clothes; "face-only": a face swap */
  readonly replaces: ReplacementScope;
  scene(req: ScenePreviewRequest): Promise<ImageResult>;
}
