import type { TemplateDef } from "./types";

export * from "./types";

/*
 * Template catalog. It is plain config on purpose: no editor, no admin.
 *
 * All media below are DEMO placeholders drawn by scripts/make-demo-media.ts
 * (an illustrated frame, a synthetic motion clip and a synthesised tune).
 * No third-party clips are downloaded or published. To go live with a real
 * template, put licensed files into public/templates/<id>/ (or a CDN / the
 * Supabase bucket), update `media`, mark roles on the real reference frame,
 * set `demoMaterials: false` and bump `version`.
 */

const COMMON_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

/*
 * Hotel Lobby — built on the REAL source video supplied by the product owner.
 * The licensed file is not committed to git: `npm run media:import -- <file>`
 * cuts the fragment below into public/templates/hotel-lobby/ (gitignored):
 * motion clip, original audio, example with sound, reference frame and a
 * portrait cutout per person. Roles were marked once on the frame at 4.5 s
 * of the fragment, where both faces are clearly visible.
 */
export const HOTEL_LOBBY_FRAGMENT = { startSec: 60.5, endSec: 70.5 };

const hotelLobby: TemplateDef = {
  id: "hotel-lobby",
  version: 2,
  kind: "main",
  title: "Hotel Lobby",
  description: "Двое у микрофона в студии.",
  demoMaterials: false,
  materialsNote: "Источник — видео владельца продукта; фрагмент 60,5–70,5 с. Импорт: npm run media:import -- <файл>.",
  durationSec: 10,
  aspectRatio: "16:9",
  media: {
    example: { src: "/templates/hotel-lobby/example.mp4", poster: "/templates/hotel-lobby/frame.jpg" },
    source: { src: "/templates/hotel-lobby/source.mp4", startSec: 0, endSec: 10 },
    audio: { src: "/templates/hotel-lobby/audio.m4a", startSec: 0, endSec: 10 },
    referenceFrame: { src: "/templates/hotel-lobby/frame.jpg", width: 640, height: 360, atSec: 4.5 },
  },
  roles: [
    {
      id: "left",
      name: "Слева",
      question: "Кто будет слева?",
      description: "В полосатой рубашке.",
      region: { x: 0.12, y: 0.04, w: 0.36, h: 0.96 },
      tone: "sky",
      cutout: { src: "/templates/hotel-lobby/roles/left.jpg", atSec: 4.5 },
      promptRole: "the performer on the LEFT, in the striped short-sleeve shirt, next to the studio microphone",
    },
    {
      id: "right",
      name: "Справа",
      question: "Кто будет справа?",
      description: "В оранжевой рубашке.",
      region: { x: 0.52, y: 0.04, w: 0.36, h: 0.96 },
      tone: "flame",
      cutout: { src: "/templates/hotel-lobby/roles/right.jpg", atSec: 4.5 },
      promptRole: "the performer on the RIGHT, in the orange knit short-sleeve shirt",
    },
  ],
  photoRequirements: {
    minPhotos: 1,
    recommendedPhotos: 3,
    maxPhotos: 6,
    minSidePx: 512,
    acceptedTypes: COMMON_PHOTO_TYPES,
    tips: [],
  },
  look: {
    clothingModes: ["template", "photo", "preset"],
    defaultClothing: "template",
    templateOutfit: { label: "Из видео", prompt: "the same outfit this performer wears in the reference video" },
    presets: [
      { id: "suit", label: "Костюм", description: "", prompt: "a dark tailored suit with a light shirt, no tie" },
      { id: "robe", label: "Халат", description: "", prompt: "a white terry hotel bathrobe" },
    ],
    glassesOption: false,
    appearanceNoteMaxLength: 160,
  },
  scene: {
    options: [
      {
        id: "faithful",
        label: "Как в видео",
        description: "",
        prompt: "Keep the orange studio background, the hanging microphone, the lighting, camera angle and poses exactly as in the reference frame.",
      },
    ],
    defaultOption: "faithful",
  },
  pipeline: {
    promptVersion: "hotel-lobby/2026-09-c",
    video: { needsMotionReference: true, needsImageReference: true, wantsPerPersonReferences: true },
  },
  provider: { klingCharacterOrientation: "video", maxVideoDurationSec: 30 },
  price: { amountMinor: 9900, currency: "RUB", isExample: true },
};

const morningShow: TemplateDef = {
  id: "morning-show",
  version: 1,
  kind: "demo",
  title: "Утренний эфир",
  description: "Ведущий бодро объявляет новости дня. Один участник — демонстрация шаблона на одну роль.",
  demoMaterials: true,
  materialsNote: "Демонстрационный шаблон на одну роль. Реальных материалов нет.",
  durationSec: 6,
  aspectRatio: "9:16",
  media: {
    example: { src: "/templates/morning-show/example.mp4", poster: "/templates/morning-show/frame.jpg" },
    source: { src: "/templates/morning-show/source.mp4", startSec: 0, endSec: 6 },
    audio: { src: "/templates/morning-show/audio.m4a", startSec: 0, endSec: 6 },
    referenceFrame: { src: "/templates/morning-show/frame.jpg", width: 720, height: 1280, atSec: 0 },
  },
  roles: [
    {
      id: "host",
      name: "Ведущий",
      question: "Кто ведёт утренний эфир?",
      description: "Сидит за столом в центре студии.",
      region: { x: 0.26, y: 0.34, w: 0.48, h: 0.5 },
      tone: "plum",
      cutout: { src: "/templates/morning-show/roles/host.jpg", atSec: 1.0 },
      promptRole: "the news host sitting at the desk in the centre",
    },
  ],
  photoRequirements: {
    minPhotos: 1,
    recommendedPhotos: 2,
    maxPhotos: 6,
    minSidePx: 512,
    acceptedTypes: COMMON_PHOTO_TYPES,
    tips: ["Лицо анфас, взгляд в камеру", "Достаточно портрета по плечи"],
  },
  look: {
    clothingModes: ["template", "photo"],
    defaultClothing: "template",
    templateOutfit: { label: "Одежда из ролика", prompt: "a neat blazer of a TV host" },
    presets: [],
    glassesOption: false,
    appearanceNoteMaxLength: 160,
  },
  scene: {
    options: [
      {
        id: "faithful",
        label: "Как в оригинале",
        description: "Студия, свет и ракурс не меняются.",
        prompt: "Keep the TV studio, lighting and camera angle exactly as in the reference frame.",
      },
    ],
    defaultOption: "faithful",
  },
  pipeline: {
    promptVersion: "generic/2026-09-b",
    video: { needsMotionReference: true, needsImageReference: true, wantsPerPersonReferences: true },
  },
  provider: { klingCharacterOrientation: "video", maxVideoDurationSec: 10 },
  price: null,
};

const trio: TemplateDef = {
  id: "stairs-trio",
  version: 1,
  kind: "demo",
  title: "Трио на лестнице",
  description: "Трое спускаются по лестнице и синхронно оборачиваются. Демонстрация шаблона на три роли.",
  demoMaterials: true,
  materialsNote: "Демонстрационный шаблон на три роли. Реальных материалов нет.",
  durationSec: 7,
  aspectRatio: "9:16",
  media: {
    example: { src: "/templates/stairs-trio/example.mp4", poster: "/templates/stairs-trio/frame.jpg" },
    source: { src: "/templates/stairs-trio/source.mp4", startSec: 0, endSec: 7 },
    audio: { src: "/templates/stairs-trio/audio.m4a", startSec: 0, endSec: 7 },
    referenceFrame: { src: "/templates/stairs-trio/frame.jpg", width: 720, height: 1280, atSec: 0 },
  },
  roles: [
    {
      id: "top",
      name: "Наверху",
      question: "Кто стоит на верхней ступеньке?",
      description: "Оборачивается последним.",
      region: { x: 0.56, y: 0.14, w: 0.3, h: 0.34 },
      tone: "acid",
      cutout: { src: "/templates/stairs-trio/roles/top.jpg", atSec: 1.5 },
      promptRole: "the person on the top step, right side",
    },
    {
      id: "middle",
      name: "В середине",
      question: "Кто в середине лестницы?",
      description: "Оборачивается вторым.",
      region: { x: 0.35, y: 0.33, w: 0.3, h: 0.34 },
      tone: "bubble",
      cutout: { src: "/templates/stairs-trio/roles/middle.jpg", atSec: 1.5 },
      promptRole: "the person in the middle of the staircase",
    },
    {
      id: "bottom",
      name: "Внизу",
      question: "Кто уже спустился вниз?",
      description: "Оборачивается первым, ближе всех к камере.",
      region: { x: 0.12, y: 0.52, w: 0.32, h: 0.4 },
      tone: "sky",
      cutout: { src: "/templates/stairs-trio/roles/bottom.jpg", atSec: 1.5 },
      promptRole: "the person at the bottom of the staircase, closest to the camera, left side",
    },
  ],
  photoRequirements: {
    minPhotos: 1,
    recommendedPhotos: 2,
    maxPhotos: 6,
    minSidePx: 512,
    acceptedTypes: COMMON_PHOTO_TYPES,
    tips: ["Фото в полный рост помогает с позой", "Лицо должно быть хорошо видно"],
  },
  look: {
    clothingModes: ["template", "photo"],
    defaultClothing: "template",
    templateOutfit: { label: "Одежда из ролика", prompt: "elegant evening wear" },
    presets: [],
    glassesOption: false,
    appearanceNoteMaxLength: 160,
  },
  scene: {
    options: [
      {
        id: "faithful",
        label: "Как в оригинале",
        description: "Лестница, свет и позы не меняются.",
        prompt: "Keep the staircase, lighting and poses exactly as in the reference frame.",
      },
    ],
    defaultOption: "faithful",
  },
  pipeline: {
    promptVersion: "generic/2026-09-b",
    video: { needsMotionReference: true, needsImageReference: true, wantsPerPersonReferences: true },
  },
  provider: { klingCharacterOrientation: "video", maxVideoDurationSec: 10 },
  price: null,
};

/** The catalog: only real, working templates. */
export const TEMPLATES: TemplateDef[] = [hotelLobby];

/**
 * Drawn one- and three-person examples. Not listed in the catalog (no real
 * video yet); kept to prove that any number of roles works (see tests).
 */
export const EXAMPLE_TEMPLATES: TemplateDef[] = [morningShow, trio];

export function getTemplate(id: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function formatDuration(sec: number): string {
  return `${sec} с`;
}

export function rolesWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} участник`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} участника`;
  return `${n} участников`;
}
