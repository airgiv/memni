import { getConfig } from "../../config";
import { DemoImageProvider } from "./demo";
import { GeminiImageProvider } from "./gemini";
import type { ImageProvider } from "./types";

export * from "./types";

let instance: ImageProvider | null = null;
export function getImageProvider(): ImageProvider {
  if (instance) return instance;
  const c = getConfig();
  instance = c.imageMode === "gemini" ? new GeminiImageProvider(c.gemini) : new DemoImageProvider();
  return instance;
}
