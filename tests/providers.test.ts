import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { klingJwt } from "../src/lib/providers/video/kling";
import { planVideoInputs, replacementScope, type VideoCapabilities } from "../src/lib/providers/video/types";
import { hotel, withRoles } from "./fixtures";

test("Kling JWT: HS256 with iss/exp/nbf, verifiable with the secret", () => {
  const jwt = klingJwt("AK", "SK", 1_000_000);
  const [h, p, s] = jwt.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(h, "base64url").toString()), { alg: "HS256", typ: "JWT" });
  assert.deepEqual(JSON.parse(Buffer.from(p, "base64url").toString()), { iss: "AK", exp: 1_001_800, nbf: 999_995 });
  assert.equal(createHmac("sha256", "SK").update(`${h}.${p}`).digest("base64url"), s);
});

test("both video paths are planned against what the provider supports", () => {
  const kling: VideoCapabilities = { motionReference: true, imageReference: true, perPersonReferences: false, withoutPreview: "single-person", maxReferenceImages: 1, needsPublicUrls: true, maxDurationSec: 30, replaces: "whole-person" };
  const frameMaker = { scene: () => undefined };
  assert.deepEqual(planVideoInputs(hotel, kling, "preview"), { ok: true });
  // two people, one character image: the backend prepares an internal reference frame
  assert.deepEqual(planVideoInputs(hotel, kling, "direct", frameMaker), { ok: true, internalFrame: true });
  assert.deepEqual(planVideoInputs(hotel, kling, "direct"), { ok: false, problem: "no_direct" }, "no image model → reported, not faked");
  assert.deepEqual(planVideoInputs(withRoles(1), kling, "direct", frameMaker), { ok: true }, "one-person meme: the photo is the character image");
  assert.deepEqual(planVideoInputs(hotel, { ...kling, withoutPreview: "any" }, "direct", frameMaker), { ok: true });
  assert.deepEqual(planVideoInputs(hotel, { ...kling, motionReference: false }, "preview"), { ok: false, problem: "no_motion" });
});

test("replacement scope is the weakest link of the chain", () => {
  assert.equal(replacementScope({ replaces: "whole-person" }, { replaces: "whole-person" }), "whole-person");
  assert.equal(replacementScope({ replaces: "face-only" }, { replaces: "whole-person" }), "face-only");
  assert.equal(replacementScope({ replaces: "whole-person" }, { replaces: "face-only" }), "face-only");
});
