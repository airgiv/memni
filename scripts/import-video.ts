/**
 * Imports the licensed source video(s) of Hotel Lobby once, when the meme is
 * prepared. Output goes to MEDIA_DIR/hotel-lobby (default .media,
 * never committed) and is served at /media/hotel-lobby/.
 *
 *   npm run media:import -- /path/to/horizontal.mp4 [/path/to/vertical.mp4]
 *
 * In production the same import runs from the protected /admin/media page.
 */
import { existsSync } from "node:fs";
import { importHotelLobby } from "../src/lib/server/media-import";

const [horizontal, vertical] = process.argv.slice(2);
if (!horizontal || !existsSync(horizontal) || (vertical && !existsSync(vertical))) {
  console.error("Usage: npm run media:import -- /path/to/horizontal.mp4 [/path/to/vertical.mp4]");
  process.exit(1);
}
importHotelLobby(horizontal, vertical ?? null, (l) => console.log(`✓ ${l}`)).then(
  (r) => console.log(`✓ fragment ${r.fragment} → ${r.dir}`),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
