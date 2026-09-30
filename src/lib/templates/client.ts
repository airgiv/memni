import type { TemplateDef } from "./types";

/** Template data for the browser: everything except server-side prompt text. */
export function clientTemplate(t: TemplateDef) {
  return {
    id: t.id,
    version: t.version,
    kind: t.kind,
    title: t.title,
    description: t.description,
    demoMaterials: t.demoMaterials,
    durationSec: t.durationSec,
    aspectRatio: t.aspectRatio,
    media: {
      example: t.media.example,
      referenceFrame: t.media.referenceFrame,
      audio: { startSec: t.media.audio.startSec, endSec: t.media.audio.endSec },
    },
    roles: t.roles.map(({ promptRole, ...r }) => (void promptRole, r)),
    photoRequirements: t.photoRequirements,
    look: {
      clothingModes: t.look.clothingModes,
      defaultClothing: t.look.defaultClothing,
      templateOutfit: { label: t.look.templateOutfit.label },
      presets: t.look.presets.map(({ prompt, ...p }) => (void prompt, p)),
      glassesOption: t.look.glassesOption,
      appearanceNoteMaxLength: t.look.appearanceNoteMaxLength,
    },
    scene: {
      options: t.scene.options.map(({ prompt, ...o }) => (void prompt, o)),
      defaultOption: t.scene.defaultOption,
    },
    price: t.price,
  };
}
export type ClientTemplate = ReturnType<typeof clientTemplate>;
export type ClientRole = ClientTemplate["roles"][number];
