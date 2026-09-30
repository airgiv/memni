import { test } from "node:test";
import assert from "node:assert/strict";
import { assignPerson, reconcile, setLook, swapRoles, defaultLook } from "../src/lib/domain/draft";
import { getTemplate } from "../src/lib/templates";
import type { Draft, Person, Photo, Preview } from "../src/lib/domain/types";

const t = getTemplate("hotel-lobby")!;
const now = new Date().toISOString();
const person = (id: string): Person => ({ id, userId: "u", name: id, saved: true, mainPhotoId: `${id}-ph1`, createdAt: now, updatedAt: now });
const photo = (pid: string, n: number): Photo => ({ id: `${pid}-ph${n}`, userId: "u", personId: pid, storageKey: "k", mime: "image/jpeg", width: 1000, height: 1000, bytes: 1, createdAt: now });
const draft = (): Draft => ({ id: "d", userId: "u", templateId: t.id, templateVersion: t.version, version: 1, assignments: {}, scene: { optionId: "faithful" }, createdAt: now, updatedAt: now });

function ctx(previews: Preview[] = [], extraPhotos: Photo[] = []) {
  return {
    people: new Map([
      ["a", { person: person("a"), photos: [photo("a", 1), ...extraPhotos.filter((p) => p.personId === "a")] }],
      ["b", { person: person("b"), photos: [photo("b", 1)] }],
    ]),
    previews: new Map(previews.map((p) => [p.id, p])),
  };
}
const preview = (id: string, roleId: string, personId: string, fp: string): Preview => ({
  id, userId: "u", draftId: "d", kind: "person", roleId, personId, fingerprint: fp, draftVersion: 1, status: "ready", provider: "demo", isDemo: true, seq: 1, createdAt: now,
});

test("assigning a person who is already in another role swaps them", () => {
  let d = assignPerson(t, draft(), "mic-left", "a");
  d = assignPerson(t, d, "mic-right", "b");
  d = assignPerson(t, d, "mic-left", "b");
  assert.equal(d.assignments["mic-left"]?.personId, "b");
  assert.equal(d.assignments["mic-right"]?.personId, "a");
});

test("swap keeps looks with people and drops role-specific confirmations", () => {
  let d = assignPerson(t, draft(), "mic-left", "a");
  d = assignPerson(t, d, "mic-right", "b");
  d = setLook(t, d, "mic-left", { clothing: "template" });
  d.assignments["mic-left"]!.confirmedPreviewId = "p1";
  const s = swapRoles(t, d, "mic-left", "mic-right");
  assert.equal(s.assignments["mic-right"]?.personId, "a");
  assert.equal(s.assignments["mic-right"]?.look.clothing, "template");
  assert.equal(s.assignments["mic-right"]?.confirmedPreviewId, undefined);
});

test("confirmation survives only while inputs match; history variant revives when inputs return", () => {
  let d = assignPerson(t, draft(), "mic-left", "a");
  const fp = reconcile(t, d, ctx()).roleFingerprints["mic-left"]!;
  d.assignments["mic-left"]!.confirmedPreviewId = "p1";
  const c1 = ctx([preview("p1", "mic-left", "a", fp)]);
  assert.equal(reconcile(t, d, c1).draft.assignments["mic-left"]?.confirmedPreviewId, "p1");

  // a new photo changes the fingerprint → confirmation dropped
  const c2 = ctx([preview("p1", "mic-left", "a", fp)], [photo("a", 2)]);
  const r2 = reconcile(t, d, c2);
  assert.equal(r2.draft.assignments["mic-left"]?.confirmedPreviewId, undefined);
  assert.deepEqual(r2.cleared, [{ roleId: "mic-left" }]);

  // look change also changes it; returning to the old look gives the same fingerprint
  d = setLook(t, d, "mic-left", { clothing: "template" });
  const fp2 = reconcile(t, d, ctx()).roleFingerprints["mic-left"];
  assert.notEqual(fp2, fp);
  d = setLook(t, d, "mic-left", { clothing: defaultLook(t).clothing });
  assert.equal(reconcile(t, d, ctx()).roleFingerprints["mic-left"], fp);
});

test("scene confirmation needs every role confirmed and a matching scene fingerprint", () => {
  let d = assignPerson(t, draft(), "mic-left", "a");
  d = assignPerson(t, d, "mic-right", "b");
  const base = reconcile(t, d, ctx());
  const pl = preview("pl", "mic-left", "a", base.roleFingerprints["mic-left"]!);
  const pr = preview("pr", "mic-right", "b", base.roleFingerprints["mic-right"]!);
  d.assignments["mic-left"]!.confirmedPreviewId = "pl";
  d.assignments["mic-right"]!.confirmedPreviewId = "pr";
  const sceneFp = reconcile(t, d, ctx([pl, pr])).sceneFingerprint;
  const scene: Preview = { ...pl, id: "s", kind: "scene", roleId: undefined, personId: undefined, fingerprint: sceneFp };
  d.sceneConfirmedPreviewId = "s";
  assert.equal(reconcile(t, d, ctx([pl, pr, scene])).draft.sceneConfirmedPreviewId, "s");
  // scene option changes → scene confirmation removed, person confirmations stay
  d.scene = { optionId: "matching-outfits" };
  const r = reconcile(t, d, ctx([pl, pr, scene]));
  assert.equal(r.draft.sceneConfirmedPreviewId, undefined);
  assert.equal(r.draft.assignments["mic-left"]?.confirmedPreviewId, "pl");
});

test("a deleted person frees the role", () => {
  const d = assignPerson(t, draft(), "mic-left", "ghost");
  const r = reconcile(t, d, ctx());
  assert.equal(r.draft.assignments["mic-left"], undefined);
});

test("templates: stable unique role ids, regions inside the frame, single-role template exists", async () => {
  const { TEMPLATES } = await import("../src/lib/templates");
  assert.ok(TEMPLATES.some((x) => x.roles.length === 1));
  assert.ok(TEMPLATES.some((x) => x.roles.length === 3));
  for (const x of TEMPLATES) {
    assert.equal(new Set(x.roles.map((r) => r.id)).size, x.roles.length);
    for (const r of x.roles) {
      assert.ok(r.region.x >= 0 && r.region.y >= 0 && r.region.x + r.region.w <= 1 && r.region.y + r.region.h <= 1, `${x.id}/${r.id}`);
    }
    assert.ok(x.scene.options.some((o) => o.id === x.scene.defaultOption));
    assert.ok(x.look.clothingModes.includes(x.look.defaultClothing));
    assert.equal(x.media.audio.endSec - x.media.audio.startSec, x.durationSec);
  }
});
