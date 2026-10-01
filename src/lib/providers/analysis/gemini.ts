/**
 * Gemini vision as a photo checker (structured JSON output). Asks only for
 * the face count, body visibility and quality problems — explicitly not for
 * gender, age, ethnicity or identity.
 *
 * PREPARED, NOT VERIFIED with a real key (same endpoint and auth as the
 * image adapter; responseMimeType/responseSchema per the public REST docs).
 */
import type { AppConfig } from "../../config";
import type { PhotoAnalysis } from "../../domain/types";
import { LocalPhotoAnalyzer } from "./demo";
import type { PhotoAnalyzer } from "./types";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

const INSTRUCTION = [
  "You check whether a photo is a usable reference for placing this person into a video.",
  "Report only: the number of clearly visible human faces; how much of the main person's body is visible (full = head to feet, upper = head and torso, face = head and shoulders or less); and quality problems from the allowed list.",
  "Do NOT describe or estimate gender, age, ethnicity, attractiveness, health or identity.",
].join(" ");

export class GeminiPhotoAnalyzer implements PhotoAnalyzer {
  readonly name: string;
  readonly isDemo = false;
  private local = new LocalPhotoAnalyzer();

  constructor(private cfg: AppConfig["gemini"]) {
    this.name = `gemini:${cfg.analysisModel}`;
  }

  async analyze(image: { bytes: Buffer; width: number; height: number }): Promise<PhotoAnalysis> {
    const base = await this.local.analyze(image);
    try {
      const res = await fetch(`${ENDPOINT}/${encodeURIComponent(this.cfg.analysisModel)}:generateContent`, {
        method: "POST",
        signal: AbortSignal.timeout(20_000),
        headers: { "content-type": "application/json", "x-goog-api-key": this.cfg.apiKey ?? "" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: INSTRUCTION }, { inlineData: { mimeType: "image/jpeg", data: image.bytes.toString("base64") } }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                faces: { type: "INTEGER" },
                body: { type: "STRING", enum: ["full", "upper", "face"] },
                issues: { type: "ARRAY", items: { type: "STRING", enum: ["dark", "bright", "blurry"] } },
              },
              required: ["faces", "body", "issues"],
            },
          },
        }),
      });
      if (!res.ok) return base;
      const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const parsed = JSON.parse(body.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}") as { faces?: number; body?: string; issues?: string[] };
      const issues = new Set(base.issues);
      for (const i of parsed.issues ?? []) if (i === "dark" || i === "bright" || i === "blurry") issues.add(i);
      const faces = Number.isInteger(parsed.faces) ? parsed.faces! : null;
      if (faces === 0) issues.add("no_face");
      if (faces !== null && faces > 1) issues.add("several_faces");
      const bodyVis = parsed.body === "full" || parsed.body === "upper" || parsed.body === "face" ? parsed.body : null;
      return { analyzer: this.name, isDemo: false, checked: [...base.checked, "faces", "body"], issues: [...issues], faces, body: bodyVis };
    } catch {
      // the checker is advisory: an outage never blocks an upload
      return base;
    }
  }
}
