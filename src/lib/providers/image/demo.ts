/**
 * Demo image adapter. It does NOT generate anything: it pins each person's
 * main photo onto the template frame and stamps «ДЕМО · не генерация» on the
 * result, so nobody can mistake it for a personal AI image. It exists to
 * exercise the whole flow — history, stale previews, prices, errors — without
 * paid calls.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { ImageProviderError, type ImageProvider, type ImageResult, type ScenePreviewRequest } from "./types";

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
      const face = await sharp(p.photos[0].bytes)
        .rotate()
        .resize(side, side, { fit: "cover", position: "attention" })
        .composite([{ input: circle, blend: "dest-in" }, { input: ring }])
        .png()
        .toBuffer();
      layers.push({ input: face, left: Math.round((r.x + r.w / 2) * w - side / 2), top: Math.round(r.y * h + 8) });
    }
    // badges scale with the frame, so they stay readable but never cover faces
    const bh = Math.max(20, Math.round(h * 0.055));
    const b1 = await sharp(await badge("badge-demo.png")).resize({ height: bh }).toBuffer();
    const b2 = await sharp(await badge("badge-scene.png")).resize({ height: bh }).toBuffer();
    layers.push({ input: b1, left: Math.round(h * 0.04), top: h - bh * 2 - Math.round(h * 0.06) });
    layers.push({ input: b2, left: Math.round(h * 0.04), top: h - bh - Math.round(h * 0.04) });
    const bytes = await sharp(req.referenceFrame.bytes)
      .resize(w, h, { fit: "cover" })
      .composite(layers)
      .jpeg({ quality: 84 })
      .toBuffer();
    return { bytes, mime: "image/jpeg", estimatedCostUsd: 0 };
  }
}
