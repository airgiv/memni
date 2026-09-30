import { getConfig } from "../../config";
import { DemoVideoProvider } from "./demo";
import { GenjutsuVideoProvider } from "./genjutsu";
import { KlingVideoProvider } from "./kling";
import type { VideoProvider } from "./types";

export * from "./types";

let instance: VideoProvider | null = null;
export function getVideoProvider(): VideoProvider {
  if (instance) return instance;
  const c = getConfig();
  instance =
    c.videoMode === "kling"
      ? new KlingVideoProvider(c.kling)
      : c.videoMode === "genjutsu"
        ? new GenjutsuVideoProvider(c.genjutsu)
        : new DemoVideoProvider();
  return instance;
}

/** The worker must use the provider a job was created with, even if config changed since. */
export function videoProviderFor(name: string): VideoProvider {
  const current = getVideoProvider();
  if (current.name === name) return current;
  if (name === "demo") return new DemoVideoProvider();
  const c = getConfig();
  if (name.startsWith("kling:")) return new KlingVideoProvider(c.kling);
  if (name.startsWith("genjutsu:")) return new GenjutsuVideoProvider(c.genjutsu);
  throw new Error(`unknown video provider ${name}`);
}
