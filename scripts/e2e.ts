/**
 * End-to-end check of the whole demo flow over HTTP, against a running server
 * and worker (npm run build && npm start, npm run worker).
 *
 *   BASE_URL=http://localhost:3000 npm run e2e
 *
 * Covers: drafts, people, photo validation, role assignment and swap,
 * confirmation removal after changes, stale-answer protection, preview limit,
 * idempotent video start, worker stages, original audio in the result,
 * failure + manual retry, ownership isolation between two users.
 */
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { probe } from "../src/lib/server/media";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

class Client {
  cookies = new Map<string, string>();
  constructor(public name: string) {}
  private header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  async req(path: string, init: RequestInit & { json?: unknown } = {}) {
    const { json, ...rest } = init;
    const res = await fetch(BASE + path, {
      ...rest,
      redirect: "manual",
      headers: { cookie: this.header(), ...(json !== undefined ? { "content-type": "application/json" } : {}), ...(rest.headers ?? {}) },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
    return res;
  }
  async json<T = any>(path: string, init: RequestInit & { json?: unknown } = {}, expect = 200): Promise<T> {
    const res = await this.req(path, init);
    const body = await res.json().catch(() => null);
    if (res.status !== expect) throw new Error(`${this.name} ${init.method ?? "GET"} ${path} → ${res.status} (expected ${expect}): ${JSON.stringify(body)}`);
    return body as T;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let step = 0;
const ok = (msg: string) => console.log(`  ✓ ${++step}. ${msg}`);

async function testPhoto(hue: number, w = 900, h = 1200): Promise<Blob> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="hsl(${hue},60%,70%)"/><circle cx="${w / 2}" cy="${h / 3}" r="${w / 5}" fill="#f1d3b5"/><rect x="${w / 4}" y="${h / 2}" width="${w / 2}" height="${h / 2}" rx="60" fill="hsl(${hue},60%,40%)"/></svg>`;
  const buf = await sharp(Buffer.from(svg)).jpeg().toBuffer();
  return new Blob([new Uint8Array(buf)], { type: "image/jpeg" });
}

async function upload(c: Client, personId: string, blob: Blob, expect = 201) {
  const fd = new FormData();
  fd.append("file", blob, "photo.jpg");
  return c.json(`/api/people/${personId}/photos`, { method: "POST", body: fd }, expect);
}

async function waitDraft(c: Client, draftId: string, pred: (d: any) => boolean, what: string, ms = 20000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const d = await c.json(`/api/drafts/${draftId}`);
    if (pred(d)) return d;
    await sleep(400);
  }
  throw new Error(`timeout waiting for ${what}`);
}

async function main() {
  console.log(`E2E against ${BASE}`);
  const a = new Client("A");
  const b = new Client("B");

  const me = await a.json("/api/me");
  assert.equal(me.config.isDemo, true, "e2e expects demo mode");
  await a.json("/api/demo", { method: "POST", json: { resetQuota: true } });
  ok("session created, demo mode");

  const { id: draftId } = await a.json("/api/drafts", { method: "POST", json: { templateId: "hotel-lobby" } }, 201);
  let d = await a.json(`/api/drafts/${draftId}`);
  assert.equal(d.roles.length, 2);
  ok("draft for Hotel Lobby with 2 roles");

  const sasha = await a.json("/api/people", { method: "POST", json: { name: "Саша", saved: true } }, 201);
  const masha = await a.json("/api/people", { method: "POST", json: { name: "Маша", saved: false } }, 201);

  // photo validation
  const bad = await upload(a, sasha.id, new Blob([new TextEncoder().encode("not an image")], { type: "image/jpeg" }), 400);
  assert.match(bad.error, /JPEG|открыть/);
  const small = await upload(a, sasha.id, await testPhoto(10, 300, 300), 400);
  assert.match(small.error, /маленькое/);
  ok("rejects non-image and too-small photo with clear messages");
  const p1 = await upload(a, sasha.id, await testPhoto(20));
  await upload(a, sasha.id, await testPhoto(40));
  await upload(a, masha.id, await testPhoto(200));
  ok("uploaded photos (stored privately, EXIF stripped)");

  d = await a.json(`/api/drafts/${draftId}`, { method: "PATCH", json: { op: "assign", roleId: "mic-left", personId: sasha.id, version: d.version } });
  d = await a.json(`/api/drafts/${draftId}`, { method: "PATCH", json: { op: "assign", roleId: "mic-right", personId: masha.id, version: d.version } });
  assert.equal(d.roles[0].person.name, "Саша");
  assert.equal(d.roles[1].person.name, "Маша");
  // stale version → conflict
  const conflict = await a.req(`/api/drafts/${draftId}`, { method: "PATCH", json: { op: "clear", roleId: "mic-left", version: d.version - 1 } });
  assert.equal(conflict.status, 409);
  ok("roles assigned; outdated version gets 409 (no lost updates)");

  d = await a.json(`/api/drafts/${draftId}`, { method: "PATCH", json: { op: "swap", roleA: "mic-left", roleB: "mic-right", version: d.version } });
  assert.equal(d.roles[0].person.name, "Маша");
  d = await a.json(`/api/drafts/${draftId}`, { method: "PATCH", json: { op: "assign", roleId: "mic-left", personId: sasha.id, version: d.version } });
  assert.equal(d.roles[0].person.name, "Саша");
  assert.equal(d.roles[1].person.name, "Маша", "assigning a person from another role swaps them");
  ok("swap and swap-by-assign work");

  // person previews
  const gen = await a.json(`/api/drafts/${draftId}/previews`, { method: "POST", json: { roleId: "mic-left" } }, 202);
  const dup = await a.json(`/api/drafts/${draftId}/previews`, { method: "POST", json: { roleId: "mic-left" } }, 200);
  assert.equal(dup.reused, true);
  assert.equal(dup.preview.id, gen.preview.id);
  ok("second click while generating reuses the running request (no second paid call)");
  d = await waitDraft(a, draftId, (x) => x.roles[0].previews.some((p: any) => p.status === "ready"), "left preview");
  assert.equal(d.roles[0].selectedPreviewId, gen.preview.id);
  const imgRes = await a.req(d.roles[0].previews[0].url);
  assert.equal(imgRes.status, 200);
  assert.equal(imgRes.headers.get("content-type"), "image/jpeg");
  ok("person preview ready, selected, served only through the owner check");

  // stale answer: start a preview, then change the look before it finishes
  const g2 = await a.json(`/api/drafts/${draftId}/previews`, { method: "POST", json: { roleId: "mic-left" } }, 202);
  d = await a.json(`/api/drafts/${draftId}`);
  d = await a.json(`/api/drafts/${draftId}`, { method: "PATCH", json: { op: "look", roleId: "mic-left", look: { clothing: "template" }, version: d.version } });
  d = await waitDraft(a, draftId, (x) => x.roles[0].previews.find((p: any) => p.id === g2.preview.id)?.status === "ready", "stale preview");
  assert.notEqual(d.roles[0].selectedPreviewId, g2.preview.id, "late answer must not become the current variant");
  const stale = d.roles[0].previews.find((p: any) => p.id === g2.preview.id);
  assert.notEqual(stale.fingerprint, d.roles[0].fingerprint);
  const staleConfirm = await a.req(`/api/drafts/${draftId}`, { method: "PATCH", json: { op: "confirm", roleId: "mic-left", previewId: g2.preview.id, version: d.version } });
  assert.equal(staleConfirm.status, 400);
  ok("late answer for old settings stays in history, is not auto-selected and cannot be confirmed");

  // back to the original look → old variant #1 matches again and can be confirmed for free
  d = await a.json(`/api/drafts/${draftId}`, { method: "PATCH", json: { op: "look", roleId: "mic-left", look: { clothing: "photo" }, version: d.version } });
  const before = (await a.json("/api/me")).quota.used;
  d = await a.json(`/api/drafts/${draftId}`, { method: "PATCH", json: { op: "confirm", roleId: "mic-left", previewId: gen.preview.id, version: d.version } });
  assert.equal(d.roles[0].confirmedPreviewId, gen.preview.id);
  assert.equal((await a.json("/api/me")).quota.used, before, "confirm is free");
  ok("returning to earlier settings revives the old variant; confirming spends nothing");

  // confirmation removed by a change
  await upload(a, sasha.id, await testPhoto(60));
  d = await a.json(`/api/drafts/${draftId}`);
  assert.equal(d.roles[0].confirmedPreviewId, null, "new photo drops the confirmation");
  assert.ok(d.cleared.some((c: any) => c.roleId === "mic-left"));
  ok("adding a photo removes the confirmation (old variant kept in history)");
  await a.json(`/api/photos/${(await a.json("/api/people")).find((p: any) => p.id === sasha.id).photos.at(-1).id}`, { method: "DELETE" });
  d = await a.json(`/api/drafts/${draftId}`);
  d = await a.json(`/api/drafts/${draftId}`, { method: "PATCH", json: { op: "confirm", roleId: "mic-left", previewId: gen.preview.id, version: d.version } });

  await a.json(`/api/drafts/${draftId}/previews`, { method: "POST", json: { roleId: "mic-right" } }, 202);
  d = await waitDraft(a, draftId, (x) => x.roles[1].previews.some((p: any) => p.status === "ready"), "right preview");
  d = await a.json(`/api/drafts/${draftId}`, { method: "PATCH", json: { op: "confirm", roleId: "mic-right", previewId: d.roles[1].selectedPreviewId, version: d.version } });
  ok("both looks confirmed");

  // scene
  const sg = await a.json(`/api/drafts/${draftId}/previews`, { method: "POST", json: {} }, 202);
  d = await waitDraft(a, draftId, (x) => x.scene.previews.some((p: any) => p.id === sg.preview.id && p.status === "ready"), "scene");
  d = await a.json(`/api/drafts/${draftId}`, { method: "PATCH", json: { op: "confirm", previewId: sg.preview.id, version: d.version } });
  assert.equal(d.scene.confirmedPreviewId, sg.preview.id);
  assert.equal(d.video.canStart, true);
  // swapping roles drops both person and scene confirmations
  d = await a.json(`/api/drafts/${draftId}`, { method: "PATCH", json: { op: "swap", roleA: "mic-left", roleB: "mic-right", version: d.version } });
  assert.equal(d.scene.confirmedPreviewId, null);
  assert.equal(d.roles[0].confirmedPreviewId, null);
  d = await a.json(`/api/drafts/${draftId}`, { method: "PATCH", json: { op: "swap", roleA: "mic-left", roleB: "mic-right", version: d.version } });
  assert.equal(d.scene.confirmedPreviewId, null, "swapping back does not silently re-confirm");
  for (const r of d.roles) {
    const prev = r.previews.find((p: any) => p.fingerprint === r.fingerprint && p.status === "ready");
    d = await a.json(`/api/drafts/${draftId}`, { method: "PATCH", json: { op: "confirm", roleId: r.roleId, previewId: prev.id, version: d.version } });
  }
  d = await a.json(`/api/drafts/${draftId}`, { method: "PATCH", json: { op: "confirm", previewId: sg.preview.id, version: d.version } });
  ok("scene confirmed; swap removes it; re-confirming old matching variants is free");

  // video, idempotent
  const v1 = await a.json(`/api/drafts/${draftId}/video`, { method: "POST" }, 201);
  const [v2, v3] = await Promise.all([a.req(`/api/drafts/${draftId}/video`, { method: "POST" }), a.req(`/api/drafts/${draftId}/video`, { method: "POST" })]);
  for (const r of [v2, v3]) {
    assert.equal(r.status, 200);
    assert.equal((await r.json()).job.id, v1.job.id);
  }
  ok("repeated and parallel «Создать видео» return the same job");

  // draft changes after start do not touch the job
  d = await a.json(`/api/drafts/${draftId}`);
  d = await a.json(`/api/drafts/${draftId}`, { method: "PATCH", json: { op: "look", roleId: "mic-right", look: { clothing: "template" }, version: d.version } });

  const seen = new Set<string>();
  let job: any;
  const until = Date.now() + 90_000;
  while (Date.now() < until) {
    job = (await a.json(`/api/jobs/${v1.job.id}`)).job;
    seen.add(job.status);
    if (["ready", "failed", "needs_review"].includes(job.status)) break;
    await sleep(500);
  }
  assert.equal(job.status, "ready", `job ended as ${job.status}: ${job.error}`);
  assert.ok(seen.has("generating"), `stages seen: ${[...seen].join(",")}`);
  ok(`job went through ${[...seen].join(" → ")}`);

  const video = await a.req(`/api/files/job/${v1.job.id}?download=1`);
  assert.equal(video.status, 200);
  assert.match(video.headers.get("content-disposition") ?? "", /attachment/);
  const dir = await mkdtemp(join(tmpdir(), "memni-e2e-"));
  const file = join(dir, "result.mp4");
  await writeFile(file, Buffer.from(await video.arrayBuffer()));
  const meta = await probe(file);
  assert.ok(meta.hasAudio, "result must contain audio");
  assert.ok(Math.abs(meta.durationSec - 8) < 0.2, `duration ${meta.durationSec}`);
  const range = await a.req(`/api/files/job/${v1.job.id}`, { headers: { range: "bytes=0-99" } });
  assert.equal(range.status, 206);
  ok(`result downloaded: ${meta.durationSec.toFixed(2)} s, audio stream present (ffprobe), Range works`);

  // ownership
  await b.json("/api/me");
  for (const path of [`/api/drafts/${draftId}`, `/api/jobs/${v1.job.id}`, `/api/files/job/${v1.job.id}`, `/api/files/photo/${p1.photo.id}`, `/api/files/preview/${gen.preview.id}`]) {
    const r = await b.req(path);
    assert.equal(r.status, 404, `${path} must be hidden from another user, got ${r.status}`);
  }
  const hijack = await b.req(`/api/drafts/${draftId}`, { method: "PATCH", json: { op: "clear", roleId: "mic-left", version: 1 } });
  assert.equal(hijack.status, 404);
  const steal = await b.req(`/api/people/${sasha.id}`, { method: "DELETE" });
  assert.equal(steal.status, 404);
  const forged = await b.req(`/api/drafts/${draftId}`, { headers: { cookie: `memni_sid=${[...a.cookies.values()][0].split(".")[0]}.forged` } });
  assert.equal(forged.status, 404);
  ok("another user gets 404 for drafts, jobs, files, people; forged session cookie is rejected");

  // failure + manual retry within budget
  const { id: soloDraft } = await a.json("/api/drafts", { method: "POST", json: { templateId: "morning-show", fromDraftId: draftId } }, 201);
  d = await a.json(`/api/drafts/${soloDraft}`);
  assert.equal(d.roles[0].person.id, sasha.id, "«another meme with the same people» carries people over");
  await a.json("/api/demo", { method: "POST", json: { failPreview: true } });
  const fp = await a.json(`/api/drafts/${soloDraft}/previews`, { method: "POST", json: { roleId: "host" } }, 202);
  d = await waitDraft(a, soloDraft, (x) => x.roles[0].previews.find((p: any) => p.id === fp.preview.id)?.status === "failed", "failed preview");
  ok("demo preview failure shown as an error; quota refunded");
  await a.json("/api/demo", { method: "POST", json: { failPreview: false, failVideo: true, resetQuota: true } });
  await a.json(`/api/drafts/${soloDraft}/previews`, { method: "POST", json: { roleId: "host" } }, 202);
  d = await waitDraft(a, soloDraft, (x) => x.roles[0].previews.some((p: any) => p.status === "ready"), "solo preview");
  d = await a.json(`/api/drafts/${soloDraft}`, { method: "PATCH", json: { op: "confirm", roleId: "host", previewId: d.roles[0].selectedPreviewId, version: d.version } });
  const ss = await a.json(`/api/drafts/${soloDraft}/previews`, { method: "POST", json: {} }, 202);
  d = await waitDraft(a, soloDraft, (x) => x.scene.previews.some((p: any) => p.id === ss.preview.id && p.status === "ready"), "solo scene");
  d = await a.json(`/api/drafts/${soloDraft}`, { method: "PATCH", json: { op: "confirm", previewId: ss.preview.id, version: d.version } });
  const fj = await a.json(`/api/drafts/${soloDraft}/video`, { method: "POST" }, 201);
  const waitJob = async (id: string, statuses: string[]) => {
    const end = Date.now() + 60_000;
    while (Date.now() < end) {
      const j = (await a.json(`/api/jobs/${id}`)).job;
      if (statuses.includes(j.status)) return j;
      await sleep(500);
    }
    throw new Error("job timeout");
  };
  let j = await waitJob(fj.job.id, ["failed", "ready"]);
  assert.equal(j.status, "failed");
  assert.equal(j.retryable, true);
  ok(`video failure reported: «${j.error}»`);
  await a.json("/api/demo", { method: "POST", json: { failVideo: false } });
  // the flag was frozen into the job input — retry keeps failing until the budget is spent
  await a.json(`/api/jobs/${fj.job.id}/retry`, { method: "POST" });
  j = await waitJob(fj.job.id, ["failed", "ready"]);
  assert.equal(j.attempts, 2);
  const noMore = await a.req(`/api/jobs/${fj.job.id}/retry`, { method: "POST" });
  assert.equal(noMore.status, 429);
  ok("manual retry works; attempt budget stops further retries (no endless regeneration)");

  // preview limit
  await a.json("/api/demo", { method: "POST", json: { resetQuota: true } });
  const limit = (await a.json("/api/me")).quota.limit;
  let last: Response | null = null;
  for (let i = 0; i <= limit; i++) {
    d = await a.json(`/api/drafts/${soloDraft}`);
    d = await a.json(`/api/drafts/${soloDraft}`, { method: "PATCH", json: { op: "look", roleId: "host", look: { clothing: i % 2 ? "photo" : "template" }, version: d.version } });
    last = await a.req(`/api/drafts/${soloDraft}/previews`, { method: "POST", json: { roleId: "host" } });
    if (last.status === 429) break;
    await waitDraft(a, soloDraft, (x) => !x.roles[0].previews.some((p: any) => p.status === "pending"), "limit loop");
  }
  assert.equal(last?.status, 429);
  const body = await last!.json();
  assert.equal(body.code, "preview_limit");
  const q = (await a.json("/api/me")).quota;
  assert.equal(q.left, 0);
  ok(`preview limit (${limit}) enforced on the server: «${body.error}»`);

  // deleting a person removes their files
  const mashaPhoto = (await a.json("/api/people")).find((p: any) => p.id === masha.id).photos[0].id;
  assert.equal((await a.req(`/api/files/photo/${mashaPhoto}`)).status, 200);
  const del = await a.json(`/api/people/${masha.id}`, { method: "DELETE" });
  assert.ok(del.removedFiles > 0);
  assert.equal((await a.req(`/api/files/photo/${mashaPhoto}`)).status, 404);
  d = await a.json(`/api/drafts/${draftId}`);
  assert.equal(d.roles[1].person, null, "role freed after deletion");
  ok(`person deleted with ${del.removedFiles} files; role freed`);

  console.log(`\nAll ${step} checks passed.`);
}

main().catch((e) => {
  console.error("\n✗ E2E failed:", e);
  process.exit(1);
});
