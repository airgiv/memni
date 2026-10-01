import type { MemeContent } from "../types";

/**
 * Source-language content. Every factual claim is tied to a source id in
 * the section's `sources`; nothing here is invented (no view counts, no
 * dates or authorship we could not attribute).
 */
export const en: MemeContent = {
  slug: "hotel-lobby",
  title: "Hotel Lobby",
  tagline: "Starring you and your friends",
  seo: {
    title: "Hotel Lobby meme with you and a friend",
    description:
      "Put yourself and a friend into the Hotel Lobby meme — the COLORS performance by Quavo and Takeoff — with the original sound. Upload a photo for each person and create the video.",
  },
  summary: "Two people, one hanging microphone, an orange backdrop.",
  roles: {
    left: { name: "Left", hint: "Striped shirt, white sunglasses" },
    right: { name: "Right", hint: "Orange shirt, dark sunglasses" },
  },
  outfits: {
    original: "Original outfit",
    photos: "Outfit from my photos",
    random: "Random outfit",
    bathrobe: "Hotel bathrobe",
    suit: "Dark suit",
    tracksuit: "Tracksuit",
    custom: "Describe an outfit",
  },
  sections: [
    {
      id: "what",
      heading: "What the meme is",
      paragraphs: [
        "Hotel Lobby is a video format built on a 2022 performance of the song “HOTEL LOBBY (Unc & Phew)” by Quavo and Takeoff. Two performers share a single microphone hanging from the ceiling in front of a flat orange backdrop and trade lines back and forth.",
        "In September 2026, people began posting AI edits of the performance in which other people, fictional characters or animals take the rappers’ places while the backdrop, the movements and the original audio stay the same.",
      ],
      sources: ["kym", "source-repost"],
    },
    {
      id: "origin",
      heading: "Where it comes from",
      paragraphs: [
        "The original video is an episode of A COLORS SHOW, published by COLORSxSTUDIOS on June 17, 2022. COLORS is a Berlin-based music platform that films each artist alone against a single-colour backdrop.",
        "Quavo and Takeoff perform as Unc & Phew — a duo name that refers to their family relationship: Quavo is Takeoff’s uncle. Takeoff died in November 2022.",
        "According to Know Your Meme, the earliest known AI edit was posted on TikTok on September 16, 2026, and replaced the duo with two characters from the TV series Suits.",
      ],
      sources: ["colors-video", "wiki-colors", "wiki-duo", "kym"],
    },
    {
      id: "music",
      heading: "The music",
      paragraphs: [
        "“HOTEL LOBBY (Unc & Phew)” was released on May 20, 2022, as the debut single of Unc & Phew. It was produced by Murda Beatz, Keanu Beats and Fabio Aguilar, and appears on the duo’s only studio album, Only Built for Infinity Links, released on October 7, 2022 by Quality Control Music and Motown.",
        "In Мемме, the original audio of the 15-second fragment is attached to your video exactly as it is. The video model never recreates the song.",
      ],
      sources: ["wiki-song", "wiki-album"],
    },
    {
      id: "popularity",
      heading: "Why it caught on",
      paragraphs: [
        "The format is easy to recognise and easy to recast: one fixed camera, two people side by side and a well-known track. On September 23, 2026, Quavo reposted the original performance as the trend spread, and The Source reported a sharp rise in U.S. streams of the COLORS performance in the following week.",
      ],
      sources: ["source-repost", "source-streams"],
    },
    {
      id: "how",
      heading: "How to make your version",
      paragraphs: [
        "Tap “Replace people”. For each of the two performers, upload one to three photos of the person who takes their place, or pick someone you saved before.",
        "Choose an outfit for each person — the original look, the clothes from their photos, a hotel bathrobe or something else. Then create the video straight away, or look at a shared preview image first.",
      ],
    },
  ],
  faq: [
    {
      q: "How many photos do I need?",
      a: "One clear photo per person is enough. Up to three help, and a full-length photo helps match height and build.",
    },
    {
      q: "Is the sound the original?",
      a: "Yes. We cut the original audio of the fragment and attach it to the finished video with exact timing.",
    },
    {
      q: "Does the whole person change, or only the face?",
      a: "Мемме aims to replace the whole visible person — face, hair and build — as far as the video model allows. If a model can only swap faces, we say so before you pay.",
    },
    {
      q: "Is Мемме connected to Quavo, Takeoff or COLORS?",
      a: "No. Мемме is not affiliated with the artists, COLORS or their labels.",
    },
    {
      q: "When do I pay?",
      a: "The price is shown before every paid step. Choosing between finished preview versions is free.",
    },
  ],
  review: { status: "reviewed", note: "Source language." },
};
