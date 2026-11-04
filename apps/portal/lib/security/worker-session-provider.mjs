const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getSecurityBinding() {
  // Alleen uitvoeren binnen de vertrouwde Cloudflare-serverruntime.
  // Geen browserheaders of publieke HTTP-endpoints gebruiken.
  const { env } = await import("cloudflare:workers");
  return env?.BESTEMD_SECURITY ?? null;
}

/**
 * Controleert een toegangstoken met de interne Security Worker.
 *
 * De Worker verifieert het token onafhankelijk via Supabase.
 * Deze functie verleent zelf nooit toegang.
 *
 * De optionele resolver dient voor geisoleerde tests;
 * de productieaanroep gebruikt uitsluitend de servicebinding.
 */
export function createWorkerSessionVerifier(
  resolveBinding = getSecurityBinding
) {
  return async function verifySession(accessToken) {
    if (
      typeof accessToken !== "string" ||
      accessToken.length < 20 ||
      typeof resolveBinding !== "function"
    ) {
      return null;
    }

    try {
      const binding = await resolveBinding();

      if (
        !binding ||
        typeof binding.verifySession !== "function"
      ) {
        return null;
      }

      const result = await binding.verifySession(accessToken);

      if (
        !result ||
        !UUID.test(result.userId ?? "") ||
        !UUID.test(result.sessionId ?? "") ||
        !Number.isSafeInteger(result.mfaVerifiedAtSeconds) ||
        result.mfaVerifiedAtSeconds <= 0
      ) {
        return null;
      }

      return {
        userId: result.userId.toLowerCase(),
        sessionId: result.sessionId.toLowerCase(),
        mfaVerifiedAtSeconds: result.mfaVerifiedAtSeconds
      };
    } catch {
      // Fail closed. Nooit tokens of persoonsgegevens loggen.
      return null;
    }
  };
}

export const verifySessionWithSecurityWorker =
  createWorkerSessionVerifier();