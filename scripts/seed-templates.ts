/**
 * Mirrors src/lib/templates into Supabase (templates + template_roles), so drafts
 * can reference them with a foreign key. Run after migrations and whenever a
 * template changes:  npm run seed:templates
 */
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const { getSupabaseAdmin } = await import("../src/lib/server/supabase");
const { TEMPLATES } = await import("../src/lib/templates");

const db = getSupabaseAdmin();
for (const t of TEMPLATES) {
  const r1 = await db.from("templates").upsert({ id: t.id, version: t.version, kind: t.kind, title: t.title, config: t, active: true, updated_at: new Date().toISOString() });
  if (r1.error) throw new Error(r1.error.message);
  await db.from("template_roles").delete().eq("template_id", t.id);
  const r2 = await db.from("template_roles").insert(t.roles.map((r, i) => ({ template_id: t.id, role_id: r.id, name: r.name, region: r.region, position: i })));
  if (r2.error) throw new Error(r2.error.message);
  console.log(`✓ ${t.id} v${t.version} (${t.roles.length} roles)`);
}
