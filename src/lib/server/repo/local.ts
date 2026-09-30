/**
 * Demo data backend: SQLite (node:sqlite) in .data/memni.db. The Next.js server
 * and the worker are separate processes, so we need real transactions and
 * WAL — a JSON file would lose writes. Rows keep the entity as JSON plus the
 * columns we filter on.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import type { Draft, Job, Order, Person, Photo, Preview, UsageEvent, UsageKind, User } from "../../domain/types";
import { ACTIVE_JOB_STATUSES, ConflictError, LimitError, NotFoundError, type Repo } from "./types";

type Row = { data: string };


export class LocalRepo implements Repo {
  readonly kind = "local" as const;
  private db: DatabaseSyncType;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    // getBuiltinModule: bundlers (Turbopack) cannot rewrite it, and node:sqlite is Node-only anyway
    const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
    this.db = new DatabaseSync(join(dataDir, "memni.db"));
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, telegram_id TEXT, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS people (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, person_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS drafts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS previews (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, draft_id TEXT NOT NULL, person_id TEXT, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, draft_id TEXT NOT NULL, idem_key TEXT NOT NULL,
        status TEXT NOT NULL, provider TEXT, provider_task_id TEXT, locked_until TEXT, next_poll_at TEXT,
        created_at TEXT NOT NULL, data TEXT NOT NULL, UNIQUE (user_id, idem_key));
      CREATE TABLE IF NOT EXISTS usage (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, ref_id TEXT, refunded INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, job_id TEXT NOT NULL, data TEXT NOT NULL);
    `);
  }

  private tx<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const out = fn();
      this.db.exec("COMMIT");
      return out;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  private one<T>(sql: string, ...params: (string | number | null)[]): T | null {
    const row = this.db.prepare(sql).get(...params) as Row | undefined;
    return row ? (JSON.parse(row.data) as T) : null;
  }
  private many<T>(sql: string, ...params: (string | number | null)[]): T[] {
    return (this.db.prepare(sql).all(...params) as Row[]).map((r) => JSON.parse(r.data) as T);
  }
  private run(sql: string, ...params: (string | number | null)[]) {
    return this.db.prepare(sql).run(...params);
  }

  /* users */
  async ensureUser(user: User) {
    const existing = await this.getUser(user.id);
    if (existing) return existing;
    this.run("INSERT OR IGNORE INTO users (id, telegram_id, data) VALUES (?, ?, ?)", user.id, user.telegramId ?? null, JSON.stringify(user));
    return user;
  }
  async getUser(id: string) {
    return this.one<User>("SELECT data FROM users WHERE id = ?", id);
  }
  async findUserByTelegramId(telegramId: string) {
    return this.one<User>("SELECT data FROM users WHERE telegram_id = ?", telegramId);
  }

  /* people */
  async listPeople(userId: string) {
    return this.many<Person>("SELECT data FROM people WHERE user_id = ? ORDER BY json_extract(data,'$.createdAt') DESC", userId);
  }
  async getPerson(userId: string, id: string) {
    return this.one<Person>("SELECT data FROM people WHERE id = ? AND user_id = ?", id, userId);
  }
  async savePerson(p: Person) {
    const owner = this.db.prepare("SELECT user_id FROM people WHERE id = ?").get(p.id) as { user_id: string } | undefined;
    if (owner && owner.user_id !== p.userId) throw new NotFoundError();
    this.run("INSERT OR REPLACE INTO people (id, user_id, data) VALUES (?, ?, ?)", p.id, p.userId, JSON.stringify(p));
    return p;
  }
  async deletePerson(userId: string, id: string) {
    return this.tx(() => {
      const person = this.one<Person>("SELECT data FROM people WHERE id = ? AND user_id = ?", id, userId);
      if (!person) throw new NotFoundError("Человек не найден");
      const photos = this.many<Photo>("SELECT data FROM photos WHERE person_id = ? AND user_id = ?", id, userId);
      const previews = this.many<Preview>("SELECT data FROM previews WHERE user_id = ?", userId).filter(
        (p) => p.personId === id || (p.kind === "scene" && this.sceneIncludes(p, id)),
      );
      this.run("DELETE FROM photos WHERE person_id = ? AND user_id = ?", id, userId);
      for (const p of previews) this.run("DELETE FROM previews WHERE id = ?", p.id);
      this.run("DELETE FROM people WHERE id = ? AND user_id = ?", id, userId);
      return [...photos.map((p) => p.storageKey), ...previews.flatMap((p) => (p.storageKey ? [p.storageKey] : []))];
    });
  }
  private sceneIncludes(p: Preview, personId: string): boolean {
    const draft = this.one<Draft>("SELECT data FROM drafts WHERE id = ?", p.draftId);
    return Boolean(draft && Object.values(draft.assignments).some((a) => a?.personId === personId));
  }

  /* photos */
  async listPhotos(userId: string, personIds: string[]) {
    if (personIds.length === 0) return [];
    const marks = personIds.map(() => "?").join(",");
    return this.many<Photo>(
      `SELECT data FROM photos WHERE user_id = ? AND person_id IN (${marks}) ORDER BY json_extract(data,'$.createdAt')`,
      userId,
      ...personIds,
    );
  }
  async getPhoto(userId: string, id: string) {
    return this.one<Photo>("SELECT data FROM photos WHERE id = ? AND user_id = ?", id, userId);
  }
  async savePhoto(p: Photo) {
    this.run("INSERT OR REPLACE INTO photos (id, user_id, person_id, data) VALUES (?, ?, ?, ?)", p.id, p.userId, p.personId, JSON.stringify(p));
    return p;
  }
  async deletePhoto(userId: string, id: string) {
    const p = await this.getPhoto(userId, id);
    if (!p) return null;
    this.run("DELETE FROM photos WHERE id = ? AND user_id = ?", id, userId);
    return p.storageKey;
  }

  /* drafts */
  async listDrafts(userId: string) {
    return this.many<Draft>("SELECT data FROM drafts WHERE user_id = ? ORDER BY json_extract(data,'$.updatedAt') DESC", userId);
  }
  async getDraft(userId: string, id: string) {
    return this.one<Draft>("SELECT data FROM drafts WHERE id = ? AND user_id = ?", id, userId);
  }
  async createDraft(d: Draft) {
    this.run("INSERT INTO drafts (id, user_id, version, data) VALUES (?, ?, ?, ?)", d.id, d.userId, d.version, JSON.stringify(d));
    return d;
  }
  async updateDraft(d: Draft, expectedVersion: number) {
    const res = this.run(
      "UPDATE drafts SET version = ?, data = ? WHERE id = ? AND user_id = ? AND version = ?",
      d.version,
      JSON.stringify(d),
      d.id,
      d.userId,
      expectedVersion,
    );
    if (Number(res.changes) !== 1) throw new ConflictError();
    return d;
  }
  async deleteDraft(userId: string, id: string) {
    return this.tx(() => {
      const previews = this.many<Preview>("SELECT data FROM previews WHERE draft_id = ? AND user_id = ?", id, userId);
      this.run("DELETE FROM previews WHERE draft_id = ? AND user_id = ?", id, userId);
      this.run("DELETE FROM drafts WHERE id = ? AND user_id = ?", id, userId);
      return previews.flatMap((p) => (p.storageKey ? [p.storageKey] : []));
    });
  }

  /* previews */
  async listPreviews(userId: string, draftId: string) {
    return this.many<Preview>(
      "SELECT data FROM previews WHERE user_id = ? AND draft_id = ? ORDER BY json_extract(data,'$.createdAt')",
      userId,
      draftId,
    );
  }
  async getPreview(userId: string, id: string) {
    return this.one<Preview>("SELECT data FROM previews WHERE id = ? AND user_id = ?", id, userId);
  }
  async reservePreview(p: Preview, usage: UsageEvent, limit: number) {
    return this.tx(() => {
      const used = this.db
        .prepare("SELECT COUNT(*) AS n FROM usage WHERE user_id = ? AND kind = 'preview_image' AND refunded = 0")
        .get(p.userId) as { n: number };
      if (Number(used.n) >= limit)
        throw new LimitError("preview_limit", "Бесплатные превью закончились");
      const seqRow = this.db
        .prepare(
          "SELECT COUNT(*) AS n FROM previews WHERE draft_id = ? AND json_extract(data,'$.kind') = ? AND IFNULL(json_extract(data,'$.roleId'),'') = ?",
        )
        .get(p.draftId, p.kind, p.roleId ?? "") as { n: number };
      const preview = { ...p, seq: Number(seqRow.n) + 1 };
      this.run(
        "INSERT INTO previews (id, user_id, draft_id, person_id, data) VALUES (?, ?, ?, ?, ?)",
        preview.id,
        preview.userId,
        preview.draftId,
        preview.personId ?? null,
        JSON.stringify(preview),
      );
      this.run(
        "INSERT INTO usage (id, user_id, kind, ref_id, data) VALUES (?, ?, ?, ?, ?)",
        usage.id,
        usage.userId,
        usage.kind,
        usage.refId,
        JSON.stringify(usage),
      );
      return preview;
    });
  }
  async updatePreview(id: string, patch: Partial<Preview>) {
    return this.tx(() => {
      const cur = this.one<Preview>("SELECT data FROM previews WHERE id = ?", id);
      if (!cur) throw new NotFoundError();
      const next = { ...cur, ...patch, id: cur.id, userId: cur.userId };
      this.run("UPDATE previews SET data = ? WHERE id = ?", JSON.stringify(next), id);
      return next;
    });
  }
  async refundUsage(refId: string) {
    this.run("UPDATE usage SET refunded = 1 WHERE ref_id = ?", refId);
  }

  /* usage */
  async countUsage(userId: string, kind: UsageKind) {
    const r = this.db
      .prepare("SELECT COUNT(*) AS n FROM usage WHERE user_id = ? AND kind = ? AND refunded = 0")
      .get(userId, kind) as { n: number };
    return Number(r.n);
  }
  async addUsage(e: UsageEvent) {
    this.run("INSERT INTO usage (id, user_id, kind, ref_id, data) VALUES (?, ?, ?, ?, ?)", e.id, e.userId, e.kind, e.refId, JSON.stringify(e));
  }
  async updateUsage(refId: string, patch: Partial<UsageEvent>) {
    const rows = this.db.prepare("SELECT id, data FROM usage WHERE ref_id = ?").all(refId) as { id: string; data: string }[];
    for (const r of rows) this.run("UPDATE usage SET data = ? WHERE id = ?", JSON.stringify({ ...JSON.parse(r.data), ...patch }), r.id);
  }
  async resetDemoUsage(userId: string) {
    // only demo events can be reset — real spend is never forgotten
    this.run("UPDATE usage SET refunded = 1 WHERE user_id = ? AND kind = 'preview_image' AND json_extract(data,'$.isDemo') = 1", userId);
  }

  /* jobs */
  async createJobOnce(job: Job, limits: { perUser: number; global: number; perDay: number }) {
    return this.tx(() => {
      const existing = this.one<Job>("SELECT data FROM jobs WHERE user_id = ? AND idem_key = ?", job.userId, job.idempotencyKey);
      if (existing) return { job: existing, created: false };
      const marks = ACTIVE_JOB_STATUSES.map(() => "?").join(",");
      const mine = this.db
        .prepare(`SELECT COUNT(*) AS n FROM jobs WHERE user_id = ? AND status IN (${marks})`)
        .get(job.userId, ...ACTIVE_JOB_STATUSES) as { n: number };
      if (Number(mine.n) >= limits.perUser)
        throw new LimitError("active_jobs", "Предыдущее видео ещё создаётся — дождитесь его, чтобы начать новое");
      const all = this.db
        .prepare(`SELECT COUNT(*) AS n FROM jobs WHERE status IN (${marks})`)
        .get(...ACTIVE_JOB_STATUSES) as { n: number };
      if (Number(all.n) >= limits.global)
        throw new LimitError("global_jobs", "Сейчас создаётся много видео. Попробуйте через несколько минут");
      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      const today = this.db
        .prepare("SELECT COUNT(*) AS n FROM jobs WHERE user_id = ? AND created_at > ?")
        .get(job.userId, since) as { n: number };
      if (Number(today.n) >= limits.perDay)
        throw new LimitError("daily_jobs", "На сегодня лимит видео исчерпан");
      this.insertJob(job);
      return { job, created: true };
    });
  }
  private insertJob(j: Job) {
    this.run(
      `INSERT INTO jobs (id, user_id, draft_id, idem_key, status, provider, provider_task_id, locked_until, next_poll_at, created_at, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      j.id,
      j.userId,
      j.draftId,
      j.idempotencyKey,
      j.status,
      j.provider,
      j.providerTaskId ?? null,
      j.lockedUntil ?? null,
      j.nextPollAt ?? null,
      j.createdAt,
      JSON.stringify(j),
    );
  }
  async getJob(userId: string, id: string) {
    return this.one<Job>("SELECT data FROM jobs WHERE id = ? AND user_id = ?", id, userId);
  }
  async listJobs(userId: string) {
    return this.many<Job>("SELECT data FROM jobs WHERE user_id = ? ORDER BY created_at DESC", userId);
  }
  async claimJob(workerId: string, leaseMs: number) {
    return this.tx(() => {
      const now = new Date().toISOString();
      const marks = ACTIVE_JOB_STATUSES.map(() => "?").join(",");
      const row = this.one<Job>(
        `SELECT data FROM jobs WHERE status IN (${marks})
           AND (locked_until IS NULL OR locked_until < ?)
           AND (next_poll_at IS NULL OR next_poll_at <= ?)
         ORDER BY created_at LIMIT 1`,
        ...ACTIVE_JOB_STATUSES,
        now,
        now,
      );
      if (!row) return null;
      const lockedUntil = new Date(Date.now() + leaseMs).toISOString();
      const next: Job = { ...row, lockedBy: workerId, lockedUntil, updatedAt: now };
      this.writeJob(next);
      return next;
    });
  }
  private writeJob(j: Job) {
    this.run(
      "UPDATE jobs SET status = ?, provider_task_id = ?, locked_until = ?, next_poll_at = ?, data = ? WHERE id = ?",
      j.status,
      j.providerTaskId ?? null,
      j.lockedUntil ?? null,
      j.nextPollAt ?? null,
      JSON.stringify(j),
      j.id,
    );
  }
  async updateJob(id: string, patch: Partial<Job>, lockedBy?: string) {
    return this.tx(() => {
      const cur = this.one<Job>("SELECT data FROM jobs WHERE id = ?", id);
      if (!cur) throw new NotFoundError("Задание не найдено");
      if (lockedBy && cur.lockedBy !== lockedBy) throw new ConflictError("Задание обрабатывает другой обработчик");
      const next: Job = { ...cur, ...patch, id: cur.id, userId: cur.userId, updatedAt: new Date().toISOString() };
      this.writeJob(next);
      return next;
    });
  }
  async getJobByProviderTask(provider: string, taskId: string) {
    return this.one<Job>("SELECT data FROM jobs WHERE provider = ? AND provider_task_id = ?", provider, taskId);
  }
  async deleteJob(userId: string, id: string) {
    const j = await this.getJob(userId, id);
    if (!j) throw new NotFoundError();
    if ((ACTIVE_JOB_STATUSES as readonly string[]).includes(j.status))
      throw new ConflictError("Видео ещё создаётся — удалить можно после завершения");
    this.run("DELETE FROM jobs WHERE id = ? AND user_id = ?", id, userId);
    this.run("DELETE FROM orders WHERE job_id = ? AND user_id = ?", id, userId);
    return [j.resultKey, j.rawResultKey].filter((k): k is string => Boolean(k));
  }

  async recordResultFile() {
    // local mode keeps result keys on the job row itself
  }

  /* orders */
  async createOrder(o: Order) {
    this.run("INSERT INTO orders (id, user_id, job_id, data) VALUES (?, ?, ?, ?)", o.id, o.userId, o.jobId, JSON.stringify(o));
    return o;
  }
  async getOrderForJob(userId: string, jobId: string) {
    return this.one<Order>("SELECT data FROM orders WHERE job_id = ? AND user_id = ?", jobId, userId);
  }
}
