/**
 * Domain entities shared by the API, the repositories (local SQLite for the demo,
 * Supabase for real use), the worker and — as JSON — the browser.
 */
import type { ClothingMode } from "../templates/types";

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

export interface Photo {
  id: ID;
  userId: ID;
  personId: ID;
  storageKey: string;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: string;
}

/** Per-order look of one person in one role. Separate from the person's photos. */
export interface LookSettings {
  clothing: ClothingMode;
  presetId?: string;
  glasses?: "as-photo" | "remove";
}

export interface Assignment {
  personId: ID;
  look: LookSettings;
  /** preview the user is looking at (any from history) */
  selectedPreviewId?: ID;
  /** preview the user confirmed; valid only while its fingerprint matches */
  confirmedPreviewId?: ID;
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
  sceneSelectedPreviewId?: ID;
  sceneConfirmedPreviewId?: ID;
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
  /** ordinal inside (draft, kind, role) — «вариант 3» */
  seq: number;
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

/** Frozen inputs of a job: later draft edits never touch a started generation. */
export interface JobInput {
  templateId: string;
  templateVersion: number;
  promptVersion: string;
  prompt: string;
  negativePrompt?: string;
  durationSec: number;
  aspectRatio: string;
  sceneImageKey: string;
  sourceVideo: { src: string; startSec: number; endSec: number };
  audio: { src: string; startSec: number; endSec: number };
  people: { roleId: string; personId: ID; referenceKeys: string[]; previewKey?: string }[];
  scenePreviewId: ID;
  sceneFingerprint: string;
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
  estimatedCost?: number;
  actualCost?: number;
  currency: string;
  createdAt: string;
}

/** Test order: the future payment screen, never charged in this version. */
export interface Order {
  id: ID;
  userId: ID;
  jobId: ID;
  amountMinor: number | null;
  currency: string;
  priceIsExample: boolean;
  status: "test";
  method: "none" | "card" | "telegram_stars";
  createdAt: string;
}
