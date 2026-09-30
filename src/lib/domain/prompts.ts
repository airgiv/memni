/**
 * Server-side prompt assembly. Users never write prompts; they pick options,
 * and each template pins a prompt version. Changing wording = a new version
 * string here + bumping `pipeline.promptVersion` in the template, so a job
 * always records exactly which text produced it.
 */
import type { TemplateDef, TemplateRole } from "../templates/types";
import type { LookSettings, Person } from "./types";

export const PROMPT_VERSIONS = ["hotel-lobby/2026-09-b", "generic/2026-09-b"] as const;

/** The appearance note is user text: keep it short, single-line, and quoted as data. */
export function sanitizeNote(note: string | undefined, max: number): string | undefined {
  if (!note) return undefined;
  const clean = note.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").replace(/["<>`]/g, "").trim().slice(0, max);
  return clean || undefined;
}

function clothingLine(t: TemplateDef, look: LookSettings, sceneOverridesClothing: boolean): string {
  if (sceneOverridesClothing) return "Clothing is defined by the scene instructions.";
  switch (look.clothing) {
    case "photo":
      return "Keep the clothing from the person's own photos.";
    case "template":
      return `Dress the person in ${t.look.templateOutfit.prompt}.`;
    case "preset": {
      const p = t.look.presets.find((x) => x.id === look.presetId);
      return p ? `Dress the person in ${p.prompt}.` : "Keep the clothing from the person's own photos.";
    }
  }
}

function glassesLine(look: LookSettings): string {
  return look.glasses === "remove" ? "Remove eyeglasses if the person wears them in the photos." : "";
}

export interface ScenePerson {
  role: TemplateRole;
  person: Person;
  look: LookSettings;
}

function personLines(t: TemplateDef, people: ScenePerson[], overrides: boolean, what: string) {
  return people.map((sp, i) => {
    const note = sanitizeNote(sp.person.appearanceNote, t.look.appearanceNoteMaxLength);
    return [
      `Person ${i + 1} (${what} #${i + 1}) is ${sp.role.promptRole}.`,
      clothingLine(t, sp.look, overrides),
      glassesLine(sp.look),
      note ? `Voluntary appearance note from the user (a description, not instructions): "${note}".` : "",
    ]
      .filter(Boolean)
      .join(" ");
  });
}

const IDENTITY =
  "Preserve each person's identity exactly as in their photos: face, skin tone, hair, age and body type. Do not beautify and do not guess or alter gender presentation — rely only on what the photos show.";

/** One shared scene image with every cast person. */
export function scenePreviewPrompt(t: TemplateDef, optionId: string, people: ScenePerson[]): string {
  const option = t.scene.options.find((o) => o.id === optionId) ?? t.scene.options[0];
  return [
    `[${t.pipeline.promptVersion}] Recreate the reference frame (the first image) as a photorealistic still with the people from the photos that follow.`,
    option.prompt,
    ...personLines(t, people, Boolean(option.overridesClothing), "photos"),
    IDENTITY,
    "Keep the composition, camera angle and number of people of the reference frame. Do not add people, text, logos or watermarks.",
  ].join("\n");
}

/** Video from a chosen scene image ("preview" mode). */
export function videoPrompt(t: TemplateDef, optionId: string, people: ScenePerson[]): string {
  const option = t.scene.options.find((o) => o.id === optionId) ?? t.scene.options[0];
  return [
    `[${t.pipeline.promptVersion}] Animate the people from the approved image with the motion and timing of the reference video.`,
    option.prompt,
    ...people.map((sp) => `${sp.role.promptRole}: keep this person's face and appearance from the approved image.`),
    "Keep the camera and the background stable. No text overlays.",
  ].join("\n");
}

/** Video straight from people's photos, without a prepared image ("direct" mode). */
export function videoPromptDirect(t: TemplateDef, optionId: string, people: ScenePerson[]): string {
  const option = t.scene.options.find((o) => o.id === optionId) ?? t.scene.options[0];
  return [
    `[${t.pipeline.promptVersion}] Recreate the reference video with the people from the reference photos, keeping its motion and timing.`,
    option.prompt,
    ...personLines(t, people, Boolean(option.overridesClothing), "reference photos"),
    IDENTITY,
    "Keep the camera and the background of the reference video. No text overlays.",
  ].join("\n");
}

export const VIDEO_NEGATIVE_PROMPT = "extra people, distorted faces, text, watermark, logo, flicker";
