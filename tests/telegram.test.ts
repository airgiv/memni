import { test } from "node:test";
import assert from "node:assert/strict";
import { signInitData, verifyInitData } from "../src/lib/telegram/verify";

const TOKEN = "123456:TEST-token";
const now = Date.now();
const fields = { auth_date: String(Math.floor(now / 1000)), query_id: "AAH", user: JSON.stringify({ id: 42, first_name: "Саша" }) };

test("accepts correctly signed initData", () => {
  const r = verifyInitData(signInitData(fields, TOKEN), TOKEN, 3600, now);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.user.id, 42);
});
test("rejects tampered user data", () => {
  const signed = new URLSearchParams(signInitData(fields, TOKEN));
  signed.set("user", JSON.stringify({ id: 1, first_name: "Злоумышленник" }));
  assert.deepEqual(verifyInitData(signed.toString(), TOKEN, 3600, now), { ok: false, reason: "bad_hash" });
});
test("rejects another bot's signature, expired data and missing token", () => {
  assert.equal(verifyInitData(signInitData(fields, "other:token"), TOKEN, 3600, now).ok, false);
  assert.deepEqual(verifyInitData(signInitData(fields, TOKEN), TOKEN, 60, now + 3600_000), { ok: false, reason: "expired" });
  assert.deepEqual(verifyInitData(signInitData(fields, TOKEN), undefined, 60, now), { ok: false, reason: "no_token" });
});
