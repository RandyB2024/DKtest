import type { SupabaseClient } from "@supabase/supabase-js";

type VerifiedSession = {
  userId: string;
  sessionId: string;
  mfaVerifiedAtSeconds: number;
};

type SecurityBinding = {
  verifySession(token: string): Promise<VerifiedSession | null>;
  registerPendingSession(token: string): Promise<{
    registered: boolean;
    reason: string;
  }>;
};

/**
 * Voorlopige beveiligingsregistratie.
 *
 * Standaard UIT.
 * Uitsluitend serverzijde.
 * Verleent geen toegang.
 * Laat de bestaande MFA-flow ongemoeid bij een fout.
 */
export async function runPendingMfaRegistration(
  client: SupabaseClient,
  expected: VerifiedSession
): Promise<void> {
  if (process.env.BESTEMD_SECURITY_SHADOW_REGISTER !== "true") {
    return;
  }

  try {
    const { data, error } = await client.auth.getSession();

    if (error || !data?.session?.access_token) {
      return;
    }

    const token = data.session.access_token;

    const { env } = await import("cloudflare:workers");

    const binding = (
      env as unknown as {
        BESTEMD_SECURITY?: SecurityBinding;
      }
    ).BESTEMD_SECURITY;

    if (
      !binding ||
      typeof binding.verifySession !== "function" ||
      typeof binding.registerPendingSession !== "function"
    ) {
      return;
    }

    // Onafhankelijke controle bij de Security Worker.
    const verified = await binding.verifySession(token);

    if (
      !verified ||
      verified.userId !== expected.userId ||
      verified.sessionId !== expected.sessionId ||
      verified.mfaVerifiedAtSeconds !==
        expected.mfaVerifiedAtSeconds
    ) {
      return;
    }

    // De Worker verifieert opnieuw voordat hij naar
    // bestemd-security schrijft. Status blijft 'reverify'.
    await binding.registerPendingSession(token);

    // Resultaat bewust niet voor autorisatie gebruiken.
    // Geen toegangstokens of persoonsgegevens loggen.
  } catch {
    // Schaduwregistratie mag de bestaande login
    // voorlopig niet blokkeren.
  }
}