import type { SupabaseClient } from "@supabase/supabase-js";
// Only call with cryptographically/server-validated claims, never decoded cookies.
export const MFA_TRUST_MAX_AGE_SECONDS = 86400;
export function trustedMfaConfig(value: string | undefined) {
  if (value !== undefined && value !== '86400') throw new Error('MFA_TRUST_MAX_AGE_SECONDS moet exact 86400 zijn.');
  return MFA_TRUST_MAX_AGE_SECONDS;
}
export function hasTrustedTotp(claims: { aal?: unknown; amr?: unknown } | null | undefined, now = Date.now() / 1000) {
  if (!claims || claims.aal !== 'aal2' || !Array.isArray(claims.amr) || !claims.amr.length || !Number.isFinite(now)) return false;
  let latest = 0;
  for (const entry of claims.amr) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.method !== 'string' || !entry.method || !Number.isSafeInteger(entry.timestamp) || entry.timestamp <= 0 || entry.timestamp > now) return false;
    if (entry.method === 'totp') latest = Math.max(latest, entry.timestamp);
  }
  return latest > 0 && now < latest + MFA_TRUST_MAX_AGE_SECONDS;
}
export async function validatedTotp(client: SupabaseClient, userId: string) {
  try {
    const {data,error} = await client.auth.getClaims();
    return !error && data?.claims?.sub === userId && hasTrustedTotp(data.claims);
  } catch { return false; }
}
