/**
 * Demo video adapter. No model is called. The "task" is a timer encoded in
 * the task id (so it survives worker restarts); the "result" is the template's
 * own demo motion clip with the chosen scene image (or, without a preview, the
 * people's photos) pinned in a corner and a
 * "DEMO · placeholder, not your result" badge — then the worker muxes the original
 * audio exactly as it would for a real result.
 */
import { join } from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import sharp from "sharp";
import type { Job } from "../../domain/types";
import { getStorage } from "../../server/storage";
import { ffprobeBin, runFfmpeg } from "../../server/media";
import type { VideoProvider, VideoStatus, VideoSubmitRequest } from "./types";

async function probeSize(file: string): Promise<{ width: number; height: number } | null> {
  const { execFileSync } = await import("node:child_process");
  const out = execFileSync(ffprobeBin(), ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", file]).toString();
  const st = JSON.parse(out).streams?.[0];
  return st ? { width: st.width, height: st.height } : null;
}

const QUEUE_MS = 3000;
const RUN_MS = 7000;

export class DemoVideoProvider implements VideoProvider {
  readonly name = "demo";
  readonly isDemo = true;
  readonly canFindByExternalId = true;
  readonly capabilities = {
    motionReference: true,
    imageReference: true,
    perPersonReferences: true,
    withoutPreview: "any" as const,
    maxReferenceImages: 8,
    needsPublicUrls: false,
    maxDurationSec: 30,
    // simulated: the demo replaces nobody, it only pins photos in a corner
    replaces: "whole-person" as const,
  };

  async submit(req: VideoSubmitRequest) {
    return { taskId: `demo_${Date.now()}_${req.demoFail ? "fail" : "ok"}_${req.externalId}` };
  }

  async status(taskId: string): Promise<VideoStatus> {
    const [, ts, mode] = taskId.split("_");
    const elapsed = Date.now() - Number(ts);
    if (elapsed < QUEUE_MS) return { state: "queued" };
    if (elapsed < QUEUE_MS + RUN_MS) return { state: "running" };
    if (mode === "fail") return { state: "failed", error: "Demo: simulated video service failure" };
    return { state: "succeeded", videoUrl: "demo" };
  }

  async findByExternalId() {
    // the demo "provider" never loses tasks
    return null;
  }

  async fetchResult(_status: VideoStatus, job: Job): Promise<Buffer> {
    const dir = await mkdtemp(join(tmpdir(), "memni-demo-"));
    try {
      // what the demo pins in the corner: the chosen scene image, or (direct mode) people's main photos
      const inset = join(dir, "inset.jpg");
      if (job.input.sceneImageKey) await writeFile(inset, await getStorage().get(job.input.sceneImageKey));
      else {
        const faces = await Promise.all(
          job.input.people.map(async (p) =>
            sharp(await getStorage().get(p.referenceKeys[0])).rotate().resize(240, 320, { fit: "cover", position: "attention" }).toBuffer(),
          ),
        );
        await sharp({ create: { width: 240 * faces.length, height: 320, channels: 3, background: "#161616" } })
          .composite(faces.map((input, i) => ({ input, left: i * 240, top: 0 })))
          .jpeg()
          .toFile(inset);
      }
      const src = join(process.cwd(), "public", job.input.sourceVideo.src);
      const badge = join(process.cwd(), "public", "demo", "badge-video.png");
      const out = join(dir, "raw.mp4");
      // sizes follow the source frame (the real Hotel Lobby clip is 640×360)
      const { height = 360 } = (await probeSize(src)) ?? {};
      const insetH = Math.round(height * 0.34);
      const badgeH = Math.max(18, Math.round(height * 0.07));
      const pad = Math.round(height * 0.04);
      await runFfmpeg([
        "-i", src, "-i", inset, "-i", badge,
        "-filter_complex",
        `[1:v]scale=-2:${insetH}[s];[2:v]scale=-2:${badgeH}[b];[0:v][s]overlay=W-w-${pad}:H-h-${pad}[v1];[v1][b]overlay=${pad}:${pad}[v]`,
        "-map", "[v]", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "28", out,
      ]);
      return await readFile(out);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  estimateCost() {
    return 0;
  }
}
