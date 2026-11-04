import type { SupabaseClient } from "@supabase/supabase-js";
import { hasTrustedTotp } from "../supabase/trusted-mfa";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type VerifiedMfaSession = {
  userId: string;
  sessionId: string;
  mfaVerifiedAtSeconds: number;
};

/**
 * Server-side MFA- en sessiecontrole.
 *
 * Geen databasewrite en geen autorisatiebeslissing.
 * Gebruik uitsluitend met een Supabase-client die
 * voor het betreffende verzoek is aangemaakt.
 */
export async function readVerifiedMfaSession(
  client: SupabaseClient,
): Promise<VerifiedMfaSession | null> {
  try {
    const { data, error } = await client.auth.getClaims();

    if (error || !data?.claims) return null;

    const claims = data.claims;

    if (
      claims.role !== "authenticated" ||
      typeof claims.sub !== "string" ||
      typeof claims.session_id !== "string" ||
      !UUID.test(claims.sub) ||
      !UUID.test(claims.session_id) ||
      !hasTrustedTotp(claims)
    ) {
      return null;
    }

    const { data: userData, error: userError } =
      await client.auth.getUser();

    if (
      userError ||
      !userData?.user ||
      userData.user.id.toLowerCase() !== claims.sub.toLowerCase() ||
      userData.user.is_anonymous ||
      userData.user.deleted_at ||
      (
        userData.user.banned_until &&
        Date.parse(userData.user.banned_until) > Date.now()
      )
    ) {
      return null;
    }

    const totpTimestamps = (claims.amr ?? [])
      .filter(
        (entry): entry is { method: string; timestamp: number } =>
          typeof entry === "object" &&
          entry !== null &&
          "method" in entry &&
          entry.method === "totp" &&
          "timestamp" in entry &&
          typeof entry.timestamp === "number",
      )
      .map(entry => entry.timestamp);

    if (totpTimestamps.length === 0) return null;

    const mfaVerifiedAtSeconds = Math.max(...totpTimestamps);

    return {
      userId: claims.sub.toLowerCase(),
      sessionId: claims.session_id.toLowerCase(),
      mfaVerifiedAtSeconds,
    };
  } catch {
    return null;
  }
}