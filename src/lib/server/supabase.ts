import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getConfig } from "../config";

let admin: SupabaseClient | null = null;

/**
 * Service-role client. Server only (API routes and the worker). It bypasses
 * RLS, so every query written with it filters by user_id explicitly.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (admin) return admin;
  const c = getConfig();
  if (!c.supabase.url || !c.supabase.serviceKey) throw new Error("Supabase is not configured");
  admin = createClient(c.supabase.url, c.supabase.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}
