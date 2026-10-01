/**
 * Local analyzer: measures only what pixels can tell without a model —
 * resolution, exposure and a sharpness estimate. Faces and body visibility
 * are NOT checked (null), and the UI says "not checked" instead of "fine".
 */
import sharp from "sharp";
import type { PhotoAnalysis } from "../../domain/types";
import type { PhotoAnalyzer } from "./types";

const GOOD_SIDE = 1024;
/** Laplacian standard deviation below this on a 512 px greyscale copy reads as blurry (heuristic). */
const BLUR_THRESHOLD = 6;

export class LocalPhotoAnalyzer implements PhotoAnalyzer {
  readonly name = "local";
  readonly isDemo = true;

  async analyze(image: { bytes: Buffer; width: number; height: number }): Promise<PhotoAnalysis> {
    const issues: PhotoAnalysis["issues"] = [];
    if (Math.min(image.width, image.height) < GOOD_SIDE) issues.push("small");
    const grey = sharp(image.bytes).rotate().greyscale().resize(512, 512, { fit: "inside" });
    const { channels } = await grey.clone().stats();
    const mean = channels[0]?.mean ?? 128;
    if (mean < 50) issues.push("dark");
    else if (mean > 220) issues.push("bright");
    const edges = await grey
      .clone()
      .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], offset: 128 })
      .stats();
    if ((edges.channels[0]?.stdev ?? 99) < BLUR_THRESHOLD) issues.push("blurry");
    return { analyzer: this.name, isDemo: true, checked: ["resolution", "exposure", "sharpness"], issues, faces: null, body: null };
  }
}
