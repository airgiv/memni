import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { Photo, Preview } from "../domain/types";
import { ConflictError, LimitError, NotFoundError } from "./repo";
import { UserError } from "./services/errors";
import { AuthError } from "./auth";
import type { DemoFlags } from "./services/previews";
import { getConfig } from "../config";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
}

export function errorResponse(e: unknown) {
  if (e instanceof UserError) return json({ error: e.message, code: e.code }, e.status);
  if (e instanceof ConflictError) return json({ error: e.message, code: "conflict" }, 409);
  if (e instanceof NotFoundError) return json({ error: e.message, code: "not_found" }, 404);
  if (e instanceof LimitError) return json({ error: e.message, code: e.code }, 429);
  if (e instanceof AuthError) return json({ error: e.message, code: "auth" }, 401);
  console.error(e);
  return json({ error: "Something went wrong on the server. Please try again", code: "internal" }, 500);
}

export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new UserError("bad_json", "Invalid request");
  }
}

export const DEMO_COOKIE = "memme_demo";

/** Demo switches live in a cookie and only ever affect demo adapters. */
export async function demoFlags(): Promise<DemoFlags> {
  const c = getConfig();
  const raw = (await cookies()).get(DEMO_COOKIE)?.value ?? "";
  return {
    failPreview: c.imageMode === "demo" && raw.includes("fail-preview"),
    failVideo: c.videoMode === "demo" && raw.includes("fail-video"),
  };
}

export function publicPreview(p: Preview) {
  const { storageKey, userId, ...rest } = p;
  void userId;
  return { ...rest, url: storageKey && p.status === "ready" ? `/api/files/preview/${p.id}` : null };
}
export type PublicPreview = ReturnType<typeof publicPreview>;

export function publicPhoto(p: Photo) {
  return {
    id: p.id,
    personId: p.personId,
    width: p.width,
    height: p.height,
    bytes: p.bytes,
    analysis: p.analysis ? { isDemo: p.analysis.isDemo, checked: p.analysis.checked, issues: p.analysis.issues, faces: p.analysis.faces, body: p.analysis.body } : null,
    createdAt: p.createdAt,
    url: `/api/files/photo/${p.id}`,
  };
}
export type PublicPhoto = ReturnType<typeof publicPhoto>;

export type RouteCtx<P> = { params: Promise<P> };
