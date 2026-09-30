import { test } from "node:test";
import assert from "node:assert/strict";
import { assignPerson, reconcile, setLook, swapRoles, rolesReady } from "../src/lib/domain/draft";
import { getTemplate, TEMPLATES } from "../src/lib/templates";
import type { Draft, Person, Photo } from "../src/lib/domain/types";

const t = getTemplate("hotel-lobby")!;
const now = new Date().toISOString();
const person = (id: string): Person => ({ id, userId: "u", name: id, saved: true, mainPhotoId: `${id}-ph1`, createdAt: now, updatedAt: now });
const photo = (pid: string, n: number): Photo => ({ id: `${pid}-ph${n}`, userId: "u", personId: pid, storageKey: "k", mime: "image/jpeg", width: 1000, height: 1000, bytes: 1, createdAt: now });
const draft = (): Draft => ({ id: "d", userId: "u", templateId: t.id, templateVersion: t.version, version: 1, assignments: {}, scene: { optionId: "faithful" }, createdAt: now, updatedAt: now });
const ctx = (extra: Photo[] = []) => ({
  people: new Map([
    ["a", { person: person("a"), photos: [photo("a", 1), ...extra] }],
    ["b", { person: person("b"), photos: [photo("b", 1)] }],
  ]),
  previews: new Map(),
});

test("assigning a person who is already in another role swaps them", () => {
  let d = assignPerson(t, draft(), "mic-left", "a");
  d = assignPerson(t, d, "mic-right", "b");
  d = assignPerson(t, d, "mic-left", "b");
  assert.equal(d.assignments["mic-left"]?.personId, "b");
  assert.equal(d.assignments["mic-right"]?.personId, "a");
});

test("the look belongs to the order, travels with the person on swap", () => {
  let d = assignPerson(t, draft(), "mic-left", "a");
  d = assignPerson(t, d, "mic-right", "b");
  assert.equal(d.assignments["mic-left"]?.look.clothing, "template", "sensible default");
  d = setLook(t, d, "mic-left", { clothing: "preset", presetId: "robe" });
  const s = swapRoles(t, d, "mic-left", "mic-right");
  assert.equal(s.assignments["mic-right"]?.look.presetId, "robe");
});

test("inputs fingerprint: changes with photos/looks/roles, returns when inputs return", () => {
  let d = assignPerson(t, draft(), "mic-left", "a");
  d = assignPerson(t, d, "mic-right", "b");
  const fp0 = reconcile(t, d, ctx()).inputsFingerprint;
  assert.notEqual(reconcile(t, d, ctx([photo("a", 2)])).inputsFingerprint, fp0, "new photo");
  const looked = setLook(t, d, "mic-left", { clothing: "photo" });
  assert.notEqual(reconcile(t, looked, ctx()).inputsFingerprint, fp0, "new look");
  assert.notEqual(reconcile(t, swapRoles(t, d, "mic-left", "mic-right"), ctx()).inputsFingerprint, fp0, "swapped roles");
  assert.equal(reconcile(t, setLook(t, looked, "mic-left", { clothing: "template" }), ctx()).inputsFingerprint, fp0, "back to the same inputs");
});

test("readiness needs a photo for every role; a deleted person frees the role", () => {
  let d = assignPerson(t, draft(), "mic-left", "a");
  assert.equal(rolesReady(t, d, ctx().people), false);
  d = assignPerson(t, d, "mic-right", "b");
  assert.equal(rolesReady(t, d, ctx().people), true);
  const r = reconcile(t, assignPerson(t, draft(), "mic-left", "ghost"), ctx());
  assert.equal(r.draft.assignments["mic-left"], undefined);
  assert.deepEqual(r.cleared, ["mic-left"]);
});

test("templates: stable role ids, regions inside the frame, a cutout per role, 1/2/3-role templates", () => {
  assert.deepEqual(TEMPLATES.map((x) => x.roles.length).sort(), [1, 2, 3]);
  for (const x of TEMPLATES) {
    assert.equal(new Set(x.roles.map((r) => r.id)).size, x.roles.length);
    for (const r of x.roles) {
      assert.ok(r.region.x >= 0 && r.region.y >= 0 && r.region.x + r.region.w <= 1 && r.region.y + r.region.h <= 1, `${x.id}/${r.id}`);
      assert.match(r.cutout.src, new RegExp(`^/templates/${x.id}/roles/${r.id}\\.jpg$`));
      assert.ok(r.cutout.atSec >= x.media.source.startSec && r.cutout.atSec <= x.media.source.endSec);
    }
    assert.ok(x.look.clothingModes.includes(x.look.defaultClothing));
    assert.equal(x.media.audio.endSec - x.media.audio.startSec, x.durationSec);
  }
});
