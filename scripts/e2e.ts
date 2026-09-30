/**
 * End-to-end check of the demo flow over HTTP, against a running server and
 * worker (npm run build && npm start, npm run worker).
 *
 *   BASE_URL=http://localhost:3000 npm run e2e
 *
 * Both paths: participants → shared preview → video, and participants → video
 * directly. Plus: draft resume, saved people and «не сохранять», no per-person
 * generations, stale previews, paid repeat previews and free switching, no
 * double charge / double job, failures with refunds, ownership isolation,
 * original audio in the result.
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
  async req(path: string, init: RequestInit & { json?: unknown } = {}) {
    const { json, ...rest } = init;
    const res = await fetch(BASE + path, {
      ...rest,
      redirect: "manual",
      headers: {
        cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        ...(json !== undefined ? { "content-type": "application/json" } : {}),
        ...(rest.headers ?? {}),
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
    return res;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async json<T = any>(path: string, init: RequestInit & { json?: unknown } = {}, expect = 200): Promise<T> {
    const res = await this.req(path, init);
    const body = await res.json().catch(() => null);
    if (res.status !== expect) throw new Error(`${this.name} ${init.method ?? "GET"} ${path} → ${res.status} (expected ${expect}): ${JSON.stringify(body)}`);
    return body as T;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const ok = (msg: string) => console.log(`  ✓ ${++n}. ${msg}`);

async function photo(hue: number, w = 900, h = 1200): Promise<Blob> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="hsl(${hue},60%,70%)"/><circle cx="${w / 2}" cy="${h / 3}" r="${w / 5}" fill="#f1d3b5"/></svg>`;
  return new Blob([new Uint8Array(await sharp(Buffer.from(svg)).jpeg().toBuffer())], { type: "image/jpeg" });
}
async function upload(c: Client, draftId: string, roleId: string, blob: Blob, opts: { save?: boolean; expect?: number } = {}) {
  const fd = new FormData();
  fd.append("file", blob, "photo.jpg");
  if (opts.save === false) fd.append("save", "false");
  return c.json(`/api/drafts/${draftId}/roles/${roleId}/photos`, { method: "POST", body: fd }, opts.expect ?? 201);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function until<T>(fn: () => Promise<T>, pred: (x: T) => boolean, what: string, ms = 60_000): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const x = await fn();
    if (pred(x)) return x;
    await sleep(400);
  }
  throw new Error(`timeout: ${what}`);
}

async function main() {
  console.log(`E2E against ${BASE}`);
  const a = new Client("A");
  const b = new Client("B");
  const me = await a.json("/api/me");
  assert.equal(me.config.isDemo, true, "e2e expects demo mode");
  await a.json("/api/demo", { method: "POST", json: { resetQuota: true } });

  // meme → «Сделать с собой»; opening again resumes the same draft
  const { id: draftId } = await a.json("/api/drafts", { method: "POST", json: { templateId: "hotel-lobby" } }, 201);
  const again = await a.json("/api/drafts", { method: "POST", json: { templateId: "hotel-lobby" } }, 201);
  assert.equal(again.id, draftId);
  let d = await a.json(`/api/drafts/${draftId}`);
  assert.equal(d.roles.length, 2);
  assert.equal(d.ready, false);
  ok("meme opens a draft; opening it again resumes the same draft");

  // participant 1: invalid files create nothing
  await upload(a, draftId, "left", new Blob([new TextEncoder().encode("nope")], { type: "image/jpeg" }), { expect: 400 });
  await upload(a, draftId, "left", await photo(10, 300, 300), { expect: 400 });
  assert.equal((await a.json(`/api/drafts/${draftId}`)).roles[0].person, null);
  const up1 = await upload(a, draftId, "left", await photo(20));
  await upload(a, draftId, "left", await photo(40));
  d = await a.json(`/api/drafts/${draftId}`);
  assert.equal(d.roles[0].person.id, up1.personId);
  assert.equal(d.roles[0].person.photos.length, 2, "same person, no duplicate");
  assert.equal(d.roles[0].person.saved, true, "saved by default");
  assert.equal(d.roles[0].look.clothing, "template", "default look");
  ok("participant 1: bad files rejected without side effects; 2 photos → one saved person");

  d = await a.json(`/api/drafts/${draftId}`, { method: "PATCH", json: { op: "look", roleId: "left", look: { clothing: "preset", presetId: "suit" }, version: d.version } });
  assert.equal(d.roles[0].look.presetId, "suit");
  const up2 = await upload(a, draftId, "right", await photo(200), { save: false });
  d = await a.json(`/api/drafts/${draftId}`);
  assert.equal(d.roles[1].person.saved, false, "«Не сохранять» keeps them out of the library");
  assert.equal(d.ready, true);
  assert.equal(d.previews.length, 0, "no per-person generations happened");
  ok("participant 2 with «Не сохранять»; looks stored per order; no per-person previews");

  // saved people: participant 1 is offered in a new draft, participant 2 is not
  const lib = (await a.json("/api/people")).filter((p: { saved: boolean }) => p.saved).map((p: { id: string }) => p.id);
  assert.ok(lib.includes(up1.personId) && !lib.includes(up2.personId));
  ok("library: saved person listed, unsaved one is not");

  // preview 1: free, double click reuses the request
  assert.equal(d.quotes.preview.free, true);
  const p1 = await a.json(`/api/drafts/${draftId}/previews`, { method: "POST", json: {} }, 202);
  const dup = await a.json(`/api/drafts/${draftId}/previews`, { method: "POST", json: {} }, 200);
  assert.equal(dup.preview.id, p1.preview.id);
  d = await until(() => a.json(`/api/drafts/${draftId}`), (x) => x.previews.some((p: { status: string }) => p.status === "ready"), "preview 1");
  assert.equal(d.selectedPreviewId, p1.preview.id);
  assert.equal(d.previews[0].actual, true);
  assert.equal(d.quotes.preview.free, false, "the free offer is used up — reloading does not give another");
  const img = await a.req(d.previews[0].url);
  assert.equal(img.status, 200);
  ok("first shared preview is free; a double click does not start a second one");

  // preview 2: paid; needs the confirmed price; same purchase key → same preview
  const price = d.quotes.preview.price.amountMinor;
  const noPrice = await a.req(`/api/drafts/${draftId}/previews`, { method: "POST", json: {} });
  assert.equal(noPrice.status, 402);
  assert.equal((await noPrice.json()).quote.price.amountMinor, price);
  const wrong = await a.req(`/api/drafts/${draftId}/previews`, { method: "POST", json: { acceptAmountMinor: 1, purchaseKey: "k-wrong" } });
  assert.equal(wrong.status, 402);
  const [r1, r2] = await Promise.all([
    a.req(`/api/drafts/${draftId}/previews`, { method: "POST", json: { acceptAmountMinor: price, purchaseKey: "k-1" } }),
    a.req(`/api/drafts/${draftId}/previews`, { method: "POST", json: { acceptAmountMinor: price, purchaseKey: "k-1" } }),
  ]);
  const ids = [(await r1.json()).preview.id, (await r2.json()).preview.id];
  assert.equal(ids[0], ids[1], "the same purchase never creates two previews");
  d = await until(() => a.json(`/api/drafts/${draftId}`), (x) => x.previews.length === 2 && x.previews.every((p: { status: string }) => p.status === "ready"), "preview 2");
  assert.equal(d.previews[1].paid, true);
  ok(`repeat preview is paid (${price / 100} ₽ quoted and confirmed); a double purchase with one key → one preview`);

  // switching back to variant 1 is free
  d = await a.json(`/api/drafts/${draftId}`, { method: "PATCH", json: { op: "select", previewId: p1.preview.id, version: d.version } });
  assert.equal(d.selectedPreviewId, p1.preview.id);
  assert.equal(d.previews.length, 2);
  ok("switching to an earlier variant is free and generates nothing");

  // changes make previews non-actual; an outdated preview is never sent to video
  const extra = await upload(a, draftId, "left", await photo(60));
  d = await a.json(`/api/drafts/${draftId}`);
  assert.ok(d.previews.every((p: { actual: boolean }) => !p.actual), "both previews became non-actual");
  const vp = d.quotes.video.price?.amountMinor ?? null;
  const stale = await a.req(`/api/drafts/${draftId}/video`, { method: "POST", json: { mode: "preview", previewId: p1.preview.id, acceptAmountMinor: vp } });
  assert.equal(stale.status, 409);
  await a.json(`/api/photos/${extra.photo.id}`, { method: "DELETE" });
  d = await a.json(`/api/drafts/${draftId}`);
  assert.ok(d.previews.every((p: { actual: boolean }) => p.actual), "back to the same inputs → actual again");
  ok("new photo → previews kept but not actual; outdated preview rejected for video; undo restores them");

  // path A: video from the chosen preview; price required; no duplicates
  const noVideoPrice = await a.req(`/api/drafts/${draftId}/video`, { method: "POST", json: { mode: "preview", previewId: p1.preview.id } });
  assert.equal(noVideoPrice.status, 402);
  const v1 = await a.json(`/api/drafts/${draftId}/video`, { method: "POST", json: { mode: "preview", previewId: p1.preview.id, acceptAmountMinor: vp } }, 201);
  const dupV = await Promise.all([1, 2].map(() => a.req(`/api/drafts/${draftId}/video`, { method: "POST", json: { mode: "preview", previewId: p1.preview.id, acceptAmountMinor: vp } })));
  for (const r of dupV) {
    assert.equal(r.status, 200);
    assert.equal((await r.json()).job.id, v1.job.id);
  }
  assert.equal(v1.job.mode, "preview");
  ok("path A (with preview): price confirmed, repeated and parallel clicks → one job");

  const waitJob = (id: string) => until(() => a.json(`/api/jobs/${id}`), (x) => ["ready", "failed", "needs_review"].includes(x.job.status), `job ${id}`, 90_000);
  let res = await waitJob(v1.job.id);
  assert.equal(res.job.status, "ready", res.job.error);
  assert.equal(res.order.status, "test_paid");
  assert.equal(res.order.amountMinor, vp);
  const file = join(await mkdtemp(join(tmpdir(), "memni-e2e-")), "a.mp4");
  const dl = await a.req(`/api/files/job/${v1.job.id}?download=1`);
  assert.match(dl.headers.get("content-disposition") ?? "", /attachment/);
  await writeFile(file, Buffer.from(await dl.arrayBuffer()));
  let meta = await probe(file);
  assert.ok(meta.hasAudio && Math.abs(meta.durationSec - 10) < 0.2, JSON.stringify(meta));
  ok(`path A result: ${meta.durationSec.toFixed(2)} s with the original audio (ffprobe); test purchase recorded once`);

  // path B: straight to video, no preview used, no hidden picture
  const beforePreviews = (await a.json(`/api/drafts/${draftId}`)).previews.length;
  const v2 = await a.json(`/api/drafts/${draftId}/video`, { method: "POST", json: { mode: "direct", acceptAmountMinor: vp } }, 201);
  const v2b = await a.json(`/api/drafts/${draftId}/video`, { method: "POST", json: { mode: "direct", acceptAmountMinor: vp } }, 200);
  assert.equal(v2b.job.id, v2.job.id);
  res = await waitJob(v2.job.id);
  assert.equal(res.job.status, "ready", res.job.error);
  assert.equal(res.job.mode, "direct");
  assert.equal((await a.json(`/api/drafts/${draftId}`)).previews.length, beforePreviews, "no hidden preview generated");
  const file2 = join(await mkdtemp(join(tmpdir(), "memni-e2e-")), "b.mp4");
  await writeFile(file2, Buffer.from(await (await a.req(`/api/files/job/${v2.job.id}`)).arrayBuffer()));
  meta = await probe(file2);
  assert.ok(meta.hasAudio && Math.abs(meta.durationSec - 10) < 0.2);
  assert.equal((await a.req(`/api/files/jobscene/${v2.job.id}`)).status, 404, "direct job has no scene image");
  ok("path B (straight to video): one job, no hidden preview, original audio present");

  // ownership
  await b.json("/api/me");
  for (const path of [`/api/drafts/${draftId}`, `/api/jobs/${v1.job.id}`, `/api/files/job/${v1.job.id}`, `/api/files/photo/${up1.photo.id}`, `/api/files/preview/${p1.preview.id}`]) {
    assert.equal((await b.req(path)).status, 404, path);
  }
  assert.equal((await b.req(`/api/drafts/${draftId}/video`, { method: "POST", json: { mode: "direct", acceptAmountMinor: vp } })).status, 404);
  assert.equal((await b.req(`/api/people/${up1.personId}`, { method: "DELETE" })).status, 404);
  ok("another user gets 404 for draft, job, files, video start, people");

  // «Сделать ещё» with the same people
  const { id: soloId } = await a.json("/api/drafts", { method: "POST", json: { templateId: "hotel-lobby", fromDraftId: draftId } }, 201);
  d = await a.json(`/api/drafts/${soloId}`);
  assert.equal(d.roles[0].person.id, up1.personId);
  ok("«Сделать ещё»: people carried over");

  // failures give the free credit / the payment back
  await a.json("/api/demo", { method: "POST", json: { resetQuota: true, failPreview: true } });
  const fp = await a.json(`/api/drafts/${soloId}/previews`, { method: "POST", json: {} }, 202);
  d = await until(() => a.json(`/api/drafts/${soloId}`), (x) => x.previews.find((p: { id: string }) => p.id === fp.preview.id)?.status === "failed", "failed preview");
  assert.equal(d.quotes.preview.free, true, "a failed free preview does not use the offer");
  ok("failed preview: shown as an error, the free preview is restored");

  await a.json("/api/demo", { method: "POST", json: { failPreview: false, failVideo: true } });
  const fj = await a.json(`/api/drafts/${soloId}/video`, { method: "POST", json: { mode: "direct", acceptAmountMinor: (await a.json(`/api/drafts/${soloId}`)).quotes.video.price?.amountMinor ?? null } }, 201);
  res = await waitJob(fj.job.id);
  assert.equal(res.job.status, "failed");
  assert.equal(res.job.retryable, true);
  assert.equal(res.order.status, "test_paid", "retry is still covered by the payment");
  assert.doesNotMatch(res.job.error, /demo|kling|gemini|api/i);
  await a.json(`/api/jobs/${fj.job.id}/retry`, { method: "POST" });
  res = await waitJob(fj.job.id);
  assert.equal(res.job.status, "failed");
  assert.equal(res.job.retryable, false);
  assert.equal(res.order.status, "refunded", "attempts spent → payment returned");
  assert.equal((await a.req(`/api/jobs/${fj.job.id}/retry`, { method: "POST" })).status, 429);
  await a.json("/api/demo", { method: "POST", json: { failVideo: false } });
  ok(`video failure: «${res.job.error}»; free retry, then refund; no endless retries`);

  // deleting a saved person removes their files
  assert.equal((await a.req(`/api/files/photo/${up1.photo.id}`)).status, 200);
  await a.json(`/api/people/${up1.personId}`, { method: "DELETE" });
  assert.equal((await a.req(`/api/files/photo/${up1.photo.id}`)).status, 404);
  assert.equal((await a.json(`/api/drafts/${draftId}`)).roles[0].person, null);
  ok("person deleted from the library with their photos; their role is freed");

  console.log(`\nAll ${n} checks passed.`);
}

main().catch((e) => {
  console.error("\n✗ E2E failed:", e);
  process.exit(1);
});
