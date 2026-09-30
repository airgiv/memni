import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assembleWithOriginalAudio, DurationMismatchError, probe, runFfmpeg } from "../src/lib/server/media";

const AUDIO = join(process.cwd(), "public/templates/hotel-lobby/audio.m4a");

async function silentVideo(dir: string, sec: number) {
  const f = join(dir, `v${sec}.mp4`);
  await runFfmpeg(["-f", "lavfi", "-i", `color=c=blue:s=180x320:d=${sec}:r=24`, "-c:v", "libx264", "-pix_fmt", "yuv420p", f]);
  return f;
}

test("muxes the original audio, keeps its exact length and verifies the result", async () => {
  const dir = await mkdtemp(join(tmpdir(), "memni-t-"));
  for (const sec of [8, 8.2, 7.8]) {
    const out = join(dir, `out${sec}.mp4`);
    const meta = await assembleWithOriginalAudio({ videoFile: await silentVideo(dir, sec), audioFile: AUDIO, audioStartSec: 0, audioEndSec: 8, outFile: out, toleranceSec: 0.35 });
    assert.equal(meta.hasAudio, true);
    const p = await probe(out);
    assert.ok(p.hasAudio && p.hasVideo);
    assert.ok(Math.abs(p.durationSec - 8) < 0.15, `${sec}s → ${p.durationSec}`);
  }
});

test("a big duration difference is an explicit error, never a silent time-stretch", async () => {
  const dir = await mkdtemp(join(tmpdir(), "memni-t-"));
  await assert.rejects(
    assembleWithOriginalAudio({ videoFile: await silentVideo(dir, 5), audioFile: AUDIO, audioStartSec: 0, audioEndSec: 8, outFile: join(dir, "x.mp4"), toleranceSec: 0.35 }),
    DurationMismatchError,
  );
});
