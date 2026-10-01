/**
 * Mirrors src/memes into Supabase (templates + template_roles) so drafts can
 * reference them with a foreign key. Run after migrations and whenever a meme
 * changes:  npm run seed:memes
 */
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const { getSupabaseAdmin } = await import("../src/lib/server/supabase");
const { MEMES } = await import("../src/memes");

const db = getSupabaseAdmin();
for (const m of MEMES) {
  const title = m.content[m.defaultLocale]?.title ?? m.id;
  const r1 = await db.from("templates").upsert({ id: m.id, version: m.version, kind: "main", title, config: m, active: true, updated_at: new Date().toISOString() });
  if (r1.error) throw new Error(r1.error.message);
  await db.from("template_roles").delete().eq("template_id", m.id);
  const names = m.content[m.defaultLocale]?.roles ?? {};
  const r2 = await db.from("template_roles").insert(m.roles.map((r, i) => ({ template_id: m.id, role_id: r.id, name: names[r.id]?.name ?? r.id, region: r.region, position: i })));
  if (r2.error) throw new Error(r2.error.message);
  console.log(`✓ ${m.id} v${m.version} (${m.roles.length} roles)`);
}
