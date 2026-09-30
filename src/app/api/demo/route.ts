import { cookies } from "next/headers";
import { getConfig } from "@/lib/config";
import { requireUserId } from "@/lib/server/auth";
import { body, handle, json } from "@/lib/server/http";
import { getRepo } from "@/lib/server/repo";
import { UserError } from "@/lib/server/services/errors";

/** Demo-only switches: simulate failures, give demo previews back. No effect on real providers. */
export const POST = handle(async (req: Request) => {
  const c = getConfig();
  if (!c.isDemo) throw new UserError("not_demo", "Демо-настройки недоступны в реальном режиме", 403);
  const userId = await requireUserId();
  const b = await body<{ failPreview?: boolean; failVideo?: boolean; resetQuota?: boolean }>(req);
  const flags = [b.failPreview ? "fail-preview" : "", b.failVideo ? "fail-video" : ""].filter(Boolean).join(",");
  (await cookies()).set("memni_demo", flags, { httpOnly: true, sameSite: "lax", path: "/" });
  if (b.resetQuota) await getRepo().resetDemoUsage(userId);
  return json({ ok: true, flags });
});

export const GET = handle(async () => {
  const raw = (await cookies()).get("memni_demo")?.value ?? "";
  return json({ failPreview: raw.includes("fail-preview"), failVideo: raw.includes("fail-video") });
});
