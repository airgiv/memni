import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSpec, renderScenePrompt, renderVideoDirectPrompt, renderVideoPrompt } from "../src/lib/domain/prompts";
import { normalizeLook } from "../src/lib/domain/draft";
import { hotel as t, photo } from "./fixtures";

const people = (opts: { body?: "full" | null; presentation?: "feminine" } = {}) =>
  t.roles.map((role, i) => ({
    role,
    look: normalizeLook(t, role.id, {
      outfit: { optionId: i === 0 ? "bathrobe" : "custom", text: i === 1 ? "white tennis outfit" : undefined },
      appearance: opts.presentation && i === 0 ? { mode: "adjusted", presentation: opts.presentation } : { mode: "photos" },
    }),
    photos: [photo(`p${i}`, 1, opts.body ?? null)],
  }));

test("the spec keeps role, references, appearance, outfit and constraints separate", () => {
  const spec = buildSpec(t, people(), "whole-person");
  assert.equal(spec.participants.length, 2);
  const [a, b] = spec.participants;
  assert.equal(a.outfit.presetId, "bathrobe");
  assert.ok(a.constraints.some((c) => /modest/.test(c)), "preset constraint travels with the choice");
  assert.equal(b.outfit.kind, "custom");
  assert.equal(b.outfit.text, "white tennis outfit");
  assert.equal(a.bodyReference, "unknown", "nothing checked → unknown, not 'fine'");
});

test("whole-person prompts ask for face, hair and build — and never invent proportions without a full-body reference", () => {
  const p = renderScenePrompt(t, buildSpec(t, people(), "whole-person"));
  assert.match(p, /face, hair, skin tone, visible body areas, silhouette and proportions/);
  assert.match(p, /do not invent proportions/);
  assert.match(p, /"white tennis outfit"/, "user text is quoted as data");
  const full = renderScenePrompt(t, buildSpec(t, people({ body: "full" }), "whole-person"));
  assert.doesNotMatch(full, /do not invent proportions/);
});

test("a face-only model is never asked to change the body or the outfit", () => {
  for (const render of [renderScenePrompt, renderVideoDirectPrompt]) {
    const p = render(t, buildSpec(t, people(), "face-only"));
    assert.match(p, /Only the face is replaced/);
    assert.doesNotMatch(p, /silhouette|Outfit:|bathrobe/);
  }
});

test("presentation appears only when the user chose it", () => {
  assert.doesNotMatch(renderScenePrompt(t, buildSpec(t, people(), "whole-person")), /presentation\./);
  assert.match(renderScenePrompt(t, buildSpec(t, people({ presentation: "feminine" }), "whole-person")), /The user asked for a feminine presentation/);
});

test("video prompts never ask the model to recreate the song", () => {
  for (const p of [renderVideoPrompt(t, buildSpec(t, people(), "whole-person")), renderVideoDirectPrompt(t, buildSpec(t, people(), "whole-person"))]) {
    assert.match(p, /Do not generate music or vocals/);
    assert.doesNotMatch(p, /\{\{/);
  }
});
