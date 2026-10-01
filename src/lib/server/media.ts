/**
 * FFmpeg/FFprobe helpers for the worker: probe a file and put the template's
 * ORIGINAL audio under a generated video.
 *
 * Rules (see README): the song is never sped up or slowed down. A small
 * difference (≤ DURATION_TOLERANCE_SEC) is absorbed by trimming the video or
 * holding its last frame; anything bigger stops with a clear error so a
 * person can look at it.
 */
import { execFile } from "node:child_process";
import { createRequire } from "node:module";

const req = createRequire(import.meta.url);

// literal module names: bundlers (the Next server for /admin/media) cannot follow a dynamic require
function pathOf(mod: unknown): string {
  return typeof mod === "string" ? mod : (mod as { path: string }).path;
}
export const ffmpegBin = () => process.env.FFMPEG_PATH || pathOf(req("ffmpeg-static"));
export const ffprobeBin = () => process.env.FFPROBE_PATH || pathOf(req("ffprobe-static"));

function exec(bin: string, args: string[], timeoutMs = 180_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${bin.split("/").pop()} failed: ${stderr || err.message}`));
      else resolve(stdout);
    });
  });
}

export function runFfmpeg(args: string[], timeoutMs = 180_000) {
  return exec(ffmpegBin(), ["-y", "-loglevel", "error", ...args], timeoutMs);
}

export interface Probe {
  durationSec: number;
  hasVideo: boolean;
  hasAudio: boolean;
  videoDurationSec?: number;
  audioDurationSec?: number;
}

export async function probe(file: string): Promise<Probe> {
  const out = await exec(ffprobeBin(), ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]);
  const j = JSON.parse(out) as {
    format?: { duration?: string };
    streams?: { codec_type?: string; duration?: string }[];
  };
  const v = j.streams?.find((s) => s.codec_type === "video");
  const a = j.streams?.find((s) => s.codec_type === "audio");
  return {
    durationSec: Number(j.format?.duration ?? 0),
    hasVideo: Boolean(v),
    hasAudio: Boolean(a),
    videoDurationSec: v?.duration ? Number(v.duration) : undefined,
    audioDurationSec: a?.duration ? Number(a.duration) : undefined,
  };
}

export class DurationMismatchError extends Error {
  constructor(
    public videoSec: number,
    public audioSec: number,
  ) {
    super(
      `The video (${videoSec.toFixed(2)} s) differs noticeably from the original audio (${audioSec.toFixed(2)} s). ` +
        "We never speed up or slow down the song — a person needs to check.",
    );
  }
}

export class AssemblyCheckError extends Error {}

export interface AssembleResult {
  durationSec: number;
  hasAudio: boolean;
  videoDurationSec: number;
  audioDurationSec: number;
}

export async function assembleWithOriginalAudio(opts: {
  videoFile: string;
  audioFile: string;
  audioStartSec: number;
  audioEndSec: number;
  outFile: string;
  toleranceSec: number;
}): Promise<AssembleResult> {
  const target = opts.audioEndSec - opts.audioStartSec;
  const raw = await probe(opts.videoFile);
  if (!raw.hasVideo) throw new AssemblyCheckError("The video service returned no video track");
  const videoSec = raw.videoDurationSec ?? raw.durationSec;
  const diff = videoSec - target;
  if (Math.abs(diff) > opts.toleranceSec) throw new DurationMismatchError(videoSec, target);

  const audioIn = ["-ss", String(opts.audioStartSec), "-t", String(target), "-i", opts.audioFile];
  // The picture is re-encoded on purpose: with stream copy `-t` can only cut at a
  // keyframe, which left results ~0.2 s longer than the song (caught by tests/media.test.ts).
  // Longer video → trimmed at the song's end; shorter → last frame held. Never a time-stretch.
  const pad = diff < 0 ? `tpad=stop_mode=clone:stop_duration=${(-diff + 0.05).toFixed(3)},` : "";
  await runFfmpeg([
    "-i", opts.videoFile, ...audioIn,
    "-filter_complex", `[0:v]${pad}trim=duration=${target.toFixed(3)},setpts=PTS-STARTPTS[v]`,
    "-map", "[v]", "-map", "1:a:0", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-crf", "20",
    "-c:a", "aac", "-b:a", "192k", "-t", target.toFixed(3), "-movflags", "+faststart", opts.outFile,
  ]);

  const out = await probe(opts.outFile);
  if (!out.hasAudio) throw new AssemblyCheckError("The assembled video has no audio");
  if (Math.abs(out.durationSec - target) > 0.15)
    throw new AssemblyCheckError(`The assembled video is ${out.durationSec.toFixed(2)} s instead of ${target.toFixed(2)} s`);
  return {
    durationSec: out.durationSec,
    hasAudio: out.hasAudio,
    videoDurationSec: videoSec,
    audioDurationSec: out.audioDurationSec ?? out.durationSec,
  };
}
