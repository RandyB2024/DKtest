// Current portal queries use the user's Supabase session and RLS.
// db/schema.ts and drizzle/ are historical D1 design material, not runtime storage.
export { createRequestSupabase as getDb } from "../lib/supabase/server";