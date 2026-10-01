import { test } from "node:test";
import assert from "node:assert/strict";
import { currencyForCountry, resolveBilling } from "../src/lib/commerce/billing";
import { formatMoney } from "../src/lib/commerce/money";
import { PRICE_TABLE } from "../src/lib/commerce/prices";

test("billing country: explicit choice → edge header → default; never the interface language", () => {
  assert.equal(resolveBilling({ cookie: "br", geoHeader: "US", fallback: "US" }).country, "BR");
  assert.equal(resolveBilling({ geoHeader: "DE", fallback: "US" }).source, "detected");
  assert.deepEqual(resolveBilling({ geoHeader: "XX", fallback: "US" }), { country: "US", currency: "USD", displayCurrency: "USD", source: "default" });
  assert.equal(currencyForCountry("PT"), "EUR");
  assert.equal(currencyForCountry("JP"), "JPY");
});

test("money is formatted in the interface locale, in the billing currency", () => {
  assert.equal(formatMoney({ amountMinor: PRICE_TABLE.video.USD, currency: "USD" }, "en"), "$4.99");
  assert.equal(formatMoney({ amountMinor: PRICE_TABLE.video.JPY, currency: "JPY" }, "en"), "¥750");
  // a Russian interface with US billing still charges dollars
  assert.match(formatMoney({ amountMinor: 499, currency: "USD" }, "ru"), /4,99\s\$/);
});
