/**
 * Who is calling. Two implementations behind one function:
 *
 *  - local (demo): an anonymous user id in an HttpOnly cookie, HMAC-signed so
 *    it cannot be forged or swapped for someone else's id.
 *  - supabase: a Supabase Auth session (@supabase/ssr cookies). A visitor
 *    without a session gets an anonymous Supabase user (enable «Anonymous
 *    sign-ins» in the project); Telegram login upgrades it (see /api/auth/telegram).
 */
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getConfig } from "../config";
import { getRepo } from "./repo";

const COOKIE = "memni_sid";

let cachedSecret: string | null = null;
function secret(): string {
  if (cachedSecret) return cachedSecret;
  const c = getConfig();
  if (c.sessionSecret) return (cachedSecret = c.sessionSecret);
  if (process.env.NODE_ENV === "production" && c.dataMode === "supabase")
    throw new Error("SESSION_SECRET is required in production");
  // demo: generate once and keep next to the local database
  const file = join(c.dataDir, "session-secret");
  if (!existsSync(file)) {
    mkdirSync(c.dataDir, { recursive: true });
    writeFileSync(file, randomUUID() + randomUUID(), { mode: 0o600 });
  }
  return (cachedSecret = readFileSync(file, "utf8").trim());
}

function sign(userId: string) {
  return createHmac("sha256", secret()).update(userId).digest("base64url");
}
export function sessionValue(userId: string) {
  return `${userId}.${sign(userId)}`;
}
function readSession(value: string | undefined): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot < 0) return null;
  const id = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(sign(id));
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null;
}

export async function setLocalSession(userId: string) {
  const jar = await cookies();
  jar.set(COOKIE, sessionValue(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function supabaseServerClient() {
  const c = getConfig();
  const jar = await cookies();
  return createServerClient(c.supabase.url!, c.supabase.anonKey!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) jar.set(name, value, options);
        } catch {
          // called from a Server Component: cookies are read-only there; the API routes refresh them
        }
      },
    },
  });
}

export class AuthError extends Error {}

/**
 * Current user id; creates an anonymous identity when there is none yet.
 * Only call from Route Handlers / Server Actions (it may set cookies).
 */
export async function requireUserId(): Promise<string> {
  const c = getConfig();
  const repo = getRepo();
  if (c.dataMode === "local") {
    const jar = await cookies();
    let id = readSession(jar.get(COOKIE)?.value);
    if (!id) {
      id = randomUUID();
      await setLocalSession(id);
    }
    await repo.ensureUser({ id, kind: "anon", createdAt: new Date().toISOString() });
    return id;
  }
  const sb = await supabaseServerClient();
  const { data } = await sb.auth.getUser();
  let user = data.user;
  if (!user) {
    const res = await sb.auth.signInAnonymously();
    if (res.error || !res.data.user)
      throw new AuthError("Не удалось создать гостевую сессию. Включите Anonymous sign-ins в Supabase или войдите через Telegram.");
    user = res.data.user;
  }
  await repo.ensureUser({ id: user.id, kind: user.is_anonymous ? "anon" : "email", createdAt: user.created_at });
  return user.id;
}

/** Read-only variant for Server Components: never creates a session. */
export async function currentUserId(): Promise<string | null> {
  const c = getConfig();
  if (c.dataMode === "local") {
    const jar = await cookies();
    return readSession(jar.get(COOKIE)?.value);
  }
  const sb = await supabaseServerClient();
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? null;
}
