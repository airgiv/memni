import { cookies } from "next/headers";
import { BILLING_COOKIE, BILLING_COUNTRIES, resolveBilling } from "@/lib/commerce/billing";
import { getConfig } from "@/lib/config";
import { requestBilling } from "@/lib/server/billing-request";
import { body, handle, json } from "@/lib/server/http";
import { UserError } from "@/lib/server/services/errors";

/** Current billing context (country → checkout currency). Independent of the interface language. */
export const GET = handle(async () => json(await requestBilling()));

/** Explicit billing-country choice from the purchase dialog. */
export const POST = handle(async (req: Request) => {
  const b = await body<{ country?: string }>(req);
  const country = String(b.country ?? "").toUpperCase();
  if (!(BILLING_COUNTRIES as readonly string[]).includes(country)) throw new UserError("bad_country", "Unsupported billing country");
  (await cookies()).set(BILLING_COOKIE, country, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return json(resolveBilling({ cookie: country, fallback: getConfig().pricing.defaultCountry }));
});
