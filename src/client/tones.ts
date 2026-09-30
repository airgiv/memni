import type { RoleTone } from "@/lib/templates/types";

export const TONE_VAR: Record<RoleTone, string> = {
  flame: "var(--rap-flame)",
  blue: "var(--rap-blue)",
  plum: "var(--rap-plum)",
  acid: "var(--rap-acid)",
  bubble: "var(--rap-bubble)",
  sky: "var(--rap-sky)",
};
/** text colour that reads on the tone */
export const TONE_INK: Record<RoleTone, string> = {
  flame: "#fff",
  blue: "#fff",
  plum: "#fff",
  acid: "#282828",
  bubble: "#282828",
  sky: "#282828",
};
