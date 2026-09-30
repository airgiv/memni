/**
 * A meme template is prepared once, by hand, before it goes live: roles are
 * marked on a reference frame and never detected per user. Everything the
 * constructor, the prompt builder and the worker need lives here.
 */

export type RoleTone = "flame" | "blue" | "plum" | "acid" | "bubble" | "sky";

/** Normalised rectangle on the reference frame (0..1 of width/height). */
export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TemplateRole {
  /** Stable id: stored in drafts, prompts and jobs. Never rename after launch. */
  id: string;
  /** Short name on the role card: «Слева у микрофона» */
  name: string;
  /** Question shown while assigning: «Кто будет у микрофона слева?» */
  question: string;
  description: string;
  region: Region;
  tone: RoleTone;
  /**
   * The person as they appear in the source video — cut out once while the
   * template is prepared (scripts/make-demo-media.ts), shown on the «replace
   * this person» step. `atSec` is the moment where this person is clearly visible.
   */
  cutout: { src: string; atSec: number };
  /** Server-side prompt fragment (English) describing this role in the scene. */
  promptRole: string;
}

export interface ClothingPreset {
  id: string;
  label: string;
  description: string;
  /** Server-side prompt fragment. */
  prompt: string;
}

export type ClothingMode = "photo" | "template" | "preset";

export interface SceneOption {
  id: string;
  label: string;
  description: string;
  /** Server-side prompt fragment for the scene image and the video. */
  prompt: string;
  /** If true the option changes clothing — person looks are overridden by the scene. */
  overridesClothing?: boolean;
}

export interface MediaRef {
  /** Path under /public (demo) or an absolute URL of the prepared asset. */
  src: string;
}

export interface Price {
  amountMinor: number;
  currency: "RUB" | "XTR";
  /** true → the UI must say it is only an example price */
  isExample: boolean;
}

export interface TemplateDef {
  id: string;
  /** Bump whenever roles, media or prompts change; drafts pin the version they were made with. */
  version: number;
  /** "main" templates are the product; "demo" ones only show that any role count works. */
  kind: "main" | "demo";
  title: string;
  description: string;
  /** Materials are placeholders drawn by us — the UI labels them «демо-материал». */
  demoMaterials: boolean;
  /** Where real materials go when they exist (shown in README / admin notes, not to users). */
  materialsNote: string;

  durationSec: number;
  /** Width:height of the video and of every image in the pipeline. */
  aspectRatio: "9:16" | "16:9" | "1:1" | "4:5";
  media: {
    /** A finished example with sound — played on tap in the catalog. */
    example: MediaRef & { poster: string };
    /** Source clip for motion and timing (no need for sound). */
    source: MediaRef & { startSec: number; endSec: number };
    /** Original audio track with exact bounds inside the file. */
    audio: MediaRef & { startSec: number; endSec: number };
    /** Still reference frame on which roles are marked. */
    referenceFrame: MediaRef & { width: number; height: number; atSec: number };
  };

  roles: TemplateRole[];

  photoRequirements: {
    minPhotos: number;
    recommendedPhotos: number;
    maxPhotos: number;
    minSidePx: number;
    acceptedTypes: string[];
    /** Short, template-specific tips shown next to the upload area. */
    tips: string[];
  };

  look: {
    clothingModes: ClothingMode[];
    defaultClothing: ClothingMode;
    /** What «одежда шаблона» means in words, for the user and for the prompt. */
    templateOutfit: { label: string; prompt: string };
    presets: ClothingPreset[];
    /** Optional block: glasses on/off as in the photo. */
    glassesOption: boolean;
    /** Voluntary appearance note, never inferred. */
    appearanceNoteMaxLength: number;
  };

  scene: {
    options: SceneOption[];
    defaultOption: string;
  };

  pipeline: {
    /** Versioned prompt set id, see lib/domain/prompts.ts */
    promptVersion: string;
    /** Inputs this scenario needs from the video model. */
    video: {
      needsMotionReference: boolean;
      needsImageReference: boolean;
      wantsPerPersonReferences: boolean;
    };
  };

  provider: {
    /** Kling motion-control: which side the character faces in the source (see provider docs). */
    klingCharacterOrientation?: "image" | "video";
    maxVideoDurationSec: number;
  };

  price: Price | null;
}
