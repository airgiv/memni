# Мемме — meme videos starring you and your friends (prototype)

Each meme has its own landing page: the original video fills the screen, and one bottom widget carries the whole flow — replace the people, optionally preview one shared image, create the video with the original sound.

Stack: Next.js 16 (App Router, static generation for landing pages), React 19, TypeScript, Tailwind CSS v4, Radix primitives for accessible behaviour (dialog, select, dropdown, switch, radio group, collapsible) with a custom visual layer in `src/ui/`. Server: SQLite locally or Supabase, a separate worker with FFmpeg.

> **Demo mode.** No identity replacement is connected. The preview is a labelled collage of your photos on the original frame; the "video" is the original footage with your photos pinned in a corner, plus the original audio. Payments use a test adapter — nothing is charged. The UI says so wherever it matters.

## Quick start

```bash
npm install
npm run media:import -- /path/to/videoplayback_3.mp4   # once: the licensed clip is not in git
npm run dev                                            # http://localhost:3000 → /en
```

`media:import` cuts the fragment 60.5–70.5 s into `public/templates/hotel-lobby/` (gitignored): the landing video (MP4 + WebM), the motion source, the original audio, the reference frame, a 3:4 cutout and a round face crop per participant.

Production: `npm run build && npm start` plus `npm run worker` (separate process). Node.js ≥ 22.13.

Checks:

```bash
npm run typecheck
npm test                                    # unit tests
BASE_URL=http://localhost:3000 npm run e2e  # HTTP end-to-end (needs site + worker)
```

## Product structure

| URL | What |
|---|---|
| `/` | Redirects to `/en` (default locale). Never redirects by browser language. |
| `/{locale}` | Catalog: search, language and market filters (shown when there is more than one), two cards per row on phones |
| `/{locale}/memes/{slug}` | Meme landing page — the primary entry point. Statically generated per published translation. |
| `/{locale}/people` | Saved people (stay in this browser) |
| `/{locale}/videos`, `/{locale}/videos/{id}` | My videos, a finished video |

One page system serves every meme: `src/app/[locale]/memes/[slug]/page.tsx` renders `MemeExperience` from configuration. Nothing is copied per meme.

### The meme page

- Video edge to edge (cover with configurable focal points for phones and desktop), looping, muted, inline; sound and pause controls; sound plays the clip's original track. Under `prefers-reduced-motion` it waits on the poster.
- No header. A small wordmark links to the catalog.
- Like · Comments · Share on the right, above the collapsed sheet. No counts exist, so none are shown; comments show an honest empty state. A light stream of hearts rises behind Like; Like adds a small burst. Hearts stop in hidden tabs, on other steps and under reduced motion.
- The sheet (collapsed): title, "Starring you and your friends", **Replace people**. No prices.
- The sheet (expanded): what the meme is, origin, music, why it caught on (only with sources), how to make your version, FAQ, sources, language selector, link to the catalog. This text is server-rendered — crawlers read it in the initial HTML; the sheet only reveals it.

### The bottom sheet (`src/ui/sheet.tsx`)

- The page never scrolls; the video stays fixed.
- Two stable positions. Drag (touch, mouse, pen) on the handle or title area, flick velocity or halfway snapping; wheel/trackpad expands; the handle is a button (Enter/Space toggles, ↑ expands, ↓ collapses, Esc collapses).
- Expanded: only the content scrolls. Dragging down from the content collapses only if the content is already at its top *and* the gesture started there; a wheel gesture that scrolls up to the top while reading does not collapse — a new gesture is needed.
- Phones: the sheet slides (transform), safe areas respected, height follows the visual viewport. Desktop: a width-constrained card (600 px) above the bottom edge that grows in height.
- Creation steps use the same widget, capped at ~72% of a phone screen so the video stays visible; the primary action is pinned at the bottom of the widget.

### Creation flow (all inside the widget, state in the URL: `?d=draft&s=step&j=job`)

1. **Participants** — round thumbnails at the top: the original faces, replaced by the uploaded person, a ring on the active one, a tick on completed ones, `aria-current="step"`, no "Step 1 of 2". The video behind re-centres on the participant and dims everything else.
   Each step: who you're replacing (cutout + description), upload 1–3 photos or pick a saved person, then outfit (compact dropdown) and a discreet **Adjust appearance** (presentation chips + a correction note). One **Continue**. A small line explains that saved people stay in this browser, with a compact switch to opt out.
2. **Review** — who replaces whom, **Create video** and **Preview image first** (marked Free or Paid).
3. **Preview** (optional) — one shared image with everyone. Versions, approve one, regenerate, or edit. A change to a person or outfit marks previews "Earlier settings"; the server refuses to animate an outdated preview.
4. **Generation** — the video dims, a slow glow runs along the screen edge (paused in hidden tabs, static under reduced motion). Stages: Preparing → Generating → Adding the original sound → Ready / Failed / Under review. No percentages (providers don't report them). Reloading restores the state.
5. **Result** — the actual result plays as the background; Download, Share, Make another. Demo output is labelled as original footage.

Prices appear only in the confirmation dialog before a paid action, with what is bought (one preview or one video), the billing country and "Test mode — no money is charged".

## Whole-person replacement

- Stored separately per participant (`src/lib/domain/types.ts`): the original **role** (from config), the **reference photos**, **user-confirmed appearance preferences** (`mode: photos | adjusted`, optional presentation, optional description), the **outfit choice**, and the **preset constraints** that travel with an outfit.
- `buildSpec()` turns that into a structured `GenerationSpec`; `render*Prompt()` fills the meme's server-side prompt templates. Prompts never reach the browser.
- The replacement scope comes from provider capabilities (`replaces: "whole-person" | "face-only"`). A face-only model is never asked to change body, hair or clothes, and the review step says so before payment.
- Presentation is never inferred. Photo analysis (`src/lib/providers/analysis/`) checks only resolution, exposure, sharpness and — with the Gemini checker — face count and body visibility. Without a full-body reference the prompt says not to invent proportions, and the UI offers an optional full-length photo.
- Random outfit: drawn once on the server and stored (`resolvedPresetId`); preview and video use the same draw; it changes only with **Draw again**.
- Original audio: the worker attaches the meme's own track with exact bounds via FFmpeg; video prompts tell the model not to generate music.
- If the user skips the preview and the video model needs one prepared image (Kling Motion Control with two people), the worker first makes an **internal reference frame** with the image model — not shown, not charged separately.

## Adapters (UI never knows the provider)

| Concern | Adapters | Selected by |
|---|---|---|
| Photo analysis | `local` (pixel checks), `gemini` (prepared) | `PHOTO_ANALYZER` |
| Image | `demo` (labelled collage), `gemini` (prepared) | `IMAGE_PROVIDER` + key |
| Video | `demo`, `kling`, `genjutsu` (prepared) | `VIDEO_PROVIDER` + keys |
| Payments | `test` only | `PAYMENT_PROVIDER` (server-side) |

Prices are per currency in `src/lib/commerce/prices.ts` (example prices; one purchase = one preview or one video, no tokens). The **billing country** is an explicit choice (purchase dialog) → edge geo header → `DEFAULT_BILLING_COUNTRY`; the checkout currency follows the country. Interface locale, meme market, billing country and currency are four separate values — a Russian interface with US billing pays in dollars. The server accepts a purchase only when the client echoes the exact quoted amount **and** currency; purchases are idempotent; failures refund.

## Localization

- English is the source locale. Interface strings: `src/i18n/messages/en.ts`; translations are separate files of the same shape (`ru.ts`) — TypeScript and a unit test check completeness. Plural forms use `Intl.PluralRules` categories.
- Prepared locales: `en`, `ru`, `pt-BR`, `pt-PT`, `es`, `ja` (`src/i18n/locales.ts`). Only **published** locales with a dictionary are routed; a meme page additionally needs that meme's translation marked `review.status: "reviewed"`. Today: English and Russian.
- Separate URLs per translation (`/en/memes/hotel-lobby`, `/ru/memes/hotel-lobby`), `<html lang>` per locale, self-referencing canonicals, reciprocal `hreflang` + `x-default`, a localized sitemap with alternates, Open Graph/Twitter metadata, JSON-LD (`VideoObject` + `FAQPage`) that matches the visible content.
- The selector shows language names, not flags, and keeps the query, so the draft and step survive a switch. A browser language with an available translation produces a small suggestion; it never redirects.

## Add a meme

1. Create `src/memes/<id>/index.ts` exporting a `MemeDef` (see `src/memes/types.ts`): stable id, version, default locale, markets, media paths, focal points, roles (region, face crop, cutout, focal point, allowed outfits, server prompt), outfits (presets, random pool, constraints), photo limits, prompt templates, sources.
2. Add `content.en.ts` (slug, title, tagline, SEO, role and outfit labels, editorial sections with source ids, FAQ, `review`).
3. Register it in `MEMES` in `src/memes/index.ts`.
4. Prepare media (adapt `scripts/import-video.ts`: fragment bounds, reference frame time, face regions).
5. `npm test` checks the config (regions, outfit ids, labels in every translation, sources). Pages, sitemap and metadata pick it up.

## Add a translation

- **Interface:** copy `src/i18n/messages/en.ts` to `<locale>.ts`, translate, register it in `src/i18n/index.ts`, and set the locale's `status: "published"` in `src/i18n/locales.ts` once reviewed.
- **A meme:** add `content.<locale>.ts` next to the meme (its own slug if wanted) and add it to `content`; set `review.status: "reviewed"` after review. Until then it is not routed, not in the sitemap and not in hreflang.

## Real vs simulated

**Works for real:** the Hotel Lobby video, cutouts and face crops; landing pages, sheet, flow, i18n, SEO output; uploads with validation and pixel checks; saved people; drafts with optimistic versioning; outfit/appearance storage; preview invalidation; idempotent purchases (test adapter), refunds, job leasing/retries; assembly of the result with the original audio (verified with ffprobe).

**Simulated (demo adapters):** image and video generation (labelled placeholders), payments (test adapter), face/body photo checks (not run without the Gemini checker).

**Not verified:** real Gemini, Kling and Genjutsu calls; the Gemini photo checker; Supabase against a live project (migration `0003` adds photo analysis and billing country); Telegram with a real bot.

**Editorial facts** were checked against search-result excerpts of the cited sources (Wikipedia, Know Your Meme, The Source, the COLORS upload); the full pages could not be opened from the build environment. Re-read the sources before launch. The Russian translation was written by the developer — review it before launch.

## Verified

- `tsc`, `next build`; unit tests (draft logic, random outfit, prompts and scope, provider planning, i18n completeness and hreflang, billing/currency, original-audio assembly, Telegram signatures).
- HTTP e2e (18 checks): SEO output, both video paths, 1–3 photos, analysis stored, random outfit stability, invalidation by photo and outfit, paid repeat preview with amount+currency confirmation, billing country independent of language, duplicate clicks → one job/purchase, failures with refunds, ownership isolation, 10.00 s result with original audio.
- Playwright on iPhone 13 and 1440×900 (61 checks): sheet drag/snap with real touch events, scroll hand-off, wheel, keyboard, reduced motion, hearts paused in hidden tabs, rail navigation and thumbnails, upload validation, saved people and opt-out, outfit dropdown and random persistence, invalidation, language switch without draft loss, both paths, double-click Pay → one job, reload during generation, failure with free retry and preserved photos, focus ring, hover without movement, no console errors.
