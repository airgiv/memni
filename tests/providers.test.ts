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

test("both video paths are checked against what the provider supports", () => {
  const t2 = getTemplate("hotel-lobby")!;
  const t1 = getTemplate("morning-show")!;
  const kling = { motionReference: true, imageReference: true, perPersonReferences: false, withoutPreview: "single-person" as const, maxReferenceImages: 1, needsPublicUrls: true, maxDurationSec: 30 };
  assert.equal(planVideoInputs(t2, kling, "preview").ok, true);
  const direct2 = planVideoInputs(t2, kling, "direct");
  assert.equal(direct2.ok, false, "one character image cannot carry two people without a prepared picture");
  assert.match(direct2.problem!, /без превью/);
  assert.equal(planVideoInputs(t1, kling, "direct").ok, true, "one-person meme: the photo is the character image");
  assert.equal(planVideoInputs(t2, { ...kling, withoutPreview: "any" }, "direct").ok, true);
  assert.equal(planVideoInputs(t2, { ...kling, motionReference: false }, "preview").ok, false);
});
