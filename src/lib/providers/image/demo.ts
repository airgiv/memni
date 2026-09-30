/**
 * Demo image adapter. It does NOT generate anything: it frames the user's own
 * photo (person step) or pins photos onto the template frame (scene step) and
 * stamps «ДЕМО · не генерация» on the result, so nobody can mistake it for a
 * personal AI image. It exists to exercise the whole flow — history, stale
 * answers, confirmations, limits, errors — without paid calls.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp, { type Metadata, type OverlayOptions } from "sharp";
import { ImageProviderError, type ImageProvider, type ImageResult, type PersonPreviewRequest, type ScenePreviewRequest } from "./types";

const TONES = ["#ff5b1a", "#0582ff", "#8e0d99", "#14a85c", "#f5a524", "#ff9be0"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function size(aspect: string, long = 1024): { w: number; h: number } {
  const [a, b] = aspect.split(":").map(Number);
  return a >= b ? { w: long, h: Math.round((long * b) / a) } : { w: Math.round((long * a) / b), h: long };
}

async function badge(name: string) {
  return readFile(join(process.cwd(), "public", "demo", name));
}

export class DemoImageProvider implements ImageProvider {
  readonly name = "demo";
  readonly isDemo = true;
  readonly maxReferences = 14;

  constructor(private delayMs = 1600) {}

  async person(req: PersonPreviewRequest): Promise<ImageResult> {
    await sleep(this.delayMs + Math.random() * 800);
    if (req.demo?.fail) throw new ImageProviderError("demo_failure", "Демо: имитация ошибки генерации");
    const { w, h } = size(req.template.aspectRatio);
    const tone = TONES[(req.variant - 1) % TONES.length];
    const photo = req.photos[0];
    const inner = await sharp(photo.bytes)
      .rotate()
      .resize(w - 48, h - 48, { fit: "cover", position: "attention" })
      .modulate({ saturation: 0.35 })
      .toBuffer();
    const bytes = await sharp({ create: { width: w, height: h, channels: 3, background: tone } })
      .composite([
        { input: inner, left: 24, top: 24 },
        { input: await badge("badge-demo.png"), left: 40, top: 40 },
        { input: await badge("badge-person.png"), left: 40, top: 96 },
      ])
      .jpeg({ quality: 84 })
      .toBuffer();
    return { bytes, mime: "image/jpeg", estimatedCostUsd: 0 };
  }

  async scene(req: ScenePreviewRequest): Promise<ImageResult> {
    await sleep(this.delayMs + Math.random() * 1200);
    if (req.demo?.fail) throw new ImageProviderError("demo_failure", "Демо: имитация ошибки генерации");
    const { w, h } = size(req.template.aspectRatio);
    const layers: OverlayOptions[] = [];
    for (const p of req.people) {
      const r = p.role.region;
      const side = Math.round(Math.min(r.w * w, r.h * h) * 0.62);
      const circle = Buffer.from(`<svg width="${side}" height="${side}"><circle cx="${side / 2}" cy="${side / 2}" r="${side / 2}"/></svg>`);
      const ring = Buffer.from(
        `<svg width="${side}" height="${side}"><circle cx="${side / 2}" cy="${side / 2}" r="${side / 2 - 5}" fill="none" stroke="#fff" stroke-width="10"/></svg>`,
      );
      const face = await sharp(p.approved.bytes)
        .resize(side, side, { fit: "cover", position: "attention" })
        .composite([{ input: circle, blend: "dest-in" }, { input: ring }])
        .png()
        .toBuffer();
      layers.push({ input: face, left: Math.round((r.x + r.w / 2) * w - side / 2), top: Math.round(r.y * h + 8) });
    }
    layers.push({ input: await badge("badge-demo.png"), left: 40, top: h - 150 });
    layers.push({ input: await badge("badge-scene.png"), left: 40, top: h - 94 });
    const bytes = await sharp(req.referenceFrame.bytes)
      .resize(w, h, { fit: "cover" })
      .composite(layers)
      .jpeg({ quality: 84 })
      .toBuffer();
    return { bytes, mime: "image/jpeg", estimatedCostUsd: 0 };
  }
}
