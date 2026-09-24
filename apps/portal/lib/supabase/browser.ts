"use client";
import { createClient } from "@supabase/supabase-js";
import { publicSupabaseConfig } from "./config";

// This BFF uses HttpOnly session cookies. Browser components call /api for
// authenticated actions. This anonymous client cannot read those cookies and
// must not introduce a second persisted login or localStorage token store.
export function createBrowserSupabaseClient() {
  const { url, key } = publicSupabaseConfig();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
