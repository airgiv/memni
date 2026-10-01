import type { PhotoAnalysis } from "../../domain/types";

/**
 * Photo analysis checks whether a photo is a usable reference: image
 * quality, how many faces are visible and how much of the body is shown.
 * It never estimates gender, age, ethnicity or identity — presentation is
 * only ever what the user states.
 */
export interface PhotoAnalyzer {
  readonly name: string;
  readonly isDemo: boolean;
  analyze(image: { bytes: Buffer; width: number; height: number }): Promise<PhotoAnalysis>;
}
