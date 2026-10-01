import { test } from "node:test";
import assert from "node:assert/strict";
import { assignPerson, normalizeLook, reconcile, rolesReady, setLook, swapRoles } from "../src/lib/domain/draft";
import { MEMES } from "../src/memes";
import { draft, hotel as t, person, photo, withRoles } from "./fixtures";
import type { Photo } from "../src/lib/domain/types";

const ctx = (extra: Photo[] = []) => ({
  people: new Map([
    ["a", { person: person("a"), photos: [photo("a", 1), ...extra] }],
    ["b", { person: person("b"), photos: [photo("b", 1)] }],
  ]),
  previews: new Map(),
});
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

test("assigning a person who is already in another role swaps them", () => {
  let d = assignPerson(t, draft(), "left", "a");
  d = assignPerson(t, d, "right", "b");
  d = assignPerson(t, d, "left", "b");
  assert.equal(d.assignments["left"]?.personId, "b");
  assert.equal(d.assignments["right"]?.personId, "a");
});

test("default look: the role's default outfit and appearance from photos; the look travels with the person", () => {
  let d = assignPerson(t, draft(), "left", "a");
  d = assignPerson(t, d, "right", "b");
  assert.deepEqual(d.assignments["left"]?.look, { outfit: { optionId: "original" }, appearance: { mode: "photos" } });
  d = setLook(t, d, "left", { outfit: { optionId: "bathrobe" } });
  const s = swapRoles(t, d, "left", "right");
  assert.equal(s.assignments["right"]?.look.outfit.optionId, "bathrobe");
});

test("a random outfit is drawn once, stored, and only redrawn on an explicit request", () => {
  let d = assignPerson(t, draft(), "left", "a");
  d = setLook(t, d, "left", { outfit: { optionId: "random" } }, seq(0));
  const first = d.assignments["left"]!.look.outfit.resolvedPresetId;
  assert.ok(first && ["bathrobe", "suit", "tracksuit"].includes(first));
  // touching other settings, reconciling or re-selecting random keeps the draw
  d = setLook(t, d, "left", { appearance: { mode: "adjusted", presentation: "neutral" } }, seq(0.99));
  d = setLook(t, d, "left", { outfit: { optionId: "random" } }, seq(0.99));
  d = reconcile(t, d, ctx()).draft;
  assert.equal(d.assignments["left"]!.look.outfit.resolvedPresetId, first);
  // explicit "draw again" changes it (never to the same preset)
  const again = setLook(t, d, "left", { outfit: { optionId: "random" }, reroll: true }, seq(0)).assignments["left"]!.look.outfit.resolvedPresetId;
  assert.notEqual(again, first);
});

test("looks are validated: unknown options fall back, user text is sanitised, old looks migrate", () => {
  assert.equal(normalizeLook(t, "left", { outfit: { optionId: "spacesuit" } }).outfit.optionId, "original");
  const custom = normalizeLook(t, "left", { outfit: { optionId: "custom", text: 'a "red"\n<suit> {{x}}' } });
  assert.equal(custom.outfit.text, "a red suit x");
  assert.deepEqual(normalizeLook(t, "left", { appearance: { mode: "adjusted", presentation: "robot" as never, description: "  curly\nhair " } }).appearance, {
    mode: "adjusted",
    presentation: undefined,
    description: "curly hair",
  });
  assert.equal(normalizeLook(t, "left", { clothing: "template" } as never).outfit.optionId, "original");
  assert.equal(normalizeLook(t, "left", { clothing: "photo" } as never).outfit.optionId, "photos");
});

test("inputs fingerprint: changes with photos, outfit, appearance and roles; returns when inputs return", () => {
  let d = assignPerson(t, draft(), "left", "a");
  d = assignPerson(t, d, "right", "b");
  const fp0 = reconcile(t, d, ctx()).inputsFingerprint;
  assert.notEqual(reconcile(t, d, ctx([photo("a", 2)])).inputsFingerprint, fp0, "new photo");
  const robe = setLook(t, d, "left", { outfit: { optionId: "bathrobe" } });
  assert.notEqual(reconcile(t, robe, ctx()).inputsFingerprint, fp0, "new outfit");
  const adjusted = setLook(t, d, "left", { appearance: { mode: "adjusted", presentation: "feminine" } });
  assert.notEqual(reconcile(t, adjusted, ctx()).inputsFingerprint, fp0, "appearance preference");
  assert.notEqual(reconcile(t, swapRoles(t, d, "left", "right"), ctx()).inputsFingerprint, fp0, "swapped roles");
  assert.equal(reconcile(t, setLook(t, robe, "left", { outfit: { optionId: "original" } }), ctx()).inputsFingerprint, fp0, "back to the same inputs");
});

test("readiness needs a photo for every role; a deleted person frees the role", () => {
  let d = assignPerson(t, draft(), "left", "a");
  assert.equal(rolesReady(t, d, ctx().people), false);
  d = assignPerson(t, d, "right", "b");
  assert.equal(rolesReady(t, d, ctx().people), true);
  const r = reconcile(t, assignPerson(t, draft(), "left", "ghost"), ctx());
  assert.equal(r.draft.assignments["left"], undefined);
  assert.deepEqual(r.cleared, ["left"]);
});

test("the participant count comes from configuration (1, 2 and 3 roles)", () => {
  for (const n of [1, 2, 3]) {
    const m = withRoles(n);
    const people = new Map(m.roles.map((_, i) => [`p${i}`, { person: person(`p${i}`), photos: [photo(`p${i}`, 1)] }]));
    let d = draft(m);
    m.roles.forEach((r, i) => {
      assert.equal(rolesReady(m, d, people), false);
      d = assignPerson(m, d, r.id, `p${i}`);
    });
    assert.equal(rolesReady(m, d, people), true, `${n} roles`);
  }
});

test("meme configs: stable ids, regions inside the frame, outfits exist, defaults allowed", () => {
  for (const x of MEMES) {
    assert.equal(new Set(x.roles.map((r) => r.id)).size, x.roles.length);
    for (const r of x.roles) {
      for (const reg of [r.region, r.face.region]) assert.ok(reg.x >= 0 && reg.y >= 0 && reg.x + reg.w <= 1 && reg.y + reg.h <= 1, `${x.id}/${r.id}`);
      assert.ok(r.outfits.includes(r.defaultOutfit));
      for (const o of r.outfits) assert.ok(x.outfits.some((d) => d.id === o), `${x.id}/${r.id}/${o}`);
      assert.ok(r.cutout.atSec >= x.media.source.startSec && r.cutout.atSec <= x.media.source.endSec);
    }
    for (const o of x.outfits.filter((o) => o.kind === "random")) assert.ok(o.pool!.every((p) => x.outfits.find((d) => d.id === p)?.kind === "preset"));
    assert.equal(x.media.audio.endSec - x.media.audio.startSec, x.durationSec);
    // every translation names every role and outfit
    for (const c of Object.values(x.content)) {
      for (const r of x.roles) assert.ok(c!.roles[r.id]?.name, `${x.id} role label ${r.id}`);
      for (const o of x.outfits) assert.ok(c!.outfits[o.id], `${x.id} outfit label ${o.id}`);
      for (const s of c!.sections) for (const id of s.sources ?? []) assert.ok(x.sources.some((src) => src.id === id), `source ${id}`);
    }
  }
});
