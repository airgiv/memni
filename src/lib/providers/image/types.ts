import type { TemplateDef, TemplateRole } from "../../templates/types";

export interface ImageRef {
  bytes: Buffer;
  mime: string;
}

export interface PersonPreviewRequest {
  template: TemplateDef;
  role: TemplateRole;
  prompt: string;
  /** main photo first, then extra references */
  photos: ImageRef[];
  referenceFrame: ImageRef;
  /** ordinal of this variant; lets a demo adapter look different per try */
  variant: number;
  demo?: { fail?: boolean };
}

export interface ScenePreviewRequest {
  template: TemplateDef;
  prompt: string;
  referenceFrame: ImageRef;
  people: { role: TemplateRole; approved: ImageRef; mainPhoto?: ImageRef }[];
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
  person(req: PersonPreviewRequest): Promise<ImageResult>;
  scene(req: ScenePreviewRequest): Promise<ImageResult>;
}
