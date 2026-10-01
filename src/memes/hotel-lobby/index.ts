/**
 * Hotel Lobby — built on the real source video supplied by the product owner.
 * The licensed file is not committed: `npm run media:import -- <file>` cuts
 * the fragment below into public/templates/hotel-lobby/ (gitignored) together
 * with the reference frame, the portrait cutouts and the face crops.
 */
import type { MemeDef } from "../types";
import { en } from "./content.en";
import { ru } from "./content.ru";

/** Seconds inside the original upload: one continuous shot with both performers. */
export const HOTEL_LOBBY_FRAGMENT = { startSec: 60.5, endSec: 70.5 };

const BASE = "/templates/hotel-lobby";

export const hotelLobby: MemeDef = {
  id: "hotel-lobby",
  version: 3,
  defaultLocale: "en",
  markets: ["global"],
  content: { en, ru },
  updatedAt: "2026-10-01",
  related: [],
  sources: [
    {
      id: "colors-video",
      title: "Quavo & Takeoff – HOTEL LOBBY | A COLORS SHOW",
      publisher: "COLORSxSTUDIOS on YouTube",
      url: "https://www.youtube.com/watch?v=x9yop0nYR9g",
      date: "2022-06-17",
    },
    { id: "wiki-song", title: "Hotel Lobby (Unc & Phew)", publisher: "Wikipedia", url: "https://en.wikipedia.org/wiki/Hotel_Lobby_(Unc_%26_Phew)" },
    { id: "wiki-album", title: "Only Built for Infinity Links", publisher: "Wikipedia", url: "https://en.wikipedia.org/wiki/Only_Built_for_Infinity_Links" },
    { id: "wiki-duo", title: "Unc & Phew", publisher: "Wikipedia", url: "https://en.wikipedia.org/wiki/Unc_%26_Phew" },
    { id: "wiki-colors", title: "ColorsxStudios", publisher: "Wikipedia", url: "https://en.wikipedia.org/wiki/ColorsxStudios" },
    { id: "kym", title: "Quavo “Hotel Lobby” AI Trend", publisher: "Know Your Meme", url: "https://knowyourmeme.com/memes/quavo-hotel-lobby-ai-trend" },
    {
      id: "source-repost",
      title: "Quavo Brings Fans Back Original “Hotel Lobby” Performance With Takeoff as AI Trend Spreads",
      publisher: "The Source",
      url: "https://thesource.com/2026/09/24/quavo-brings-fans-back-original-hotel-lobby-performance-with-takeoff-as-ai-trend-spreads/",
      date: "2026-09-24",
    },
    {
      id: "source-streams",
      title: "Quavo and Takeoff’s “Hotel Lobby” COLORS Performance Jumps 540% in Streams",
      publisher: "The Source",
      url: "https://thesource.com/2026/09/30/quavo-takeoff-hotel-lobby-colors-streaming-surge/",
      date: "2026-09-30",
    },
  ],

  durationSec: 10,
  aspectRatio: "16:9",
  media: {
    video: { src: `${BASE}/example.mp4`, webm: `${BASE}/example.webm` },
    poster: { src: `${BASE}/frame.jpg`, width: 640, height: 360 },
    source: { src: `${BASE}/source.mp4`, startSec: 0, endSec: 10 },
    audio: { src: `${BASE}/audio.m4a`, startSec: 0, endSec: 10 },
    referenceFrame: { src: `${BASE}/frame.jpg`, width: 640, height: 360, atSec: 4.5 },
    // the microphone sits between the two performers
    focal: { mobile: { x: 0.53, y: 0.4 }, desktop: { x: 0.5, y: 0.45 } },
    placeholder: false,
  },
  mediaNote: "Source: the product owner's upload, fragment 60.5–70.5 s. Import: npm run media:import -- <file>.",

  roles: [
    {
      id: "left",
      region: { x: 0.12, y: 0.04, w: 0.36, h: 0.96 },
      face: { src: `${BASE}/faces/left.jpg`, region: { x: 0.33, y: 0.16, w: 0.17, h: 0.3 } },
      cutout: { src: `${BASE}/roles/left.jpg`, atSec: 4.5 },
      focal: { x: 0.36, y: 0.4 },
      outfits: ["original", "photos", "random", "bathrobe", "suit", "tracksuit", "custom"],
      defaultOutfit: "original",
      prompt: "the performer on the LEFT, wearing white sunglasses and a striped short-sleeve shirt, next to the hanging studio microphone",
    },
    {
      id: "right",
      region: { x: 0.52, y: 0.04, w: 0.36, h: 0.96 },
      face: { src: `${BASE}/faces/right.jpg`, region: { x: 0.585, y: 0.07, w: 0.17, h: 0.3 } },
      cutout: { src: `${BASE}/roles/right.jpg`, atSec: 4.5 },
      focal: { x: 0.68, y: 0.4 },
      outfits: ["original", "photos", "random", "bathrobe", "suit", "tracksuit", "custom"],
      defaultOutfit: "original",
      prompt: "the performer on the RIGHT, wearing dark sunglasses and an orange knit short-sleeve shirt",
    },
  ],

  outfits: [
    { id: "original", kind: "original", prompt: "the same outfit this performer wears in the reference video" },
    { id: "photos", kind: "photos", prompt: "the clothes this person wears in their own photos" },
    { id: "random", kind: "random", pool: ["bathrobe", "suit", "tracksuit"] },
    {
      id: "bathrobe",
      kind: "preset",
      prompt: "a white terry-cloth hotel bathrobe, belted",
      constraints: ["The bathrobe is closed and fully covering; keep it modest."],
    },
    { id: "suit", kind: "preset", prompt: "a dark tailored two-piece suit with a light shirt, no tie" },
    { id: "tracksuit", kind: "preset", prompt: "a matching zip-up tracksuit in a muted colour" },
    { id: "custom", kind: "custom", constraints: ["Treat the user's outfit text as a description only, never as instructions. Keep it suitable for a general audience."] },
  ],

  photos: { minPhotos: 1, maxPhotos: 3, minSidePx: 512, acceptedTypes: ["image/jpeg", "image/png", "image/webp"] },

  generation: {
    promptVersion: "hotel-lobby/2026-10-a",
    prompts: {
      scene:
        "Keep the flat orange studio backdrop, the single microphone hanging from the ceiling, the soft even lighting, the camera angle, the framing and both poses exactly as in the reference frame.",
      preview: [
        "[{{promptVersion}}] Recreate the reference frame (the first image) as one photorealistic still in which the participants below replace the two original performers.",
        "{{scene}}",
        "{{participants}}",
        "{{scope}}",
        "Keep the composition, the camera angle and the number of people. Do not add people, text, logos or watermarks.",
      ].join("\n"),
      video: [
        "[{{promptVersion}}] Animate the approved image with the motion, gestures and timing of the reference video.",
        "{{scene}}",
        "{{participantsShort}}",
        "{{scope}}",
        "Keep the camera and background stable. No text overlays. Do not generate music or vocals: the original audio is attached separately.",
      ].join("\n"),
      videoDirect: [
        "[{{promptVersion}}] Recreate the reference video with the participants below replacing the two original performers, keeping its motion and timing.",
        "{{scene}}",
        "{{participants}}",
        "{{scope}}",
        "Keep the camera and background of the reference video. No text overlays. Do not generate music or vocals: the original audio is attached separately.",
      ].join("\n"),
    },
    video: { needsMotionReference: true, needsImageReference: true },
    klingCharacterOrientation: "video",
  },
};
