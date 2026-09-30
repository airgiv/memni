/**
 * Draws the DEMO materials for every template: an illustrated reference frame,
 * a short synthetic motion clip, a synthesised tune and a finished example.
 * Nothing here is taken from a real video: the point is to have honest,
 * clearly labelled placeholders until licensed materials exist.
 *
 *   npx tsx scripts/make-demo-media.ts
 *
 * Also renders the «ДЕМО» badges the demo image adapter stamps on examples,
 * so the server never depends on system fonts at runtime.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import ffmpegPath from "ffmpeg-static";
import { EXAMPLE_TEMPLATES as TEMPLATES, type TemplateDef, type RoleTone } from "../src/lib/templates";

const FPS = 24;
const W = 720;
const H = 1280;
const FONT = "DejaVu Sans, sans-serif";

const TONE: Record<RoleTone, string> = {
  flame: "#ff5b1a",
  blue: "#0582ff",
  plum: "#8e0d99",
  acid: "#d7ff3c",
  bubble: "#ff9be0",
  sky: "#8fd3ff",
};

function ffmpeg(args: string[]) {
  execFileSync(ffmpegPath as unknown as string, ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
}

function background(t: TemplateDef): string {
  if (t.id === "hotel-lobby") {
    return `
      <rect width="${W}" height="${H}" fill="#3a2a22"/>
      <rect y="0" width="${W}" height="${H * 0.62}" fill="#6b4a36"/>
      ${Array.from({ length: 6 }, (_, i) => `<rect x="${40 + i * 120}" y="120" width="70" height="420" rx="35" fill="#7d5a43"/>`).join("")}
      <circle cx="${W / 2}" cy="90" r="70" fill="#ffd27a" opacity="0.9"/>
      <circle cx="${W / 2}" cy="90" r="120" fill="#ffd27a" opacity="0.18"/>
      <rect y="${H * 0.62}" width="${W}" height="${H * 0.38}" fill="#2b1f19"/>
      ${Array.from({ length: 8 }, (_, i) => `<rect x="${i * 90}" y="${H * 0.62}" width="45" height="${H * 0.38}" fill="#33251d"/>`).join("")}
      <rect x="430" y="${H * 0.5}" width="290" height="${H * 0.14}" rx="18" fill="#c89b6d"/>
      <rect x="430" y="${H * 0.5}" width="290" height="22" rx="10" fill="#e3bf93"/>
      <text x="575" y="${H * 0.58}" font-family="${FONT}" font-size="28" fill="#6b4a36" text-anchor="middle" font-weight="bold">RECEPTION</text>`;
  }
  if (t.id === "morning-show") {
    return `
      <rect width="${W}" height="${H}" fill="#12304f"/>
      <rect x="60" y="140" width="${W - 120}" height="380" rx="28" fill="#1d4f80"/>
      <text x="${W / 2}" y="350" font-family="${FONT}" font-size="64" fill="#8fd3ff" text-anchor="middle" font-weight="bold">УТРО</text>
      <rect y="${H * 0.7}" width="${W}" height="${H * 0.3}" fill="#0b1d30"/>
      <rect x="80" y="${H * 0.66}" width="${W - 160}" height="180" rx="24" fill="#f5f5f5"/>
      <rect x="80" y="${H * 0.66}" width="${W - 160}" height="30" rx="12" fill="#ff5b1a"/>`;
  }
  // stairs
  const steps = Array.from({ length: 9 }, (_, i) => {
    const y = 250 + i * 110;
    return `<rect x="${-20 + i * 10}" y="${y}" width="${W + 40}" height="110" fill="${i % 2 ? "#d9d2c5" : "#cfc6b6"}"/>`;
  }).join("");
  return `<rect width="${W}" height="${H}" fill="#efe9dd"/>${steps}
    <rect x="0" y="0" width="${W}" height="250" fill="#b7c9d9"/>`;
}

/** A friendly faceless figure inside a role region; `phase` animates the bob. */
function figure(t: TemplateDef, roleIndex: number, phase: number): string {
  const role = t.roles[roleIndex];
  const r = role.region;
  const x = r.x * W;
  const y = r.y * H;
  const w = r.w * W;
  const h = r.h * H;
  const bob = Math.sin(phase * Math.PI * 2 + roleIndex) * h * 0.02;
  const sway = Math.sin(phase * Math.PI * 2 + roleIndex * 1.7) * 4;
  const cx = x + w / 2;
  const headR = Math.min(w, h) * 0.17;
  const headY = y + headR + h * 0.04 + bob;
  const bodyTop = headY + headR * 1.05;
  const color = TONE[role.tone];
  const mic =
    t.id === "hotel-lobby"
      ? `<line x1="${cx + (roleIndex === 0 ? w * 0.34 : -w * 0.34)}" y1="${headY + headR * 0.8}" x2="${cx + (roleIndex === 0 ? w * 0.34 : -w * 0.34)}" y2="${y + h}" stroke="#1b1b1b" stroke-width="8"/>
         <circle cx="${cx + (roleIndex === 0 ? w * 0.3 : -w * 0.3)}" cy="${headY + headR * 0.7}" r="16" fill="#1b1b1b"/>`
      : "";
  return `<g transform="rotate(${sway} ${cx} ${y + h})">
    <rect x="${cx - w * 0.3}" y="${bodyTop}" width="${w * 0.6}" height="${y + h - bodyTop}" rx="${w * 0.2}" fill="${color}"/>
    <circle cx="${cx}" cy="${headY}" r="${headR}" fill="#f1d3b5"/>
    <circle cx="${cx}" cy="${headY}" r="${headR}" fill="none" stroke="${color}" stroke-width="6"/>
  </g>${mic}`;
}

function frameSvg(t: TemplateDef, phase: number, label: string | null): string {
  const figures = t.roles.map((_, i) => figure(t, i, phase)).join("");
  const badge = label
    ? `<rect x="24" y="24" width="${label.length * 17 + 40}" height="52" rx="26" fill="#282828" opacity="0.85"/>
       <text x="44" y="59" font-family="${FONT}" font-size="26" fill="#d7ff3c" font-weight="bold">${label}</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${background(t)}${figures}${badge}</svg>`;
}

/** Synthesised loop: a kick on every beat, a bass line, a hi-hat. Different key per template. */
function audioExpr(t: TemplateDef): string {
  const base = t.id === "hotel-lobby" ? 55 : t.id === "morning-show" ? 65.4 : 49;
  const bpm = t.id === "hotel-lobby" ? 150 : 120;
  const beat = (60 / bpm).toFixed(4);
  const kick = `0.7*sin(2*PI*(45+90*exp(-mod(t,${beat})*40))*mod(t,${beat}))*exp(-mod(t,${beat})*9)`;
  const bass = `0.22*sin(2*PI*${base}*(1+0.5*gte(mod(t,${(Number(beat) * 8).toFixed(4)}),${(Number(beat) * 4).toFixed(4)}))*t)*(0.6+0.4*exp(-mod(t,${beat})*6))`;
  const hat = `0.05*(random(0)*2-1)*exp(-mod(t+${(Number(beat) / 2).toFixed(4)},${beat})*60)`;
  return `${kick}+${bass}+${hat}`;
}

async function renderFrames(t: TemplateDef, dir: string, label: string | null) {
  mkdirSync(dir, { recursive: true });
  const total = Math.round(t.durationSec * FPS);
  const bpm = t.id === "hotel-lobby" ? 150 : 120;
  for (let i = 0; i < total; i++) {
    const sec = i / FPS;
    const phase = (sec * bpm) / 60 / 2;
    const svg = frameSvg(t, phase, label);
    await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toFile(join(dir, `f${String(i).padStart(4, "0")}.jpg`));
  }
}

async function badge(text: string, file: string, bg: string, fg: string) {
  const width = Math.round(text.length * 15 + 48);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="48">
    <rect width="${width}" height="48" rx="24" fill="${bg}"/>
    <text x="24" y="32" font-family="${FONT}" font-size="22" font-weight="bold" fill="${fg}">${text}</text></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
}

/**
 * Role cutouts: one frame of the SOURCE video at the moment each role is
 * clearly visible (role.cutout.atSec), cropped to the role's region with a
 * little air around it. Done once per template, never per order.
 */
async function cutouts(t: TemplateDef, out: string, tmp: string) {
  mkdirSync(join(out, "roles"), { recursive: true });
  mkdirSync(tmp, { recursive: true });
  for (const role of t.roles) {
    const still = join(tmp, `${t.id}-${role.id}.png`);
    ffmpeg(["-ss", String(role.cutout.atSec), "-i", join(out, "source.mp4"), "-frames:v", "1", still]);
    // a 3:4 portrait from the top of the region: head and shoulders with some air
    const padX = 0.05 * W;
    const left = Math.max(0, Math.round(role.region.x * W - padX));
    const width = Math.min(W - left, Math.round(role.region.w * W + padX * 2));
    const top = Math.max(0, Math.round(role.region.y * H - 0.04 * H));
    const height = Math.min(H - top, Math.round((width * 4) / 3));
    await sharp(still)
      .extract({ left, top, width, height })
      .resize({ width: 640, withoutEnlargement: false })
      .jpeg({ quality: 86 })
      .toFile(join(process.cwd(), "public", role.cutout.src));
  }
}

async function main() {
  const tmp = join(process.cwd(), ".data", "tmp-media");
  if (process.argv.includes("--cutouts")) {
    for (const t of TEMPLATES) await cutouts(t, join(process.cwd(), "public", "templates", t.id), tmp);
    rmSync(tmp, { recursive: true, force: true });
    console.log("cutouts done");
    return;
  }
  for (const t of TEMPLATES) {
    const out = join(process.cwd(), "public", "templates", t.id);
    mkdirSync(out, { recursive: true });
    console.log(`→ ${t.id}`);

    await sharp(Buffer.from(frameSvg(t, 0, "ДЕМО-МАТЕРИАЛ"))).jpeg({ quality: 86 }).toFile(join(out, "frame.jpg"));

    // original audio track: exactly durationSec, AAC
    ffmpeg([
      "-f", "lavfi", "-i", `aevalsrc='${audioExpr(t)}':s=44100:d=${t.durationSec}`,
      "-af", "volume=0.9,afade=t=out:st=" + (t.durationSec - 0.3) + ":d=0.3",
      "-c:a", "aac", "-b:a", "128k", join(out, "audio.m4a"),
    ]);

    // motion reference: silent
    const srcFrames = join(tmp, t.id, "src");
    rmSync(srcFrames, { recursive: true, force: true });
    await renderFrames(t, srcFrames, "ДЕМО-МАТЕРИАЛ");
    ffmpeg([
      "-framerate", String(FPS), "-i", join(srcFrames, "f%04d.jpg"),
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "30", "-movflags", "+faststart", "-an",
      join(out, "source.mp4"),
    ]);

    // finished example with sound, clearly labelled as an example
    const exFrames = join(tmp, t.id, "ex");
    rmSync(exFrames, { recursive: true, force: true });
    await renderFrames(t, exFrames, "ПРИМЕР · ДЕМО");
    ffmpeg([
      "-framerate", String(FPS), "-i", join(exFrames, "f%04d.jpg"), "-i", join(out, "audio.m4a"),
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "30", "-c:a", "copy", "-shortest", "-movflags", "+faststart",
      join(out, "example.mp4"),
    ]);
    await cutouts(t, out, tmp);
  }

  const demo = join(process.cwd(), "public", "demo");
  mkdirSync(demo, { recursive: true });
  await badge("ДЕМО · не генерация", join(demo, "badge-demo.png"), "#282828", "#d7ff3c");
  await badge("Пример образа", join(demo, "badge-person.png"), "#ff5b1a", "#ffffff");
  await badge("Коллаж-заглушка сцены", join(demo, "badge-scene.png"), "#0582ff", "#ffffff");
  await badge("ДЕМО-РОЛИК · не ваш результат", join(demo, "badge-video.png"), "#282828", "#d7ff3c");
  writeFileSync(join(demo, "README.txt"), "Бейджи для демонстрационных примеров. Генерируются scripts/make-demo-media.ts\n");
  rmSync(tmp, { recursive: true, force: true });
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
