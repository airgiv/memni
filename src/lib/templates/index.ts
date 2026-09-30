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

const hotelLobby: TemplateDef = {
  id: "hotel-lobby",
  version: 1,
  kind: "main",
  title: "Hotel Lobby",
  description: "Двое у микрофонов в холле отеля качают в такт. Нужны два человека.",
  demoMaterials: true,
  materialsNote:
    "Заменить public/templates/hotel-lobby/{source.mp4,audio.m4a,example.mp4,frame.jpg} лицензированными материалами, заново разметить роли.",
  durationSec: 8,
  aspectRatio: "9:16",
  media: {
    example: { src: "/templates/hotel-lobby/example.mp4", poster: "/templates/hotel-lobby/frame.jpg" },
    source: { src: "/templates/hotel-lobby/source.mp4", startSec: 0, endSec: 8 },
    audio: { src: "/templates/hotel-lobby/audio.m4a", startSec: 0, endSec: 8 },
    referenceFrame: { src: "/templates/hotel-lobby/frame.jpg", width: 720, height: 1280, atSec: 0 },
  },
  roles: [
    {
      id: "mic-left",
      name: "Слева у микрофона",
      question: "Кто будет у микрофона слева?",
      description: "Начинает куплет, стоит вполоборота к центру.",
      region: { x: 0.05, y: 0.36, w: 0.42, h: 0.58 },
      tone: "flame",
      cutout: { src: "/templates/hotel-lobby/roles/mic-left.jpg", atSec: 2.0 },
      promptRole: "the performer standing on the LEFT side at the left microphone stand, turned slightly toward the centre",
    },
    {
      id: "mic-right",
      name: "Справа у микрофона",
      question: "Кто будет у микрофона справа?",
      description: "Подхватывает припев, стоит ближе к стойке ресепшена.",
      region: { x: 0.53, y: 0.36, w: 0.42, h: 0.58 },
      tone: "blue",
      cutout: { src: "/templates/hotel-lobby/roles/mic-right.jpg", atSec: 2.0 },
      promptRole: "the performer standing on the RIGHT side at the right microphone stand, near the reception desk",
    },
  ],
  photoRequirements: {
    minPhotos: 1,
    recommendedPhotos: 3,
    maxPhotos: 6,
    minSidePx: 512,
    acceptedTypes: COMMON_PHOTO_TYPES,
    tips: [
      "Лицо целиком, без тёмных очков и масок",
      "Для этого ролика лучше фото по пояс — видно плечи и руки",
      "Ровный дневной свет, без сильных фильтров",
      "Один человек в кадре — других лучше обрезать",
    ],
  },
  look: {
    clothingModes: ["template", "photo", "preset"],
    defaultClothing: "template",
    templateOutfit: {
      label: "Одежда из ролика",
      prompt: "an oversized tracksuit with a chunky chain, as in the original scene",
    },
    presets: [
      {
        id: "suit",
        label: "Костюм",
        description: "Тёмный костюм, светлая рубашка",
        prompt: "a dark tailored suit with a light shirt, no tie",
      },
      {
        id: "robe",
        label: "Халат",
        description: "Белый махровый халат и тапочки",
        prompt: "a white terry hotel bathrobe",
      },
    ],
    glassesOption: false,
    appearanceNoteMaxLength: 160,
  },
  scene: {
    options: [
      {
        id: "faithful",
        label: "Максимально близко к оригиналу",
        description: "Тот же холл, свет и позы. Меняются только люди.",
        prompt: "Keep the hotel lobby, lighting, camera angle and poses exactly as in the reference frame.",
      },
      {
        id: "matching-outfits",
        label: "Одинаковые костюмы",
        description: "Оба участника в одинаковых костюмах шаблона — одежда из образов не учитывается.",
        prompt: "Both performers wear identical oversized tracksuits with chunky chains.",
        overridesClothing: true,
      },
    ],
    defaultOption: "faithful",
  },
  pipeline: {
    promptVersion: "hotel-lobby/2026-09-b",
    video: { needsMotionReference: true, needsImageReference: true, wantsPerPersonReferences: true },
  },
  provider: { klingCharacterOrientation: "video", maxVideoDurationSec: 10 },
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

export const TEMPLATES: TemplateDef[] = [hotelLobby, morningShow, trio];

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
