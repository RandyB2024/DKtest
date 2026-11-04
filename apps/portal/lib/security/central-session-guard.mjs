import { evaluateCentralSessionPolicy } from "./central-session-policy.mjs";

/**
 * Server-side orkestratie.
 *
 * De aanroepende server moet de providers zelf samenstellen.
 * Accepteer deze providers NOOIT uit request JSON of browserdata.
 *
 * Dit is nog geen daadwerkelijke API-handhaving.
 */
export async function checkCentralSession({
  accessToken,
  verifySession,
  loadRegisteredSession,
  verifyNetwork,
  nowSeconds = Math.floor(Date.now() / 1000)
} = {}) {
  const deny = reason => ({ allowed: false, reason });

  if (
    typeof accessToken !== "string" ||
    accessToken.length < 20 ||
    typeof verifySession !== "function" ||
    typeof loadRegisteredSession !== "function" ||
    typeof verifyNetwork !== "function"
  ) {
    return deny("SECURITY_PROVIDER_UNAVAILABLE");
  }

  try {
    // Het token moet onafhankelijk door de Security Worker
    // bij Supabase zijn gecontroleerd.
    const verifiedSession = await verifySession(accessToken);

    if (
      !verifiedSession ||
      typeof verifiedSession.userId !== "string" ||
      typeof verifiedSession.sessionId !== "string" ||
      !Number.isSafeInteger(verifiedSession.mfaVerifiedAtSeconds)
    ) {
      return deny("MFA_VERIFICATION_FAILED");
    }

    // Pas na succesvolle verificatie een geregistreerde
    // sessie uit de beveiligde database opvragen.
    const registeredSession =
      await loadRegisteredSession(verifiedSession);

    if (!registeredSession) {
      return deny("SESSION_NOT_REGISTERED");
    }

    // Geen netwerkvertrouwen afleiden uit browserheaders.
    // De echte implementatie moet dit server-side bewijzen.
    const trustedNetwork = await verifyNetwork({
      verifiedSession,
      registeredSession
    });

    return evaluateCentralSessionPolicy({
      verifiedSession,
      registeredSession,
      trustedNetwork,
      nowSeconds
    });
  } catch {
    // Geen tokens, identificaties of netwerkdetails loggen.
    return deny("SECURITY_CHECK_FAILED");
  }
}