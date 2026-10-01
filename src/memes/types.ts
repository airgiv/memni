/**
 * A meme is one configuration object. The landing page, the participant
 * editor, prompt assembly, the worker, SEO metadata and the sitemap all read
 * it — adding a meme means adding a config (and its media), never copying
 * page components.
 *
 * Roles are marked once by hand on a reference frame while the meme is
 * prepared; nothing is detected per user.
 */
import type { LocaleCode } from "@/i18n/locales";

/** Normalised rectangle on the reference frame (0..1 of width/height). */
export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Point of interest in the video, 0..1. The stage keeps it in view when the video is cropped (cover). */
export interface FocalPoint {
  x: number;
  y: number;
}

export interface MediaRef {
  /** Path under /public or an absolute URL of the prepared asset */
  src: string;
}

/* ── outfits ───────────────────────────────────────────────────────── */

export type OutfitKind =
  /** what this performer wears in the original video */
  | "original"
  /** the clothes visible in the user's own photos */
  | "photos"
  /** one preset drawn at random from `pool` — resolved once and stored */
  | "random"
  /** a fixed meme-specific preset (bathrobe, suit…) */
  | "preset"
  /** user-written description; revealed as a text field only when chosen */
  | "custom";

export interface OutfitDef {
  /** Stable id: stored in drafts and jobs */
  id: string;
  kind: OutfitKind;
  /** Server-only prompt fragment ("a white terry hotel bathrobe"). Not used for random/custom. */
  prompt?: string;
  /** random only: preset ids it may resolve to */
  pool?: string[];
  /**
   * Server-only constraints that travel with this choice into every request
   * ("keep the outfit modest and fully covering"). Stored separately from the
   * description so the generation spec can reason about them.
   */
  constraints?: string[];
}

/* ── roles ─────────────────────────────────────────────────────────── */

export interface MemeRole {
  /** Stable id: stored in drafts, prompts and jobs. Never rename after launch. */
  id: string;
  /** Where this person stands on the reference frame */
  region: Region;
  /** Circular face crop from the original video — participant thumbnails */
  face: MediaRef & { region: Region };
  /** 3:4 portrait from the original — «you are replacing this person» */
  cutout: MediaRef & { atSec: number };
  /** Where the stage centres the video while this participant is edited (phones crop 16:9 hard) */
  focal: FocalPoint;
  /** Outfit options offered for this participant, in menu order (ids from `outfits`) */
  outfits: string[];
  defaultOutfit: string;
  /** Server-only: who this is in the scene, for prompts */
  prompt: string;
}

/* ── localized content ─────────────────────────────────────────────── */

export interface EditorialSection {
  /** stable anchor */
  id: "what" | "origin" | "music" | "popularity" | "how" | string;
  heading: string;
  paragraphs: string[];
  /** ids from MemeDef.sources backing the facts in this section */
  sources?: string[];
}

export interface MemeContent {
  /** Localized slug: /{locale}/memes/{slug} */
  slug: string;
  title: string;
  /** One supporting line in the collapsed sheet */
  tagline: string;
  seo: { title: string; description: string };
  /** Shown in the catalog card */
  summary: string;
  roles: Record<string, { name: string; hint: string }>;
  outfits: Record<string, string>;
  sections: EditorialSection[];
  faq: { q: string; a: string }[];
  /**
   * Who wrote / reviewed this translation. Only "reviewed" content is
   * published (routes, sitemap, hreflang); "draft" exists but is not served.
   */
  review: { status: "reviewed" | "draft"; note?: string };
}

export interface SourceRef {
  id: string;
  title: string;
  publisher: string;
  url: string;
  /** ISO date of the publication, when known */
  date?: string;
}

/* ── the meme ──────────────────────────────────────────────────────── */

export interface MemeDef {
  id: string;
  /** Bump whenever roles, media or prompts change; drafts pin the version they were made with. */
  version: number;
  /** The meme's primary language (its local-market version). English is the product default, not necessarily the meme's. */
  defaultLocale: LocaleCode;
  /** ISO 3166 country codes or "global" — where the meme is relevant. Not the billing country. */
  markets: string[];
  content: Partial<Record<LocaleCode, MemeContent>>;
  sources: SourceRef[];
  /** ids of related memes (only real, configured ones) */
  related: string[];
  /** ISO date the page content was last reviewed — sitemap lastmod */
  updatedAt: string;

  durationSec: number;
  /** Width:height of the video and of every image in the pipeline */
  aspectRatio: "9:16" | "16:9" | "1:1" | "4:5";
  media: {
    /** The original fragment with its sound — the landing background; `webm` is an optional VP9/Opus rendition */
    video: MediaRef & { webm?: string };
    poster: MediaRef & { width: number; height: number };
    /** Motion and timing for the video model (no sound needed) */
    source: MediaRef & { startSec: number; endSec: number };
    /** The original audio with exact bounds — attached by our worker, never recreated by a model */
    audio: MediaRef & { startSec: number; endSec: number };
    /** Still on which roles are marked */
    referenceFrame: MediaRef & { width: number; height: number; atSec: number };
    /** Where the stage centres the video on phones and on desktop */
    focal: { mobile: FocalPoint; desktop: FocalPoint };
    /** true → media are drawn placeholders, the UI says so */
    placeholder: boolean;
  };
  /** Note for maintainers: where the licensed media come from */
  mediaNote: string;

  roles: MemeRole[];
  outfits: OutfitDef[];

  photos: {
    minPhotos: number;
    maxPhotos: number;
    minSidePx: number;
    acceptedTypes: string[];
  };

  generation: {
    /** Versioned prompt set; a job records which one produced it */
    promptVersion: string;
    /** Server-only prompt templates; {{placeholders}} are filled from the structured generation spec */
    prompts: {
      scene: string;
      preview: string;
      video: string;
      videoDirect: string;
    };
    video: { needsMotionReference: boolean; needsImageReference: boolean };
    klingCharacterOrientation?: "image" | "video";
  };

  /** Optional per-meme video price override, by currency (minor units). Defaults come from commerce config. */
  priceOverride?: Partial<Record<string, number>>;
}
