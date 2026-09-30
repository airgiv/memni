/**
 * Real data backend on Supabase Postgres (see supabase/migrations/0001_init.sql).
 * Uses the service-role client, so EVERY query below filters by user_id
 * itself; RLS is a second line of defence for anything that reads with a
 * user token. Quota, job creation and job leasing go through SQL functions
 * so they are atomic under concurrent requests and multiple workers.
 *
 * Status: written against the migration in this repo and type-checked; it has
 * not yet been exercised against a live Supabase project (no credentials).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Assignment,
  Draft,
  Job,
  Order,
  Person,
  Photo,
  Preview,
  UsageEvent,
  UsageKind,
  User,
} from "../../domain/types";
import { getSupabaseAdmin } from "../supabase";
import { ACTIVE_JOB_STATUSES, ConflictError, LimitError, NotFoundError, type Repo } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

// list queries never return null data without an error; single-row queries may
type Checked<T> = [Exclude<T, null>] extends [unknown[]] ? Exclude<T, null> : T;
function check<T>(res: { data: T; error: { message: string; code?: string } | null }): Checked<T> {
  if (res.error) throw new Error(`supabase: ${res.error.message}`);
  return res.data as Checked<T>;
}
const undef = <T>(v: T | null | undefined): T | undefined => (v === null ? undefined : v);

const personFrom = (r: R): Person => ({
  id: r.id,
  userId: r.user_id,
  name: r.name,
  saved: r.saved,
  mainPhotoId: undef(r.main_photo_id),
  appearanceNote: undef(r.appearance_note),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const photoFrom = (r: R): Photo => ({
  id: r.id,
  userId: r.user_id,
  personId: r.person_id,
  storageKey: r.storage_key,
  mime: r.mime,
  width: r.width,
  height: r.height,
  bytes: r.bytes,
  createdAt: r.created_at,
});
const previewFrom = (r: R): Preview => ({
  id: r.id,
  userId: r.user_id,
  draftId: r.draft_id,
  kind: r.kind,
  roleId: undef(r.role_id),
  personId: undef(r.person_id),
  fingerprint: r.fingerprint,
  draftVersion: r.draft_version,
  status: r.status,
  provider: r.provider,
  isDemo: r.is_demo,
  storageKey: undef(r.storage_key),
  error: undef(r.error),
  seq: r.seq,
  paid: Boolean(r.paid),
  createdAt: r.created_at,
  finishedAt: undef(r.finished_at),
});
const previewTo = (p: Partial<Preview>): R => {
  const r: R = {};
  if (p.status !== undefined) r.status = p.status;
  if (p.storageKey !== undefined) r.storage_key = p.storageKey;
  if (p.error !== undefined) r.error = p.error;
  if (p.finishedAt !== undefined) r.finished_at = p.finishedAt;
  if (p.provider !== undefined) r.provider = p.provider;
  return r;
};
const jobFrom = (r: R): Job => ({
  id: r.id,
  userId: r.user_id,
  draftId: r.draft_id,
  idempotencyKey: r.idempotency_key,
  status: r.status,
  input: r.input,
  provider: r.provider,
  isDemo: r.is_demo,
  providerTaskId: undef(r.provider_task_id),
  providerExternalId: undef(r.provider_external_id),
  attempts: r.attempts,
  maxAttempts: r.max_attempts,
  error: undef(r.error),
  errorCode: undef(r.error_code),
  resultKey: undef(r.result_key),
  rawResultKey: undef(r.raw_result_key),
  resultMeta: undef(r.result_meta),
  estimatedCost: r.estimated_cost === null ? undefined : Number(r.estimated_cost),
  actualCost: r.actual_cost === null ? undefined : Number(r.actual_cost),
  costCurrency: undef(r.cost_currency),
  lockedBy: undef(r.locked_by),
  lockedUntil: undef(r.locked_until),
  nextPollAt: undef(r.next_poll_at),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  finishedAt: undef(r.finished_at),
});
const JOB_COLUMNS: [keyof Job, string][] = [
  ["status", "status"],
  ["providerTaskId", "provider_task_id"],
  ["providerExternalId", "provider_external_id"],
  ["attempts", "attempts"],
  ["error", "error"],
  ["errorCode", "error_code"],
  ["resultKey", "result_key"],
  ["rawResultKey", "raw_result_key"],
  ["resultMeta", "result_meta"],
  ["estimatedCost", "estimated_cost"],
  ["actualCost", "actual_cost"],
  ["costCurrency", "cost_currency"],
  ["lockedBy", "locked_by"],
  ["lockedUntil", "locked_until"],
  ["nextPollAt", "next_poll_at"],
  ["finishedAt", "finished_at"],
  ["provider", "provider"],
];
const jobTo = (p: Partial<Job>): R => {
  const r: R = {};
  for (const [k, col] of JOB_COLUMNS) if (k in p) r[col] = (p as R)[k] ?? null;
  return r;
};

const LIMIT_MESSAGES: Record<string, string> = {
  preview_limit: "Бесплатное превью уже использовано",
  active_jobs: "Предыдущее видео ещё создаётся — дождитесь его, чтобы начать новое",
  global_jobs: "Сейчас создаётся много видео. Попробуйте через несколько минут",
  daily_jobs: "На сегодня лимит видео исчерпан",
};
function limitFrom(message: string): LimitError | null {
  for (const code of Object.keys(LIMIT_MESSAGES))
    if (message.includes(code)) return new LimitError(code as LimitError["code"], LIMIT_MESSAGES[code]);
  return null;
}

export class SupabaseRepo implements Repo {
  readonly kind = "supabase" as const;
  private get db(): SupabaseClient {
    return getSupabaseAdmin();
  }

  /* users */
  async ensureUser(user: User) {
    const found = await this.getUser(user.id);
    if (found) return found;
    check(
      await this.db.from("profiles").upsert(
        { id: user.id, kind: user.kind, telegram_id: user.telegramId ?? null, display_name: user.displayName ?? null },
        { onConflict: "id" },
      ),
    );
    return user;
  }
  async getUser(id: string) {
    const r = check(await this.db.from("profiles").select("*").eq("id", id).maybeSingle());
    return r ? ({ id: r.id, kind: r.kind, telegramId: undef(r.telegram_id), displayName: undef(r.display_name), createdAt: r.created_at } as User) : null;
  }
  async findUserByTelegramId(telegramId: string) {
    const r = check(await this.db.from("profiles").select("*").eq("telegram_id", telegramId).maybeSingle());
    return r ? ({ id: r.id, kind: r.kind, telegramId: r.telegram_id, displayName: undef(r.display_name), createdAt: r.created_at } as User) : null;
  }

  /* people */
  async listPeople(userId: string) {
    return check(await this.db.from("people").select("*").eq("user_id", userId).order("created_at", { ascending: false })).map(personFrom);
  }
  async getPerson(userId: string, id: string) {
    const r = check(await this.db.from("people").select("*").eq("user_id", userId).eq("id", id).maybeSingle());
    return r ? personFrom(r) : null;
  }
  async savePerson(p: Person) {
    const existing = check(await this.db.from("people").select("user_id").eq("id", p.id).maybeSingle());
    if (existing && existing.user_id !== p.userId) throw new NotFoundError();
    const row = {
      id: p.id,
      user_id: p.userId,
      name: p.name,
      saved: p.saved,
      main_photo_id: p.mainPhotoId ?? null,
      appearance_note: p.appearanceNote ?? null,
      created_at: p.createdAt,
      updated_at: p.updatedAt,
    };
    check(await this.db.from("people").upsert(row, { onConflict: "id" }));
    return p;
  }
  async deletePerson(userId: string, id: string) {
    const person = await this.getPerson(userId, id);
    if (!person) throw new NotFoundError("Человек не найден");
    const photos = check(await this.db.from("person_photos").select("storage_key").eq("user_id", userId).eq("person_id", id));
    const personPreviews = check(await this.db.from("previews").select("id, storage_key").eq("user_id", userId).eq("person_id", id));
    // scene previews of drafts where this person is cast
    const drafts = check(await this.db.from("draft_assignments").select("draft_id").eq("user_id", userId).eq("person_id", id));
    const draftIds = [...new Set(drafts.map((d: R) => d.draft_id))];
    const scenePreviews = draftIds.length
      ? check(await this.db.from("previews").select("id, storage_key").eq("user_id", userId).eq("kind", "scene").in("draft_id", draftIds))
      : [];
    const previewIds = [...personPreviews, ...scenePreviews].map((p: R) => p.id);
    if (previewIds.length) check(await this.db.from("previews").delete().eq("user_id", userId).in("id", previewIds));
    // cascades person_photos and draft_assignments
    check(await this.db.from("people").delete().eq("user_id", userId).eq("id", id));
    return [...photos, ...personPreviews, ...scenePreviews].map((r: R) => r.storage_key).filter(Boolean);
  }

  /* photos */
  async listPhotos(userId: string, personIds: string[]) {
    if (personIds.length === 0) return [];
    return check(
      await this.db.from("person_photos").select("*").eq("user_id", userId).in("person_id", personIds).order("created_at"),
    ).map(photoFrom);
  }
  async getPhoto(userId: string, id: string) {
    const r = check(await this.db.from("person_photos").select("*").eq("user_id", userId).eq("id", id).maybeSingle());
    return r ? photoFrom(r) : null;
  }
  async savePhoto(p: Photo) {
    check(
      await this.db.from("person_photos").insert({
        id: p.id,
        user_id: p.userId,
        person_id: p.personId,
        storage_key: p.storageKey,
        mime: p.mime,
        width: p.width,
        height: p.height,
        bytes: p.bytes,
        created_at: p.createdAt,
      }),
    );
    return p;
  }
  async deletePhoto(userId: string, id: string) {
    const p = await this.getPhoto(userId, id);
    if (!p) return null;
    check(await this.db.from("person_photos").delete().eq("user_id", userId).eq("id", id));
    return p.storageKey;
  }

  /* drafts */
  private async assemble(rows: R[]): Promise<Draft[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const as = check(await this.db.from("draft_assignments").select("*").in("draft_id", ids));
    return rows.map((r) => {
      const assignments: Record<string, Assignment | undefined> = {};
      for (const a of as.filter((x: R) => x.draft_id === r.id))
        assignments[a.role_id] = {
          personId: a.person_id,
          look: a.look,
        };
      return {
        id: r.id,
        userId: r.user_id,
        templateId: r.template_id,
        templateVersion: r.template_version,
        version: r.version,
        assignments,
        scene: r.scene,
        sceneSelectedPreviewId: undef(r.scene_selected_preview_id),
        lastJobId: undef(r.last_job_id),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      } satisfies Draft;
    });
  }
  async listDrafts(userId: string) {
    return this.assemble(check(await this.db.from("drafts").select("*").eq("user_id", userId).order("updated_at", { ascending: false })));
  }
  async getDraft(userId: string, id: string) {
    const r = check(await this.db.from("drafts").select("*").eq("user_id", userId).eq("id", id).maybeSingle());
    return r ? (await this.assemble([r]))[0] : null;
  }
  private draftRow(d: Draft): R {
    return {
      id: d.id,
      user_id: d.userId,
      template_id: d.templateId,
      template_version: d.templateVersion,
      version: d.version,
      scene: d.scene,
      scene_selected_preview_id: d.sceneSelectedPreviewId ?? null,
      last_job_id: d.lastJobId ?? null,
      created_at: d.createdAt,
      updated_at: d.updatedAt,
    };
  }
  private async writeAssignments(d: Draft) {
    check(await this.db.from("draft_assignments").delete().eq("draft_id", d.id).eq("user_id", d.userId));
    const rows = Object.entries(d.assignments)
      .filter((e): e is [string, Assignment] => Boolean(e[1]))
      .map(([roleId, a]) => ({
        draft_id: d.id,
        role_id: roleId,
        user_id: d.userId,
        person_id: a.personId,
        look: a.look,
      }));
    if (rows.length) check(await this.db.from("draft_assignments").insert(rows));
  }
  async createDraft(d: Draft) {
    check(await this.db.from("drafts").insert(this.draftRow(d)));
    await this.writeAssignments(d);
    return d;
  }
  async updateDraft(d: Draft, expectedVersion: number) {
    // compare-and-set on version; only the winner rewrites the assignments
    const updated = check(
      await this.db.from("drafts").update(this.draftRow(d)).eq("id", d.id).eq("user_id", d.userId).eq("version", expectedVersion).select("id"),
    );
    if (!updated || updated.length !== 1) throw new ConflictError();
    await this.writeAssignments(d);
    return d;
  }
  async deleteDraft(userId: string, id: string) {
    const previews = check(await this.db.from("previews").select("storage_key").eq("user_id", userId).eq("draft_id", id));
    check(await this.db.from("drafts").delete().eq("user_id", userId).eq("id", id));
    return previews.map((p: R) => p.storage_key).filter(Boolean);
  }

  /* previews */
  async listPreviews(userId: string, draftId: string) {
    return check(await this.db.from("previews").select("*").eq("user_id", userId).eq("draft_id", draftId).order("created_at")).map(previewFrom);
  }
  async getPreview(userId: string, id: string) {
    const r = check(await this.db.from("previews").select("*").eq("user_id", userId).eq("id", id).maybeSingle());
    return r ? previewFrom(r) : null;
  }
  async reservePreview(p: Preview, u: UsageEvent, opts: { freeLimit?: number; order?: Order }) {
    const res = await this.db.rpc("reserve_preview_v2", {
      p: {
        id: p.id,
        user_id: p.userId,
        draft_id: p.draftId,
        kind: p.kind,
        role_id: p.roleId ?? null,
        person_id: p.personId ?? null,
        fingerprint: p.fingerprint,
        draft_version: p.draftVersion,
        provider: p.provider,
        is_demo: p.isDemo,
        paid: Boolean(opts.order),
      },
      u: {
        id: u.id,
        user_id: u.userId,
        provider: u.provider,
        is_demo: u.isDemo,
        ref_id: u.refId,
        free: Boolean(u.free),
        estimated_cost: u.estimatedCost ?? null,
        currency: u.currency,
      },
      free_limit: opts.freeLimit ?? null,
      o: opts.order ? this.orderRow(opts.order) : null,
    });
    if (res.error) throw limitFrom(res.error.message) ?? new Error(`supabase: ${res.error.message}`);
    const row = (res.data as R[])[0];
    return { preview: previewFrom(row.preview), reused: Boolean(row.reused) };
  }
  async countFreePreviews(userId: string) {
    const res = await this.db
      .from("usage_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("kind", "preview_image")
      .eq("free", true)
      .eq("refunded", false);
    if (res.error) throw new Error(res.error.message);
    return res.count ?? 0;
  }
  async updatePreview(id: string, patch: Partial<Preview>) {
    const r = check(await this.db.from("previews").update(previewTo(patch)).eq("id", id).select("*").single());
    return previewFrom(r);
  }
  async refundUsage(refId: string) {
    check(await this.db.from("usage_events").update({ refunded: true }).eq("ref_id", refId));
  }

  /* usage */
  async countUsage(userId: string, kind: UsageKind) {
    const res = await this.db.from("usage_events").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("kind", kind).eq("refunded", false);
    if (res.error) throw new Error(res.error.message);
    return res.count ?? 0;
  }
  async addUsage(e: UsageEvent) {
    check(
      await this.db.from("usage_events").insert({
        id: e.id,
        user_id: e.userId,
        kind: e.kind,
        provider: e.provider,
        is_demo: e.isDemo,
        ref_id: e.refId,
        estimated_cost: e.estimatedCost ?? null,
        actual_cost: e.actualCost ?? null,
        currency: e.currency,
      }),
    );
  }
  async updateUsage(refId: string, patch: Partial<UsageEvent>) {
    const r: R = {};
    if (patch.actualCost !== undefined) r.actual_cost = patch.actualCost;
    if (patch.estimatedCost !== undefined) r.estimated_cost = patch.estimatedCost;
    if (Object.keys(r).length) check(await this.db.from("usage_events").update(r).eq("ref_id", refId));
  }
  async resetDemoUsage(userId: string) {
    // only demo events can be reset — real spend is never forgotten
    check(await this.db.from("usage_events").update({ refunded: true }).eq("user_id", userId).eq("kind", "preview_image").eq("is_demo", true).eq("free", true));
  }

  /* jobs */
  async createJobOnce(job: Job, limits: { perUser: number; global: number; perDay: number }) {
    const res = await this.db.rpc("create_video_job", {
      j: {
        id: job.id,
        user_id: job.userId,
        draft_id: job.draftId,
        idempotency_key: job.idempotencyKey,
        input: job.input,
        provider: job.provider,
        is_demo: job.isDemo,
        max_attempts: job.maxAttempts,
        estimated_cost: job.estimatedCost ?? null,
        cost_currency: job.costCurrency ?? null,
      },
      per_user: limits.perUser,
      global_limit: limits.global,
      per_day: limits.perDay,
    });
    if (res.error) throw limitFrom(res.error.message) ?? new Error(`supabase: ${res.error.message}`);
    const row = (res.data as R[])[0];
    return { job: jobFrom(row.job), created: Boolean(row.created) };
  }
  async getJob(userId: string, id: string) {
    const r = check(await this.db.from("video_jobs").select("*").eq("user_id", userId).eq("id", id).maybeSingle());
    return r ? jobFrom(r) : null;
  }
  async listJobs(userId: string) {
    return check(await this.db.from("video_jobs").select("*").eq("user_id", userId).order("created_at", { ascending: false })).map(jobFrom);
  }
  async claimJob(workerId: string, leaseMs: number) {
    const res = await this.db.rpc("claim_video_job", { worker: workerId, lease_ms: leaseMs });
    if (res.error) throw new Error(`supabase: ${res.error.message}`);
    const rows = res.data as R[];
    return rows.length ? jobFrom(rows[0]) : null;
  }
  async updateJob(id: string, patch: Partial<Job>, lockedBy?: string) {
    let q = this.db.from("video_jobs").update({ ...jobTo(patch), updated_at: new Date().toISOString() }).eq("id", id);
    if (lockedBy) q = q.eq("locked_by", lockedBy);
    const rows = check(await q.select("*"));
    if (!rows || rows.length !== 1) {
      if (lockedBy) throw new ConflictError("Задание обрабатывает другой обработчик");
      throw new NotFoundError("Задание не найдено");
    }
    return jobFrom(rows[0]);
  }
  async getJobByProviderTask(provider: string, taskId: string) {
    const r = check(await this.db.from("video_jobs").select("*").eq("provider", provider).eq("provider_task_id", taskId).maybeSingle());
    return r ? jobFrom(r) : null;
  }
  async deleteJob(userId: string, id: string) {
    const j = await this.getJob(userId, id);
    if (!j) throw new NotFoundError();
    if ((ACTIVE_JOB_STATUSES as readonly string[]).includes(j.status))
      throw new ConflictError("Видео ещё создаётся — удалить можно после завершения");
    check(await this.db.from("video_jobs").delete().eq("user_id", userId).eq("id", id));
    return [j.resultKey, j.rawResultKey].filter((k): k is string => Boolean(k));
  }
  async recordResultFile(f: { userId: string; jobId: string; kind: "raw" | "final"; storageKey: string; durationSec?: number; hasAudio?: boolean }) {
    check(
      await this.db.from("result_files").insert({
        user_id: f.userId,
        job_id: f.jobId,
        kind: f.kind,
        storage_key: f.storageKey,
        duration_sec: f.durationSec ?? null,
        has_audio: f.hasAudio ?? null,
      }),
    );
  }

  /* purchases */
  private orderRow(o: Order): R {
    return {
      id: o.id,
      user_id: o.userId,
      kind: o.kind,
      ref_id: o.refId,
      idempotency_key: o.idempotencyKey,
      amount_minor: o.amountMinor,
      currency: o.currency,
      price_is_example: o.priceIsExample,
      status: o.status,
      method: o.method,
    };
  }
  private orderFrom(r: R): Order {
    return {
      id: r.id,
      userId: r.user_id,
      kind: r.kind,
      refId: r.ref_id,
      idempotencyKey: r.idempotency_key,
      amountMinor: r.amount_minor,
      currency: r.currency,
      priceIsExample: r.price_is_example,
      status: r.status,
      method: r.method,
      createdAt: r.created_at,
      refundedAt: undef(r.refunded_at),
    };
  }
  async createOrder(o: Order) {
    const res = await this.db.from("purchases").insert(this.orderRow(o)).select("*").maybeSingle();
    if (res.error) {
      // unique (user_id, idempotency_key): the same purchase already exists
      const existing = check(await this.db.from("purchases").select("*").eq("user_id", o.userId).eq("idempotency_key", o.idempotencyKey).maybeSingle());
      if (existing) return this.orderFrom(existing);
      throw new Error(`supabase: ${res.error.message}`);
    }
    return res.data ? this.orderFrom(res.data) : o;
  }
  async getOrderForRef(userId: string, refId: string) {
    const r = check(await this.db.from("purchases").select("*").eq("user_id", userId).eq("ref_id", refId).maybeSingle());
    return r ? this.orderFrom(r) : null;
  }
  async refundOrderForRef(refId: string) {
    check(await this.db.from("purchases").update({ status: "refunded", refunded_at: new Date().toISOString() }).eq("ref_id", refId).eq("status", "test_paid"));
  }
}
