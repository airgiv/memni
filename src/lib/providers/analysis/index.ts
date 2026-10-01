import { getConfig } from "../../config";
import { LocalPhotoAnalyzer } from "./demo";
import { GeminiPhotoAnalyzer } from "./gemini";
import type { PhotoAnalyzer } from "./types";

export * from "./types";

let instance: PhotoAnalyzer | null = null;
export function getPhotoAnalyzer(): PhotoAnalyzer {
  if (instance) return instance;
  const c = getConfig();
  instance = c.analysisMode === "gemini" ? new GeminiPhotoAnalyzer(c.gemini) : new LocalPhotoAnalyzer();
  return instance;
}
