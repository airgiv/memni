/**
 * Domain entities shared by the API, the repositories (local SQLite for the demo,
 * Supabase for real use), the worker and — as JSON — the browser.
 */

export type ID = string;

export interface User {
  id: ID;
  /** "anon" for a browser session, "telegram" after a verified initData login */
  kind: "anon" | "telegram" | "email";
  telegramId?: string;
  displayName?: string;
  createdAt: string;
}

/** A person the user casts: their source photos live here, independent of any order. */
export interface Person {
  id: ID;
  userId: ID;
  name: string;
  /** false → a one-off person created inside a draft; true → offered again in future drafts */
  saved: boolean;
  mainPhotoId?: ID;
  /** Voluntary appearance note written by the user. Never inferred. */
  appearanceNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PhotoAnalysis {
  analyzer: string;
  isDemo: boolean;
  /** which checks actually ran; anything else is unknown, not "fine" */
  checked: ("resolution" | "exposure" | "sharpness" | "faces" | "body")[];
  issues: ("small" | "dark" | "bright" | "blurry" | "no_face" | "several_faces")[];
  /** null → not checked */
  faces: number | null;
  /** how much of the person is visible; null → not checked */
  body: "full" | "upper" | "face" | null;
}

export interface Photo {
  id: ID;
  userId: ID;
  personId: ID;
  storageKey: string;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  /** result of the photo-analysis adapter (quality, faces, body visibility) — never identity or gender */
  analysis?: PhotoAnalysis;
  createdAt: string;
}

/** How the clothes are chosen for one participant. `optionId` refers to MemeDef.outfits. */
export interface OutfitChoice {
  optionId: string;
  /** random only: the preset drawn once and stored, so preview and video agree */
  resolvedPresetId?: string;
  /** custom only: the user's short description (data, never instructions) */
  text?: string;
}

/** Presentation is only ever what the user says — never inferred from a photo. */
export type Presentation = "feminine" | "masculine" | "neutral";

export interface AppearancePrefs {
  /** "photos": appearance from photos (default); "adjusted": the user confirmed preferences below */
  mode: "photos" | "adjusted";
  presentation?: Presentation;
  /** user correction of the description ("curly hair, shorter beard") */
  description?: string;
}

/** Per-order look of one person in one role. Separate from the person's photos. */
export interface LookSettings {
  outfit: OutfitChoice;
  appearance: AppearancePrefs;
}

export interface Assignment {
  personId: ID;
  look: LookSettings;
}

export interface SceneSettings {
  optionId: string;
}

export interface Draft {
  id: ID;
  userId: ID;
  templateId: string;
  templateVersion: number;
  /** Monotonic; every change bumps it. Clients send it back to avoid lost updates. */
  version: number;
  assignments: Record<string, Assignment | undefined>;
  scene: SceneSettings;
  /** scene preview the user is looking at (any from history) */
  sceneSelectedPreviewId?: ID;
  /** last video job started from this draft */
  lastJobId?: ID;
  createdAt: string;
  updatedAt: string;
}

export type PreviewKind = "person" | "scene";
export type PreviewStatus = "pending" | "ready" | "failed";

export interface Preview {
  id: ID;
  userId: ID;
  draftId: ID;
  kind: PreviewKind;
  roleId?: string;
  personId?: ID;
  /** Hash of every input that affects the image. Confirmations compare against it. */
  fingerprint: string;
  /** Draft version when the request started. Late answers never overwrite newer state. */
  draftVersion: number;
  status: PreviewStatus;
  provider: string;
  isDemo: boolean;
  storageKey?: string;
  error?: string;
  /** ordinal inside (draft, kind, role) — "version 3" */
  seq: number;
  /** false → came from the free offer; true → a (test) purchase */
  paid?: boolean;
  createdAt: string;
  finishedAt?: string;
}

export type JobStatus =
  | "queued" // waiting for a worker slot
  | "submitting" // being sent to the provider (never re-sent blindly)
  | "generating" // provider is working
  | "assembling" // worker muxes the original audio
  | "ready"
  | "failed"
  | "needs_review"; // duration mismatch etc. — a human decides

export type VideoMode = "preview" | "direct";

export type ReplacementScope = "whole-person" | "face-only";

/**
 * Structured generation request — built from stored data, rendered into
 * provider prompts on the server. Each part is kept separately: the original
 * role, the reference photos, the user-confirmed appearance preferences,
 * the outfit and the preset constraints.
 */
export interface GenerationSpec {
  memeId: string;
  memeVersion: number;
  promptVersion: string;
  scope: ReplacementScope;
  participants: {
    roleId: string;
    /** server-side description of the original performer in the scene */
    role: string;
    referencePhotoCount: number;
    /** what the photos are known to show; "unknown" when no analyzer checked */
    bodyReference: "full" | "partial" | "unknown";
    appearance: AppearancePrefs;
    outfit: { optionId: string; kind: string; presetId?: string; prompt: string | null; text?: string };
    constraints: string[];
  }[];
}

export interface Money {
  amountMinor: number;
  currency: string;
  isExample: boolean;
}

/** Frozen inputs of a job: later draft edits never touch a started generation. */
export interface JobInput {
  templateId: string;
  templateVersion: number;
  promptVersion: string;
  /** "preview": animate the chosen scene image; "direct": straight from people's photos */
  mode: VideoMode;
  prompt: string;
  negativePrompt?: string;
  durationSec: number;
  aspectRatio: string;
  /** structured inputs the prompt was rendered from (kept for audit and re-rendering) */
  spec: GenerationSpec;
  /** what the model is able to replace — decided by provider capabilities at launch */
  scope: ReplacementScope;
  /**
   * "direct" mode with a provider that needs an image: the worker first
   * prepares an internal reference frame (not shown, not charged separately)
   */
  internalFrame?: boolean;
  /** only in "preview" mode (or after the internal frame): frozen copy of the scene image */
  sceneImageKey?: string;
  scenePreviewId?: ID;
  /** fingerprint of every draft input at launch */
  inputsFingerprint: string;
  sourceVideo: { src: string; startSec: number; endSec: number };
  audio: { src: string; startSec: number; endSec: number };
  people: { roleId: string; personId: ID; referenceKeys: string[]; look: LookSettings }[];
  /** price fixed at launch (null = no price defined, test run) */
  price: Money | null;
  /** demo mode only: simulate a provider failure at this stage */
  demoFail?: "generating";
}

export interface Job {
  id: ID;
  userId: ID;
  draftId: ID;
  /** Same draft + same confirmed scene → same key → never a second paid run. */
  idempotencyKey: string;
  status: JobStatus;
  input: JobInput;
  provider: string;
  isDemo: boolean;
  providerTaskId?: string;
  /** our own id sent to the provider so a lost response can be looked up */
  providerExternalId?: string;
  attempts: number;
  maxAttempts: number;
  error?: string;
  errorCode?: string;
  resultKey?: string;
  rawResultKey?: string;
  resultMeta?: { durationSec: number; hasAudio: boolean; audioDurationSec?: number; videoDurationSec?: number };
  estimatedCost?: number;
  actualCost?: number;
  costCurrency?: string;
  /** worker lease: prevents two workers from handling one job */
  lockedBy?: string;
  lockedUntil?: string;
  nextPollAt?: string;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
}

export type UsageKind = "preview_image" | "video";

export interface UsageEvent {
  id: ID;
  userId: ID;
  kind: UsageKind;
  provider: string;
  isDemo: boolean;
  refId: ID;
  /** true → used the free offer (counts against FREE_PREVIEWS_PER_USER) */
  free?: boolean;
  estimatedCost?: number;
  actualCost?: number;
  currency: string;
  createdAt: string;
}

/**
 * A purchase. Payments are not connected yet, so every order is a TEST order
 * ("test_paid"): the flow, prices and idempotency are real, no money moves.
 */
export interface Order {
  id: ID;
  userId: ID;
  kind: "preview" | "video";
  /** preview id or job id */
  refId: ID;
  /** client/server key: the same purchase is never charged twice */
  idempotencyKey: string;
  amountMinor: number | null;
  currency: string;
  priceIsExample: boolean;
  status: "test_paid" | "paid" | "refunded";
  /** payment adapter that handled it ("test" until a real one is connected) */
  method: string;
  /** country the customer is billed in — never derived from the interface language */
  billingCountry?: string;
  createdAt: string;
  refundedAt?: string;
}
