import { randomUUID } from "node:crypto";
import { getConfig } from "@/lib/config";
import { setLocalSession, supabaseServerClient } from "@/lib/server/auth";
import { body, handle, json } from "@/lib/server/http";
import { getRepo } from "@/lib/server/repo";
import { UserError } from "@/lib/server/services/errors";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { verifyInitData } from "@/lib/telegram/verify";

/**
 * Telegram Mini App login. The browser sends the raw initData string; the
 * server checks its HMAC with the bot token before trusting any field.
 * Without TELEGRAM_BOT_TOKEN this endpoint refuses — the integration is not
 * «done» until a real bot token is configured and tested inside Telegram.
 */
export const POST = handle(async (req: Request) => {
  const c = getConfig();
  const { initData } = await body<{ initData?: string }>(req);
  const res = verifyInitData(String(initData ?? ""), c.telegram.botToken, c.telegram.initDataMaxAge);
  if (!res.ok) {
    const msg =
      res.reason === "no_token"
        ? "Вход через Telegram ещё не настроен на сервере (нет токена бота)"
        : res.reason === "expired"
          ? "Данные Telegram устарели — откройте приложение заново"
          : "Не удалось проверить данные Telegram";
    throw new UserError(`telegram_${res.reason}`, msg, res.reason === "no_token" ? 503 : 401);
  }
  const tgId = String(res.user.id);
  const displayName = [res.user.first_name, res.user.last_name].filter(Boolean).join(" ") || res.user.username || "Telegram";
  const repo = getRepo();

  if (c.dataMode === "local") {
    const existing = await repo.findUserByTelegramId(tgId);
    const user = existing ?? (await repo.ensureUser({ id: randomUUID(), kind: "telegram", telegramId: tgId, displayName, createdAt: new Date().toISOString() }));
    await setLocalSession(user.id);
    return json({ ok: true, displayName });
  }

  // Supabase: one auth user per Telegram id, signed in server-side via a one-time magic-link token.
  // Prepared and type-checked; not yet exercised against a live project.
  const admin = getSupabaseAdmin();
  const email = `tg${tgId}@telegram.memni.invalid`;
  let user = await repo.findUserByTelegramId(tgId);
  if (!user) {
    const created = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { telegram_id: tgId, name: displayName } });
    if (created.error || !created.data.user) throw new Error(`telegram user create failed: ${created.error?.message}`);
    user = await repo.ensureUser({ id: created.data.user.id, kind: "telegram", telegramId: tgId, displayName, createdAt: created.data.user.created_at });
  }
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error || !link.data.properties?.hashed_token) throw new Error(`telegram link failed: ${link.error?.message}`);
  const sb = await supabaseServerClient();
  const verified = await sb.auth.verifyOtp({ type: "magiclink", token_hash: link.data.properties.hashed_token });
  if (verified.error) throw new Error(`telegram session failed: ${verified.error.message}`);
  return json({ ok: true, displayName });
});
