import type { SupabaseClient } from "@supabase/supabase-js";
import { readVerifiedMfaSession } from "./verified-mfa-session";

type SessionRegistration = {
  userId: string;
  sessionId: string;
  mfaVerifiedAt: string;
};

type SessionWriter = (
  registration: Readonly<SessionRegistration>,
) => Promise<boolean>;

/**
 * Alleen vanuit vertrouwde servercode aanroepen.
 *
 * De writer moet zelf een beveiligde databaseverbinding
 * gebruiken en mag geen client-side Supabase-sleutel delen.
 * Deze functie registreert niet automatisch via een API.
 */
export async function registerVerifiedMfaSession(
  userClient: SupabaseClient,
  serverWriter: SessionWriter,
): Promise<boolean> {
  if (typeof serverWriter !== "function") return false;

  const verified = await readVerifiedMfaSession(userClient);
  if (!verified) return false;

  const mfaVerifiedAt = new Date(
    verified.mfaVerifiedAtSeconds * 1000,
  ).toISOString();

  try {
    return (await serverWriter({
      userId: verified.userId,
      sessionId: verified.sessionId,
      mfaVerifiedAt,
    })) === true;
  } catch {
    return false;
  }
}