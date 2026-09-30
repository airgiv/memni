import { getConfig } from "../../config";
import { LocalRepo } from "./local";
import { SupabaseRepo } from "./supabase";
import type { Repo } from "./types";

export * from "./types";

const g = globalThis as unknown as { __memniRepo?: Repo };

export function getRepo(): Repo {
  if (g.__memniRepo) return g.__memniRepo;
  const c = getConfig();
  g.__memniRepo = c.dataMode === "supabase" ? new SupabaseRepo() : new LocalRepo(c.dataDir);
  return g.__memniRepo;
}
