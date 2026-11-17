import type { SupabaseClient } from "@supabase/supabase-js";
import { AccessError, requireAal2, requirePortalIdentity } from "@/lib/portal-access";
import { requirePersonalIdentity } from "@/lib/personal-access";

/** Same signed-in identity, with fresh TOTP, in either customer environment. */
export async function requireCustomerSettingsIdentity(client: SupabaseClient) {
  try {
    const identity = await requirePortalIdentity(client);
    requireAal2(identity);
    return identity.profile;
  } catch (error) {
    if (error instanceof AccessError && (error.status === 503 || error.code === "MFA_REQUIRED")) throw error;
    if (!(error instanceof AccessError) || ![401, 403].includes(error.status)) throw error;
  }
  const personal = await requirePersonalIdentity(client);
  requireAal2(personal);
  return personal.profile;
}
