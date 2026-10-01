import { test } from "node:test";
import assert from "node:assert/strict";
import { getMessages, LOCALE_CODES, LOCALES, localeFromSegment, matchBrowserLocale, PUBLISHED_LOCALES } from "../src/i18n";
import { fmt, plur } from "../src/i18n/format";
import { memeAlternates, hreflang } from "../src/lib/site";
import { memeContent, memeLocales, MEMES } from "../src/memes";

function shape(o: unknown, path = ""): string[] {
  if (typeof o !== "object" || o === null) return [path];
  // plural objects differ by language on purpose
  if ("other" in (o as object)) return [path];
  return Object.entries(o as object).flatMap(([k, v]) => shape(v, `${path}.${k}`));
}

test("every published locale has a complete dictionary with the same keys as English", () => {
  const en = shape(getMessages("en")).sort();
  for (const l of PUBLISHED_LOCALES) assert.deepEqual(shape(getMessages(l)).sort(), en, l);
});

test("the six locales are prepared; only reviewed ones are routable", () => {
  assert.deepEqual([...LOCALE_CODES], ["en", "ru", "pt-BR", "pt-PT", "es", "ja"]);
  assert.equal(localeFromSegment("en"), "en");
  assert.equal(localeFromSegment("pt-br"), null, "planned, not published");
  assert.equal(localeFromSegment("xx"), null);
  assert.equal(LOCALES["pt-BR"].segment, "pt-br");
});

test("browser language only suggests; it matches by tag then by base language", () => {
  assert.equal(matchBrowserLocale(["ru-RU", "en"], ["en", "ru"]), "ru");
  assert.equal(matchBrowserLocale(["de-DE"], ["en", "ru"]), null);
  assert.equal(matchBrowserLocale(["en-GB"], ["en", "ru"]), "en");
});

test("placeholders and plural forms", () => {
  assert.equal(fmt("Pay {price}", { price: "$4.99" }), "Pay $4.99");
  const ru = getMessages("ru").catalog.people;
  assert.equal(plur("ru", ru, 2), "2 человека");
  assert.equal(plur("ru", ru, 5), "5 человек");
  assert.equal(plur("en", getMessages("en").catalog.people, 1), "1 person");
});

test("meme pages: self-canonical paths per locale and reciprocal hreflang", () => {
  for (const m of MEMES) {
    const alt = memeAlternates(m);
    const langs = memeLocales(m);
    assert.ok(langs.includes("en"));
    for (const l of langs) assert.equal(alt[l], `/${LOCALES[l].segment}/memes/${memeContent(m, l)!.slug}`);
    const h = hreflang(alt, m.defaultLocale);
    // the same set is produced on every translation's page → reciprocal
    for (const l of langs) assert.ok(h[LOCALES[l].tag].endsWith(alt[l]!));
    assert.ok(h["x-default"]);
  }
});
