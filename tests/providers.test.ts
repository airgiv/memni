import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { klingJwt } from "../src/lib/providers/video/kling";
import { planVideoInputs } from "../src/lib/providers/video/types";
import { getTemplate } from "../src/lib/templates";

test("Kling JWT: HS256 with iss/exp/nbf, verifiable with the secret", () => {
  const jwt = klingJwt("AK", "SK", 1_000_000);
  const [h, p, s] = jwt.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(h, "base64url").toString()), { alg: "HS256", typ: "JWT" });
  assert.deepEqual(JSON.parse(Buffer.from(p, "base64url").toString()), { iss: "AK", exp: 1_001_800, nbf: 999_995 });
  assert.equal(createHmac("sha256", "SK").update(`${h}.${p}`).digest("base64url"), s);
});

test("only supported inputs are passed; missing required input is reported", () => {
  const t = getTemplate("hotel-lobby")!;
  const single = { motionReference: true, imageReference: true, perPersonReferences: false, maxReferenceImages: 1, needsPublicUrls: true, maxDurationSec: 30 };
  const plan = planVideoInputs(t, single, "Kling");
  assert.equal(plan.ok, true);
  assert.ok(plan.notPassed.some((x) => x.includes("отдельные фото")));
  const noMotion = planVideoInputs(t, { ...single, motionReference: false }, "X");
  assert.equal(noMotion.ok, false);
  assert.match(noMotion.problem!, /исходный ролик/);
});
