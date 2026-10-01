/**
 * Imports the real source video of a template — once, when the template is
 * prepared. Nothing here runs per user or per order.
 *
 *   npm run media:import -- /path/to/video.mp4            (Hotel Lobby)
 *
 * Writes to public/templates/hotel-lobby/ (gitignored — the licensed clip is
 * not committed):
 *   source.mp4   the fragment without sound — motion and timing for the video model
 *   audio.m4a    the ORIGINAL audio of the same fragment, cut exactly
 *   example.mp4  the fragment with its sound — the landing background (H.264/AAC)
 *   example.webm the same in VP9/Opus — browsers without H.264 (e.g. open-source Chromium)
 *   frame.jpg    reference frame at referenceFrame.atSec (roles are marked on it)
 *   roles/*.jpg  a 3:4 portrait cutout of each person at role.cutout.atSec
 *   faces/*.jpg  a square face crop of each person (participant thumbnails)
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import ffmpegPath from "ffmpeg-static";
import { getMeme } from "../src/memes";
import { HOTEL_LOBBY_FRAGMENT } from "../src/memes/hotel-lobby";

const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.error("Usage: npm run media:import -- /path/to/hotel-lobby.mp4");
  process.exit(1);
}
const t = getMeme("hotel-lobby")!;
const { startSec, endSec } = HOTEL_LOBBY_FRAGMENT;
const dur = endSec - startSec;
const out = join(process.cwd(), "public", "templates", t.id);
mkdirSync(join(out, "roles"), { recursive: true });
mkdirSync(join(out, "faces"), { recursive: true });

const ff = (args: string[]) => execFileSync(ffmpegPath as unknown as string, ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });

// exact cuts: decode from the start of the fragment and re-encode
ff(["-ss", String(startSec), "-i", file, "-t", String(dur), "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", join(out, "source.mp4")]);
ff(["-ss", String(startSec), "-i", file, "-t", String(dur), "-vn", "-c:a", "aac", "-b:a", "192k", join(out, "audio.m4a")]);
ff(["-ss", String(startSec), "-i", file, "-t", String(dur), "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", join(out, "example.mp4")]);

ff(["-i", join(out, "example.mp4"), "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "34", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4", "-c:a", "libopus", "-b:a", "128k", join(out, "example.webm")]);

async function main() {
  const frameAt = t.media.referenceFrame.atSec;
  ff(["-ss", String(frameAt), "-i", join(out, "source.mp4"), "-frames:v", "1", "-q:v", "2", join(out, "frame.jpg")]);
  const meta = await sharp(join(out, "frame.jpg")).metadata();
  const W = meta.width!;
  const H = meta.height!;
  for (const role of t.roles) {
    const still = join(out, `roles/${role.id}-still.png`);
    ff(["-ss", String(role.cutout.atSec), "-i", join(out, "source.mp4"), "-frames:v", "1", still]);
    // a 3:4 portrait: full frame height, centred on the role's region
    const height = H;
    const width = Math.min(W, Math.round((height * 3) / 4));
    const cx = (role.region.x + role.region.w / 2) * W;
    const left = Math.max(0, Math.min(W - width, Math.round(cx - width / 2)));
    await sharp(still)
      .extract({ left, top: 0, width, height })
      .resize({ height: 960, kernel: "lanczos3" })
      .jpeg({ quality: 88 })
      .toFile(join(process.cwd(), "public", role.cutout.src));
    // square face crop for the round participant thumbnails
    const f = role.face.region;
    const side = Math.round(Math.max(f.w * W, f.h * H));
    const fx = Math.max(0, Math.min(W - side, Math.round((f.x + f.w / 2) * W - side / 2)));
    const fy = Math.max(0, Math.min(H - side, Math.round((f.y + f.h / 2) * H - side / 2)));
    await sharp(still)
      .extract({ left: fx, top: fy, width: side, height: side })
      .resize(192, 192, { kernel: "lanczos3" })
      .jpeg({ quality: 88 })
      .toFile(join(process.cwd(), "public", role.face.src));
    execFileSync("rm", ["-f", still]);
  }
  for (const f of ["source.mp4", "audio.m4a", "example.mp4", "example.webm", "frame.jpg"]) console.log(`✓ ${f} ${(statSync(join(out, f)).size / 1024).toFixed(0)} KB`);
  console.log(`✓ ${t.roles.length} cutouts and face crops, fragment ${startSec}–${endSec} s`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
