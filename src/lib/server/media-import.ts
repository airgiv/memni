/**
 * Prepares a meme's media once from the licensed source files: the fragment
 * for the landing (MP4 + WebM), the motion source, the original audio, the
 * reference frame, a 3:4 cutout and a square face crop per participant, and —
 * when a vertical edit is given — the phone version of the same fragment.
 * Used by `npm run media:import` and by the protected /admin/media page.
 */
import { mkdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { HOTEL_LOBBY_FRAGMENT, HOTEL_LOBBY_MOBILE_OFFSET } from "../../memes/hotel-lobby";
import { getMeme } from "../../memes";
import { runFfmpeg as ffmpeg } from "./media";

/** imports are one-off and may run on a small CPU: allow long encodes */
const runFfmpeg = (args: string[]) => ffmpeg(args, 15 * 60_000);
import { mediaFile } from "./media-files";

export async function importHotelLobby(horizontal: string, vertical: string | null, log: (line: string) => void = () => undefined) {
  const t = getMeme("hotel-lobby")!;
  const { startSec, endSec } = HOTEL_LOBBY_FRAGMENT;
  const dur = String(endSec - startSec);
  const f = (src: string) => mediaFile(src);
  const out = dirname(f(t.media.video.src));
  await mkdir(join(out, "roles"), { recursive: true });
  await mkdir(join(out, "faces"), { recursive: true });

  // exact cuts: decode from the start of the fragment and re-encode
  await runFfmpeg(["-ss", String(startSec), "-i", horizontal, "-t", dur, "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", f(t.media.source.src)]);
  log("source.mp4");
  await runFfmpeg(["-ss", String(startSec), "-i", horizontal, "-t", dur, "-vn", "-c:a", "aac", "-b:a", "192k", f(t.media.audio.src)]);
  log("audio.m4a");
  await runFfmpeg(["-ss", String(startSec), "-i", horizontal, "-t", dur, "-c:v", "libx264", "-profile:v", "main", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", f(t.media.video.src)]);
  log("example.mp4");
  if (t.media.video.webm)
    await runFfmpeg(["-i", f(t.media.video.src), "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "34", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4", "-c:a", "libopus", "-b:a", "128k", f(t.media.video.webm)]);
  log("example.webm");

  if (vertical && t.media.mobile) {
    const m = t.media.mobile;
    await runFfmpeg(["-ss", String(startSec - HOTEL_LOBBY_MOBILE_OFFSET), "-i", vertical, "-t", dur, "-vf", `scale=${m.poster.width}:-2`, "-c:v", "libx264", "-profile:v", "main", "-preset", "medium", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", f(m.video.src)]);
    if (m.video.webm) await runFfmpeg(["-i", f(m.video.src), "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "36", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4", "-c:a", "libopus", "-b:a", "128k", f(m.video.webm)]);
    await runFfmpeg(["-ss", "0.5", "-i", f(m.video.src), "-frames:v", "1", "-q:v", "3", f(m.poster.src)]);
    log("mobile.mp4 / mobile.webm / mobile.jpg");
  }

  // reference frame, then per participant: a 3:4 portrait and a square face crop
  await runFfmpeg(["-ss", String(t.media.referenceFrame.atSec), "-i", f(t.media.source.src), "-frames:v", "1", "-q:v", "2", f(t.media.referenceFrame.src)]);
  const meta = await sharp(f(t.media.referenceFrame.src)).metadata();
  const W = meta.width!;
  const H = meta.height!;
  for (const role of t.roles) {
    const still = join(out, `roles/${role.id}-still.png`);
    await runFfmpeg(["-ss", String(role.cutout.atSec), "-i", f(t.media.source.src), "-frames:v", "1", still]);
    const width = Math.min(W, Math.round((H * 3) / 4));
    const cx = (role.region.x + role.region.w / 2) * W;
    const left = Math.max(0, Math.min(W - width, Math.round(cx - width / 2)));
    await sharp(still).extract({ left, top: 0, width, height: H }).resize({ height: 960, kernel: "lanczos3" }).jpeg({ quality: 88 }).toFile(f(role.cutout.src));
    const r = role.face.region;
    const side = Math.round(Math.max(r.w * W, r.h * H));
    const fx = Math.max(0, Math.min(W - side, Math.round((r.x + r.w / 2) * W - side / 2)));
    const fy = Math.max(0, Math.min(H - side, Math.round((r.y + r.h / 2) * H - side / 2)));
    await sharp(still).extract({ left: fx, top: fy, width: side, height: side }).resize(192, 192, { kernel: "lanczos3" }).jpeg({ quality: 88 }).toFile(f(role.face.src));
    await rm(still, { force: true });
  }
  log(`frame.jpg, ${t.roles.length} cutouts and face crops`);
  const size = (await stat(f(t.media.video.src))).size;
  return { dir: out, fragment: `${startSec}–${endSec} s`, landingVideoBytes: size, vertical: Boolean(vertical) };
}
