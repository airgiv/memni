/**
 * Direct Gemini API (Google AI for Developers), image output.
 *
 *   POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 *   header x-goog-api-key
 *   body   contents[0].parts = [{text}, {inlineData:{mimeType,data}}...]
 *          generationConfig.responseModalities = ["IMAGE"]
 *          generationConfig.imageConfig.aspectRatio = "9:16" | …
 *   reply  candidates[0].content.parts[].inlineData {mimeType,data}; finishReason;
 *          promptFeedback.blockReason
 *
 * Checked against Google's official python-genai SDK source (field names, REST
 * casing, finish reasons). Model ids and prices were taken from ai.google.dev
 * search excerpts: default model is gemini-3.1-flash-image (gemini-2.5-flash-image
 * is announced for shutdown on 2026-10-02). Up to 14 reference images per call.
 * NOT yet exercised with a real key — see README «Что проверено».
 */
import type { AppConfig } from "../../config";
import { ImageProviderError, type ImageProvider, type ImageRef, type ImageResult, type ScenePreviewRequest } from "./types";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

const SAFETY_REASONS = new Set(["SAFETY", "IMAGE_SAFETY", "PROHIBITED_CONTENT", "IMAGE_PROHIBITED_CONTENT", "BLOCKLIST", "SPII"]);

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  thought?: boolean;
}

export class GeminiImageProvider implements ImageProvider {
  readonly name: string;
  readonly isDemo = false;
  readonly maxReferences = 14;

  constructor(private cfg: AppConfig["gemini"]) {
    this.name = `gemini:${cfg.model}`;
  }

  private inline(img: ImageRef): GeminiPart {
    return { inlineData: { mimeType: img.mime, data: img.bytes.toString("base64") } };
  }

  private async call(parts: GeminiPart[], aspectRatio: string): Promise<ImageResult> {
    if (!this.cfg.apiKey) throw new ImageProviderError("config", "GEMINI_API_KEY не задан");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${ENDPOINT}/${encodeURIComponent(this.cfg.model)}:generateContent`, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "content-type": "application/json", "x-goog-api-key": this.cfg.apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio } },
        }),
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw new ImageProviderError("timeout", "Сервис изображений не ответил вовремя");
      throw new ImageProviderError("provider", "Не удалось связаться с сервисом изображений");
    } finally {
      clearTimeout(timer);
    }
    const body = (await res.json().catch(() => null)) as {
      candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
      error?: { message?: string; status?: string };
    } | null;
    if (!res.ok) {
      const msg = body?.error?.message ?? `HTTP ${res.status}`;
      throw new ImageProviderError(res.status === 400 ? "provider" : "provider", `Сервис изображений вернул ошибку: ${msg}`);
    }
    if (body?.promptFeedback?.blockReason)
      throw new ImageProviderError("safety", "Сервис отказался обрабатывать эти фото по правилам безопасности");
    const cand = body?.candidates?.[0];
    const image = cand?.content?.parts?.find((p) => p.inlineData && !p.thought)?.inlineData;
    if (!image) {
      if (cand?.finishReason && SAFETY_REASONS.has(cand.finishReason))
        throw new ImageProviderError("safety", "Сервис отказался обрабатывать эти фото по правилам безопасности");
      throw new ImageProviderError("no_image", "Сервис не вернул изображение");
    }
    return { bytes: Buffer.from(image.data, "base64"), mime: image.mimeType, estimatedCostUsd: this.cfg.estimatedCostUsd };
  }

  scene(req: ScenePreviewRequest) {
    const parts: GeminiPart[] = [{ text: req.prompt }, { text: "Reference frame:" }, this.inline(req.referenceFrame)];
    // share the model's reference budget between people, main photo first
    const perPerson = Math.max(1, Math.floor((this.maxReferences - 1) / Math.max(1, req.people.length)));
    req.people.forEach((p, i) => {
      p.photos.slice(0, perPerson).forEach((photo, j) => {
        parts.push({ text: `Person #${i + 1}, photo ${j + 1}:` }, this.inline(photo));
      });
    });
    return this.call(parts, req.template.aspectRatio);
  }
}
