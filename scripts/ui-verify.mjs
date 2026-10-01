/**
 * Browser verification of the Мемме prototype (phone + desktop): sheet
 * gestures and keyboard, reduced motion, hearts, uploads, saved people,
 * outfits, preview invalidation, language switching, both video paths,
 * duplicate clicks, reload and failure recovery. Prints a JSON report.
 *
 * Needs a running site + worker in demo mode and Playwright (not a project
 * dependency):  npx -y playwright@1 ... or a local install, then
 *   node scripts/ui-verify.mjs http://localhost:3000 ./ui-shots
 * CHROMIUM_PATH can point at a specific Chromium build.
 */
import { chromium, devices } from "playwright";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const sharp = createRequire(join(process.cwd(), "package.json"))("sharp");
const [, , BASE = "http://localhost:3000", OUT = "ui-shots"] = process.argv;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const checks = [];
const check = (name, pass, detail = "") => checks.push({ name, pass: Boolean(pass), detail: typeof detail === "string" ? detail : JSON.stringify(detail) });
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const photo = async (hue, file, w = 1100, h = 1400) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="hsl(${hue},45%,62%)"/><circle cx="${w / 2}" cy="${h * 0.35}" r="${w * 0.21}" fill="#e8c4a0"/><rect x="${w * 0.22}" y="${h * 0.55}" width="${w * 0.56}" height="${h * 0.47}" rx="90" fill="hsl(${hue + 40},55%,35%)"/></svg>`;
  writeFileSync(file, await sharp(Buffer.from(svg)).jpeg().toBuffer());
  return file;
};
let shotN = 0;
const shot = async (page, name) => page.screenshot({ path: `${OUT}/v-${String(++shotN).padStart(2, "0")}-${name}.png` });
const watch = (page, tag) => {
  page.on("pageerror", (e) => errors.push(`${tag}: ${e.message.slice(0, 200)}`));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(`${tag}: ${m.text().slice(0, 200)}`));
};
const heartsNow = (page) => page.evaluate(() => document.querySelectorAll('[aria-hidden] svg path[d^="M12 21s"]').length);
const sheetState = (page) =>
  page.evaluate(() => {
    const h = document.querySelector('button[aria-controls="sheet-body"]');
    const body = document.getElementById("sheet-body");
    return { expanded: h?.getAttribute("aria-expanded") === "true", scrollTop: body?.scrollTop ?? -1, pageY: window.scrollY, docTop: document.scrollingElement.scrollTop };
  });

/* ═════════════ mobile: landing, sheet, hearts, social ═════════════ */
{
  const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "en-US" });
  const page = await ctx.newPage();
  watch(page, "mobile");
  const cdp = await ctx.newCDPSession(page);
  const touch = async (points) => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: points[0][0], y: points[0][1] }] });
    for (const [x, y] of points.slice(1)) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
      await sleep(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(600);
  };
  const line = (x, y0, y1, steps = 12) => Array.from({ length: steps + 1 }, (_, i) => [x, y0 + ((y1 - y0) * i) / steps]);
  // a real touch gesture synthesized by Chromium (touchstart/move/end + native scrolling)
  const gesture = async (x, y, dy) => {
    await cdp.send("Input.synthesizeScrollGesture", { x, y, yDistance: dy, gestureSourceType: "touch", speed: 900, preventFling: true });
    await sleep(600);
  };

  await page.goto(`${BASE}/en/memes/hotel-lobby`, { waitUntil: "networkidle" });
  await sleep(1500);
  const vp = page.viewportSize();
  const land = await page.evaluate(() => {
    const sheet = document.querySelector("[data-sheet]").getBoundingClientRect();
    const rail = [...document.querySelectorAll("button[aria-label=Like], button[aria-label=Comments], button[aria-label=Share]")].map((b) => b.getBoundingClientRect());
    const video = document.querySelector("video").getBoundingClientRect();
    const primary = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Replace people").getBoundingClientRect();
    return {
      text: document.body.innerText,
      h1: document.querySelector("h1")?.textContent,
      railAboveSheet: rail.every((r) => r.bottom <= sheet.top),
      railRight: rail.every((r) => r.right > window.innerWidth - 80),
      video: [video.x, video.y, video.width, video.height],
      vw: window.innerWidth,
      vh: window.innerHeight,
      hScroll: document.documentElement.scrollWidth > window.innerWidth,
      primaryVisible: primary.bottom <= window.innerHeight && primary.top >= 0,
      primaryH: primary.height,
      videoPaused: document.querySelector("video").paused,
      muted: document.querySelector("video").muted,
      src: document.querySelector("video").currentSrc,
    };
  });
  await shot(page, "m-landing");
  check("landing: title and the one primary action", land.h1 === "Hotel Lobby" && land.text.includes("Starring you and your friends"), land.h1);
  check("landing: no price shown", !/\$\s?\d|\d\s?\$|₽|€|USD|RUB|EUR/.test(land.text));
  check("landing: video fills the viewport edge to edge", land.video[0] === 0 && land.video[1] === 0 && land.video[2] === land.vw && land.video[3] === land.vh, land.video);
  check("landing: video autoplays muted, inline", !land.videoPaused && land.muted, land.src);
  check("landing: Like/Comments/Share on the right, above the collapsed sheet", land.railAboveSheet && land.railRight);
  check("landing: primary action fully visible when collapsed; 48 px on phones", land.primaryVisible && Math.round(land.primaryH) === 48, land.primaryH);
  check("landing: no horizontal page scroll", !land.hScroll);
  await sleep(3500);
  const h1 = await heartsNow(page);
  check("hearts: a light stream is running on the landing", h1 > 0 && h1 < 12, `${h1} in flight`);
  await page.getByRole("button", { name: "Like", exact: true }).click();
  await sleep(250);
  const h2 = await heartsNow(page);
  check("hearts: Like adds a burst and is pressed", h2 >= h1 + 3 && (await page.getByRole("button", { name: "Liked" }).getAttribute("aria-pressed")) === "true", `${h1} → ${h2}`);
  // hidden tab: no new hearts
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await sleep(4500);
  const hidden = await heartsNow(page);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const frozen = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && a.effect?.target?.closest?.("[aria-hidden]")).length);
  check("hearts: stop spawning in a hidden tab", hidden <= h2, `${h2} → ${hidden} after 4.5 s hidden`);
  await page.getByRole("button", { name: "Comments" }).click();
  const dlg = await page.getByRole("dialog").innerText();
  check("comments: honest empty state", /not available yet/.test(dlg) && /made-up/.test(dlg));
  await page.keyboard.press("Escape");

  // sheet: wheel/drag/keyboard
  let st = await sheetState(page);
  check("sheet: starts collapsed", !st.expanded);
  const handle = page.locator('button[aria-controls="sheet-body"]');
  const hb = await handle.boundingBox();
  await touch(line(vp.width / 2, hb.y + 10, 120));
  st = await sheetState(page);
  check("sheet: dragging up (touch) expands it", st.expanded);
  const sheetTop = await page.evaluate(() => document.querySelector("[data-sheet]").getBoundingClientRect().top);
  check("sheet: expanded to nearly the full viewport", sheetTop < 30, sheetTop);
  await shot(page, "m-expanded");
  // scroll content by touch: page must not move, sheet stays
  await touch(line(vp.width / 2, 560, 200, 15));
  await touch(line(vp.width / 2, 560, 200, 15));
  st = await sheetState(page);
  check("sheet: only its content scrolls; the page stays put", st.expanded && st.scrollTop > 100 && st.docTop === 0 && st.pageY === 0, st);
  // drag down while not at top: scrolls content back, does not collapse
  const before = st.scrollTop;
  await touch(line(vp.width / 2, 250, 450, 15));
  st = await sheetState(page);
  check("sheet: a downward drag while reading scrolls the text, it does not dismiss", st.expanded && st.scrollTop < before, `${before} → ${st.scrollTop}`);
  // back to top, then a new downward drag from the content collapses
  await page.evaluate(() => (document.getElementById("sheet-body").scrollTop = 0));
  await sleep(200);
  await touch(line(vp.width / 2, 200, 560, 15));
  st = await sheetState(page);
  check("sheet: dragging down from the content at its top collapses it", !st.expanded, st);
  // keyboard on the handle
  await handle.focus();
  await page.keyboard.press("Enter");
  await sleep(500);
  check("sheet: handle is a button — Enter expands", (await sheetState(page)).expanded);
  await page.keyboard.press("ArrowDown");
  await sleep(500);
  check("sheet: ArrowDown collapses", !(await sheetState(page)).expanded);
  await page.keyboard.press("ArrowUp");
  await sleep(500);
  await page.keyboard.press("Escape");
  await sleep(500);
  check("sheet: ArrowUp expands, Escape collapses", !(await sheetState(page)).expanded);
  const inertWhenCollapsed = await page.evaluate(() => document.getElementById("sheet-body").inert);
  check("sheet: collapsed content is inert (not tabbable) but present in the DOM", inertWhenCollapsed && (await page.locator("#h-origin").count()) === 1);
  await ctx.close();
}

/* ═════════════ desktop: wheel, keyboard focus, sizes ═════════════ */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
  const page = await ctx.newPage();
  watch(page, "desktop");
  await page.goto(`${BASE}/en/memes/hotel-lobby`, { waitUntil: "networkidle" });
  await sleep(1000);
  const box = await page.locator("[data-sheet]").boundingBox();
  check("desktop: widget is width-constrained and floats above the bottom edge", box.width <= 600 && box.y + box.height <= 900 - 20, box);
  const ph = await page.getByRole("button", { name: "Replace people" }).boundingBox();
  check("desktop: compact primary button (40 px)", Math.round(ph.height) === 40, ph.height);
  await page.mouse.move(720, box.y + 40);
  await page.mouse.wheel(0, 120);
  await sleep(700);
  check("desktop: wheel/trackpad over the collapsed sheet expands it", (await sheetState(page)).expanded);
  await page.mouse.move(720, 400);
  await page.mouse.wheel(0, 600);
  await sleep(400);
  let st = await sheetState(page);
  check("desktop: wheel then scrolls the content, not the page", st.scrollTop > 0 && st.docTop === 0, st);
  // a wheel gesture that started mid-text does not collapse when it reaches the top
  await page.mouse.wheel(0, -2000);
  await sleep(100);
  check("desktop: scrolling up to the top while reading does not collapse", (await sheetState(page)).expanded);
  await sleep(400);
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, -80);
    await sleep(30);
  }
  await sleep(600);
  check("desktop: a new upward wheel gesture at the top collapses it", !(await sheetState(page)).expanded);
  // mouse drag on the handle
  const hb = await page.locator('button[aria-controls="sheet-body"]').boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, hb.y - 200, { steps: 8 });
  await page.mouse.move(hb.x + hb.width / 2, hb.y - 500, { steps: 8 });
  await page.mouse.up();
  await sleep(700);
  check("desktop: dragging the handle with a mouse expands it", (await sheetState(page)).expanded);
  await page.keyboard.press("Escape");
  await sleep(500);
  // keyboard focus is visible
  await page.goto(`${BASE}/en/memes/hotel-lobby`, { waitUntil: "networkidle" });
  let reached = null;
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    const f = await page.evaluate(() => {
      const el = document.activeElement;
      const cs = getComputedStyle(el);
      return { label: el.getAttribute("aria-label") || el.textContent.trim().slice(0, 30), outline: cs.outlineStyle, ow: cs.outlineWidth };
    });
    if (f.label === "Replace people") {
      reached = f;
      break;
    }
  }
  check("keyboard: Tab reaches the primary action with a visible focus ring", reached && reached.outline !== "none" && reached.ow !== "0px", reached);
  await shot(page, "d-focus");
  // hover changes colour only
  const btn = page.getByRole("button", { name: "Replace people" });
  const s0 = await btn.evaluate((b) => ({ r: b.getBoundingClientRect().toJSON(), t: getComputedStyle(b).transform, txt: b.textContent }));
  await btn.hover();
  await sleep(250);
  const s1 = await btn.evaluate((b) => ({ r: b.getBoundingClientRect().toJSON(), t: getComputedStyle(b).transform, txt: b.textContent, bg: getComputedStyle(b).backgroundColor }));
  check("hover: no movement or text animation", JSON.stringify(s0.r) === JSON.stringify(s1.r) && s1.t === "none" && s0.txt === s1.txt, s1.bg);
  await ctx.close();
}

/* ═════════════ reduced motion ═════════════ */
{
  const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "en-US", reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/en/memes/hotel-lobby`, { waitUntil: "networkidle" });
  await sleep(4000);
  const r = await page.evaluate(() => ({
    paused: document.querySelector("video").paused,
    hearts: document.querySelectorAll('[aria-hidden] svg path[d^="M12 21s"]').length,
    sheetTransition: getComputedStyle(document.querySelector("[data-sheet]")).transitionDuration,
  }));
  check("reduced motion: no hearts, no autoplay, no sheet animation", r.hearts === 0 && r.paused && /^0s/.test(r.sheetTransition), r);
  await ctx.close();
}

/* ═════════════ browser language suggestion (no redirect) ═════════════ */
{
  const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "ru-RU" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/en/memes/hotel-lobby`, { waitUntil: "networkidle" });
  await sleep(800);
  const status = await page.getByRole("status").filter({ hasText: "Русский" }).count();
  check("language: a Russian browser gets a suggestion, the English URL is kept", status === 1 && page.url().includes("/en/memes/hotel-lobby"), page.url());
  await shot(page, "m-suggest");
  await ctx.close();
}

/* ═════════════ catalog ═════════════ */
{
  const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "en-US" });
  const page = await ctx.newPage();
  watch(page, "catalog");
  await page.goto(`${BASE}/en`, { waitUntil: "networkidle" });
  const cols = await page.evaluate(() => getComputedStyle(document.querySelector("main ul")).gridTemplateColumns.split(" ").length);
  check("catalog: two cards per row on phones", cols === 2, cols);
  await shot(page, "m-catalog");
  await page.getByPlaceholder("Search memes").fill("zzz");
  check("catalog: search filters", (await page.getByText("Nothing found.").count()) === 1);
  await ctx.close();
}

/* ═════════════ the creation flow (mobile) ═════════════ */
{
  const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "en-US" });
  const page = await ctx.newPage();
  watch(page, "flow");
  const api = (path, init) => page.evaluate(async ([p, i]) => (await fetch(p, i ? { method: i.method, headers: { "content-type": "application/json" }, body: JSON.stringify(i.json) } : undefined)).json(), [path, init]);
  await page.goto(`${BASE}/en/memes/hotel-lobby`, { waitUntil: "networkidle" });
  await api("/api/demo", { method: "POST", json: { resetQuota: true, failPreview: false, failVideo: false } });
  await api("/api/billing", { method: "POST", json: { country: "US" } });
  // start from a clean slate of saved people for this browser
  const old = await api("/api/people");
  for (const p of old) await page.evaluate((id) => fetch(`/api/people/${id}`, { method: "DELETE" }), p.id);
  await page.reload({ waitUntil: "networkidle" });
  const jobsBefore = (await api("/api/jobs")).length;

  await page.getByRole("button", { name: "Replace people" }).click();
  await page.getByText("You’re replacing").waitFor();
  const cur = () => page.evaluate(() => [...document.querySelectorAll('nav [aria-current="step"]')].map((e) => e.getAttribute("aria-label")));
  check("flow: first participant is current (aria-current=step), no 'Step 1 of 2' text", (await cur())[0]?.startsWith("Left") && !/step \d+ of/i.test(await page.evaluate(() => document.body.innerText)), await cur());
  const spot = await page.evaluate(() => document.querySelector("video").style.objectPosition);
  check("flow: the video stays behind the widget and centres on this participant", spot && !spot.startsWith("0px 0px"), spot);
  await shot(page, "f-p1-empty");

  // upload validation
  writeFileSync(`${OUT}/not-a-photo.txt`, "hello");
  await page.locator("input[type=file]").setInputFiles(`${OUT}/not-a-photo.txt`);
  await sleep(500);
  const t1 = await page.locator("[data-sonner-toast]").last().innerText().catch(() => "");
  check("upload: a non-image is refused with a clear message", /JPEG, PNG or WebP/.test(t1), t1);
  await page.locator("input[type=file]").setInputFiles(await photo(10, `${OUT}/tiny.jpg`, 300, 300));
  const t2 = await page.locator("[data-sonner-toast]").filter({ hasText: "too small" }).first().innerText({ timeout: 8000 }).catch(() => "");
  check("upload: a too-small photo is refused by the server", /too small/.test(t2), t2);

  await page.locator("input[type=file]").setInputFiles(await photo(20, `${OUT}/a1.jpg`));
  await page.getByRole("button", { name: "Continue" }).and(page.locator(":enabled")).waitFor({ timeout: 20000 });
  const thumb = await page.locator("nav ol li button").first().locator("img").getAttribute("src");
  check("rail: after upload the thumbnail shows the new person, with a tick", thumb.startsWith("/api/files/photo/") && (await cur())[0] === "Left, photo added", thumb);
  await page.locator("input[type=file]").setInputFiles(await photo(30, `${OUT}/a2.jpg`, 1100, 2200));
  await page.locator('img[alt^="Photo 2"]').waitFor();
  await page.locator("input[type=file]").setInputFiles(await photo(40, `${OUT}/a3.jpg`));
  await page.locator('img[alt^="Photo 3"]').waitFor();
  check("upload: 1–3 photos — the add tile disappears at 3", (await page.getByRole("button", { name: "Add photo" }).count()) === 0);

  // outfit: random is drawn once and survives a reload
  await page.getByRole("combobox", { name: "Outfit" }).click();
  await shot(page, "f-outfits");
  const options = await page.getByRole("option").allInnerTexts();
  check("outfit: compact dropdown with the configured options", ["Original outfit", "Outfit from my photos", "Random outfit", "Hotel bathrobe"].every((o) => options.includes(o)), options);
  await page.getByRole("option", { name: "Random outfit" }).click();
  await page.getByText(/^Drawn:/).waitFor();
  const drawn = await page.getByText(/^Drawn:/).innerText();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText(/^Drawn:/).waitFor();
  check("outfit: the random draw is stored (same after reload)", (await page.getByText(/^Drawn:/).innerText()) === drawn, drawn);
  await page.getByRole("combobox", { name: "Outfit" }).click();
  await page.getByRole("option", { name: "Describe an outfit" }).click();
  await page.getByRole("textbox", { name: "Describe the outfit" }).fill("white tennis outfit");
  await page.getByRole("textbox", { name: "Describe the outfit" }).blur();
  await sleep(600);
  // appearance
  await page.getByRole("button", { name: "Adjust appearance" }).click();
  await page.getByRole("radio", { name: "Neutral" }).click();
  await sleep(600);
  check("appearance: 'As in photos' by default; a choice is stored", (await page.getByRole("radio", { name: "Neutral" }).getAttribute("aria-checked")) === "true");
  await shot(page, "f-p1-filled");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Orange shirt, dark sunglasses").waitFor();
  check("rail: Continue moves to the next participant", (await cur())[0]?.startsWith("Right"), await cur());

  // saved people dialog lists the saved person; "don't save" for the second one
  await page.getByRole("button", { name: "Saved people" }).click();
  const listed = await page.getByRole("dialog").innerText();
  check("saved people: the first person is offered here", /Person 1/.test(listed), listed.slice(0, 120));
  await page.keyboard.press("Escape");
  await page.getByRole("switch", { name: "Save to People" }).click();
  check("save opt-out: compact switch, explained in one line", /Used for this video only/.test(await page.evaluate(() => document.body.innerText)));
  await page.locator("input[type=file]").setInputFiles(await photo(200, `${OUT}/b1.jpg`));
  await page.getByRole("button", { name: "Continue" }).and(page.locator(":enabled")).waitFor({ timeout: 20000 });
  const people = await api("/api/people");
  check("save opt-out: the second person is not kept in People", people.filter((p) => p.saved).length === 1 && people.some((p) => !p.saved));

  // back to participant 1 via its thumbnail — nothing lost
  await page.locator("nav ol li button").first().click();
  await page.getByText("Striped shirt, white sunglasses").waitFor();
  check("rail: going back keeps photos and settings", (await page.locator('img[alt^="Photo "]').count()) === 3 && (await page.getByRole("textbox", { name: "Describe the outfit" }).inputValue()) === "white tennis outfit");

  // language switch keeps the draft
  const draftId = new URL(page.url()).searchParams.get("d");
  await page.getByRole("button", { name: "Back to the meme" }).click();
  await page.getByRole("button", { name: "Show details" }).click();
  await sleep(600);
  await page.locator("#sheet-body").evaluate((b) => (b.scrollTop = b.scrollHeight));
  await page.getByRole("combobox", { name: "Language" }).click();
  await page.getByRole("option", { name: "Русский" }).click();
  await page.waitForURL(/\/ru\/memes\/hotel-lobby/);
  await page.getByRole("button", { name: "Заменить людей" }).waitFor();
  check("language: switching keeps the meme and the draft in the URL", new URL(page.url()).searchParams.get("d") === draftId && (await page.evaluate(() => document.documentElement.lang)) === "ru", page.url());
  await page.getByRole("button", { name: "Заменить людей" }).click();
  await page.getByRole("heading", { name: "Состав" }).waitFor();
  check("language: the same draft continues in Russian (both people present)", (await page.locator("ul li button img").count()) >= 4);
  await shot(page, "f-review-ru");

  // preview path (in Russian; billing stays US → dollars)
  await page.getByRole("button", { name: /Сначала фото-превью/ }).click();
  await page.getByText("Делаем превью…").waitFor();
  const glow = await page.evaluate(() => document.querySelector(".edge-glow").dataset.on);
  check("generation: background dims and the edge glow turns on", glow === "true");
  await shot(page, "f-preview-pending");
  await page.getByRole("button", { name: /Новый вариант/ }).waitFor({ timeout: 30000 });
  await shot(page, "f-preview-ready");
  // reload restores the preview step
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Превью" }).waitFor();
  check("reload: the preview step and its result come back", (await page.locator('img[alt^="Превью"]').count()) === 1);
  // invalidate by changing an outfit
  await page.locator("nav ol li button").nth(1).click();
  await page.getByRole("combobox", { name: "Образ" }).click();
  await page.getByRole("option", { name: "Гостиничный халат" }).click();
  await sleep(700);
  await page.locator("nav ol li button").last().click();
  await page.getByRole("button", { name: /Сначала фото-превью/ }).waitFor();
  await page.goto(page.url().replace("s=review", "s=preview"));
  await page.getByRole("heading", { name: "Превью" }).waitFor();
  const stale = await page.evaluate(() => document.body.innerText);
  check("invalidation: after an outfit change the preview is marked and can't be used", /Прежние настройки/.test(stale) && /Создать видео без превью/.test(stale));
  await shot(page, "f-preview-stale");
  // paid new version: price shown before paying, in billing currency, with test mode
  await page.getByRole("button", { name: /Новый вариант/ }).click();
  const pd = await page.getByRole("dialog").innerText();
  check("purchase: price before paying, what is bought, test mode; currency from billing (USD) not language", /\$0[.,]99|0[.,]99\s?\$/.test(pd) && /Ещё одно общее фото-превью/.test(pd) && /деньги не списываются/.test(pd), pd.replace(/\n/g, " | "));
  await shot(page, "f-price-preview");
  await page.getByRole("button", { name: /^Оплатить/ }).click();
  await page.getByRole("button", { name: /Новый вариант/ }).waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Создать видео", exact: true }).waitFor({ timeout: 30000 });

  // video from the approved preview — double click on Pay creates one job
  await page.getByRole("button", { name: "Создать видео", exact: true }).click();
  const vd = await page.getByRole("dialog").innerText();
  check("purchase: video price shown before paying", /\$4[.,]99|4[.,]99\s?\$/.test(vd) && /Одно видео на 10 секунд/.test(vd), vd.replace(/\n/g, " | "));
  await page.getByRole("button", { name: /^Оплатить/ }).dblclick();
  await page.getByText("Готовим").waitFor({ timeout: 20000 });
  await sleep(1200);
  const jobsAfter = (await api("/api/jobs")).length;
  check("duplicates: a double click on Pay starts exactly one job", jobsAfter === jobsBefore + 1, `${jobsBefore} → ${jobsAfter}`);
  await shot(page, "f-generating");
  // reload mid-generation restores the status
  await page.reload({ waitUntil: "networkidle" });
  const restored = await page.getByText(/Готовим|Создаём|Добавляем оригинальный звук/).first().isVisible().catch(() => false);
  check("reload: generation status is restored from the URL", restored);
  await page.getByRole("heading", { name: "Ваше видео" }).waitFor({ timeout: 60000 });
  const res = await page.evaluate(() => ({ src: document.querySelector("video").currentSrc, text: document.body.innerText, dl: document.querySelector("a[download]")?.getAttribute("href") }));
  check("result: the actual result plays in the background, with download and share", res.src.includes("/api/files/job/") && res.dl?.includes("?download") && /Поделиться/.test(res.text), res.src);
  check("result: demo footage is labelled as a placeholder", /Демо: оригинальная запись/.test(res.text));
  await shot(page, "f-result");

  // direct path + failure recovery
  await api("/api/demo", { method: "POST", json: { failVideo: true } });
  await page.getByRole("button", { name: "Сделать ещё" }).click();
  await page.getByText("Вы заменяете").waitFor().catch(() => undefined);
  await page.goto(page.url().replace(/s=[^&]+/, "s=review"));
  await page.getByRole("heading", { name: "Состав" }).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Создать видео", exact: true }).click();
  await page.getByRole("button", { name: /^Оплатить/ }).click();
  await page.getByRole("button", { name: "Повторить бесплатно" }).waitFor({ timeout: 60000 });
  const failedText = await page.evaluate(() => document.body.innerText);
  check("errors: a failed video shows a clear state and a free retry", /Видео не получилось/.test(failedText), failedText.match(/Видео не получилось[^\n]*/)?.[0]);
  await shot(page, "f-failed");
  await api("/api/demo", { method: "POST", json: { failVideo: false } });
  await page.getByRole("button", { name: "Изменить участников" }).click();
  await page.getByText("Вы заменяете").waitFor();
  check("errors: photos and settings are preserved after a failure", (await page.locator('img[alt^="Фото "]').count()) >= 1);
  await ctx.close();
}

console.log(JSON.stringify({ passed: checks.filter((c) => c.pass).length, failed: checks.filter((c) => !c.pass), errors, total: checks.length }, null, 1));
await browser.close();
