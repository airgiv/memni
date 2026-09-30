/**
 * Server-side check of Telegram Mini App initData, as documented at
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 *   secret_key = HMAC_SHA256(key = "WebAppData", message = bot_token)
 *   hash       = hex(HMAC_SHA256(key = secret_key, message = data_check_string))
 *   data_check_string = all fields except `hash`, sorted, "key=value" joined by "\n"
 *
 * Browser-provided user data is trusted ONLY after this passes.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export type VerifyResult =
  | { ok: true; user: TelegramUser; authDate: number }
  | { ok: false; reason: "no_token" | "malformed" | "bad_hash" | "expired" | "no_user" };

export function verifyInitData(initData: string, botToken: string | undefined, maxAgeSec: number, now = Date.now()): VerifyResult {
  if (!botToken) return { ok: false, reason: "no_token" };
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const hash = params.get("hash");
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return { ok: false, reason: "malformed" };
  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key !== "hash") pairs.push(`${key}=${value}`);
  });
  pairs.sort();
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(pairs.join("\n")).digest();
  const given = Buffer.from(hash, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "bad_hash" };
  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || now / 1000 - authDate > maxAgeSec) return { ok: false, reason: "expired" };
  const userRaw = params.get("user");
  if (!userRaw) return { ok: false, reason: "no_user" };
  try {
    const user = JSON.parse(userRaw) as TelegramUser;
    if (typeof user.id !== "number") return { ok: false, reason: "no_user" };
    return { ok: true, user, authDate };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}

/** Test helper: sign initData the way Telegram does. */
export function signInitData(fields: Record<string, string>, botToken: string): string {
  const pairs = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .sort();
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(pairs.join("\n")).digest("hex");
  const p = new URLSearchParams(fields);
  p.set("hash", hash);
  return p.toString();
}
