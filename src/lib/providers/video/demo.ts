/**
 * Demo video adapter. No model is called. The "task" is a timer encoded in
 * the task id (so it survives worker restarts); the "result" is the template's
 * own demo motion clip with the chosen scene image (or, without a preview, the
 * people's photos) pinned in a corner and a
 * «ДЕМО-РОЛИК · не ваш результат» badge — then the worker muxes the original
 * audio exactly as it would for a real result.
 */
import { join } from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import sharp from "sharp";
import type { Job } from "../../domain/types";
import { getStorage } from "../../server/storage";
import { runFfmpeg } from "../../server/media";
import type { VideoProvider, VideoStatus, VideoSubmitRequest } from "./types";

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
  };

  async submit(req: VideoSubmitRequest) {
    return { taskId: `demo_${Date.now()}_${req.demoFail ? "fail" : "ok"}_${req.externalId}` };
  }

  async status(taskId: string): Promise<VideoStatus> {
    const [, ts, mode] = taskId.split("_");
    const elapsed = Date.now() - Number(ts);
    if (elapsed < QUEUE_MS) return { state: "queued" };
    if (elapsed < QUEUE_MS + RUN_MS) return { state: "running" };
    if (mode === "fail") return { state: "failed", error: "Демо: имитация ошибки на стороне видеосервиса" };
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
      await runFfmpeg([
        "-i", src, "-i", inset, "-i", badge,
        "-filter_complex",
        "[1:v]scale=240:-2[s];[0:v][s]overlay=W-w-24:H-h-24[v1];[v1][2:v]overlay=24:H-h-300[v]",
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
