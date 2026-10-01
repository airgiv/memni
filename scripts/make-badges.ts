/**
 * Renders the labels the demo adapters stamp on their placeholder output, so
 * nobody can mistake a demo collage or clip for a real generation.
 *   npm run media:badges
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const FONT = "DejaVu Sans, Arial, Helvetica, sans-serif";
const dir = join(process.cwd(), "public", "demo");
mkdirSync(dir, { recursive: true });

async function badge(text: string, file: string, bg: string, fg: string) {
  const width = Math.round(text.length * 13.5 + 48);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="48">
    <rect width="${width}" height="48" rx="24" fill="${bg}"/>
    <text x="24" y="32" font-family="${FONT}" font-size="22" font-weight="bold" fill="${fg}">${text}</text></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(join(dir, file));
  console.log(`✓ ${file}`);
}

await badge("DEMO · not generated", "badge-demo.png", "#1c1c1f", "#ffffff");
await badge("Placeholder collage", "badge-scene.png", "#1c1c1f", "#ffb38a");
await badge("DEMO · original footage, not your result", "badge-video.png", "#1c1c1f", "#ffffff");
