// Shared access to Turnly's Supabase project (publishable key only, same as the apps and portal).

export type SupabaseEnv = {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
};

export const DEFAULT_SUPABASE_URL = "https://nwnzdoveskthebfyndcs.supabase.co";
export const DEFAULT_SUPABASE_KEY = "sb_publishable_0fESHyuQyVSySksGWO-HDA_FX4_r5fP";

export const supabaseBase = (env: SupabaseEnv) => env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
export const supabaseKey = (env: SupabaseEnv) => env.SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_KEY;

/** Headers that make a Supabase request run as the signed-in user (RLS applies). */
export function userHeaders(env: SupabaseEnv, token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, apikey: supabaseKey(env) };
}

export const normalizeRole = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase().replace(/[\s-]+/g, "_") : "";

