/** Request-scoped billing context (route handlers only — reads cookies and edge headers). */
import { cookies, headers } from "next/headers";
import { getConfig } from "../config";
import { BILLING_COOKIE, resolveBilling, type BillingContext } from "../commerce/billing";

/** Billing country of the current request: explicit choice → edge geo header → default. */
export async function requestBilling(): Promise<BillingContext> {
  const jar = await cookies();
  const h = await headers();
  return resolveBilling({
    cookie: jar.get(BILLING_COOKIE)?.value,
    geoHeader: h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry"),
    fallback: getConfig().pricing.defaultCountry,
  });
}

