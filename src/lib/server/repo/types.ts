import type { Draft, Job, Order, Person, Photo, Preview, UsageEvent, UsageKind, User } from "../../domain/types";

export class ConflictError extends Error {
  constructor(message = "Черновик изменился в другой вкладке — обновили до последней версии") {
    super(message);
  }
}
export class NotFoundError extends Error {
  constructor(message = "Не найдено") {
    super(message);
  }
}
export class LimitError extends Error {
  constructor(
    public code: "preview_limit" | "active_jobs" | "global_jobs" | "daily_jobs" | "attempts",
    message: string,
  ) {
    super(message);
  }
}

/**
 * Storage-agnostic data access. Every user-facing method takes `userId` and
 * only ever returns that user's rows — ownership is enforced here (and, in
 * Supabase, a second time by RLS). Methods without userId are for the worker.
 */
export interface Repo {
  readonly kind: "local" | "supabase";

  // users
  ensureUser(user: User): Promise<User>;
  getUser(id: string): Promise<User | null>;
  findUserByTelegramId(telegramId: string): Promise<User | null>;

  // people & photos
  listPeople(userId: string): Promise<Person[]>;
  getPerson(userId: string, id: string): Promise<Person | null>;
  savePerson(person: Person): Promise<Person>;
  /** Deletes the person, their photos and their previews; returns storage keys to remove. */
  deletePerson(userId: string, id: string): Promise<string[]>;
  listPhotos(userId: string, personIds: string[]): Promise<Photo[]>;
  getPhoto(userId: string, id: string): Promise<Photo | null>;
  savePhoto(photo: Photo): Promise<Photo>;
  deletePhoto(userId: string, id: string): Promise<string | null>;

  // drafts
  listDrafts(userId: string): Promise<Draft[]>;
  getDraft(userId: string, id: string): Promise<Draft | null>;
  createDraft(draft: Draft): Promise<Draft>;
  /** Optimistic concurrency: fails with ConflictError unless the stored version equals expectedVersion. */
  updateDraft(draft: Draft, expectedVersion: number): Promise<Draft>;
  deleteDraft(userId: string, id: string): Promise<string[]>;

  // previews
  listPreviews(userId: string, draftId: string): Promise<Preview[]>;
  getPreview(userId: string, id: string): Promise<Preview | null>;
  /**
   * Atomically checks the free-preview quota, records a usage event and inserts
   * the pending preview. Throws LimitError when the quota is spent.
   */
  reservePreview(preview: Preview, usage: UsageEvent, limit: number): Promise<Preview>;
  updatePreview(id: string, patch: Partial<Preview>): Promise<Preview>;
  /** Refund quota when a preview failed on our side (network, safety block). */
  refundUsage(refId: string): Promise<void>;

  // usage
  countUsage(userId: string, kind: UsageKind): Promise<number>;
  addUsage(event: UsageEvent): Promise<void>;
  updateUsage(refId: string, patch: Partial<UsageEvent>): Promise<void>;
  resetDemoUsage(userId: string): Promise<void>;

  // jobs
  /**
   * Returns the existing job for (userId, idempotencyKey) if there is one;
   * otherwise checks the concurrency limits and inserts `job` atomically.
   */
  createJobOnce(
    job: Job,
    limits: { perUser: number; global: number; perDay: number },
  ): Promise<{ job: Job; created: boolean }>;
  getJob(userId: string, id: string): Promise<Job | null>;
  listJobs(userId: string): Promise<Job[]>;
  /** worker: lease the next job that needs attention */
  claimJob(workerId: string, leaseMs: number): Promise<Job | null>;
  /** worker/service: patch a job; with `lockedBy` only if the lease is still ours */
  updateJob(id: string, patch: Partial<Job>, lockedBy?: string): Promise<Job>;
  getJobByProviderTask(provider: string, taskId: string): Promise<Job | null>;
  deleteJob(userId: string, id: string): Promise<string[]>;
  recordResultFile(f: { userId: string; jobId: string; kind: "raw" | "final"; storageKey: string; durationSec?: number; hasAudio?: boolean }): Promise<void>;

  // orders (test only)
  createOrder(order: Order): Promise<Order>;
  getOrderForJob(userId: string, jobId: string): Promise<Order | null>;
}

export const ACTIVE_JOB_STATUSES = ["queued", "submitting", "generating", "assembling"] as const;
