const MAX_MFA_AGE_SECONDS = 24 * 60 * 60;

/**
 * Pure server-side beleidsfunctie.
 * Geeft GEEN toegang op basis van browserheaders.
 *
 * trustedNetwork moet later door de beveiligde serverketen
 * zijn vastgesteld; niet door de client.
 *
 * registeredSession moet later uit een geautoriseerde,
 * server-side databasecontrole komen.
 */
export function evaluateCentralSessionPolicy({
  verifiedSession = null,
  registeredSession = null,
  trustedNetwork = false,
  nowSeconds = Math.floor(Date.now() / 1000)
} = {}) {
  const deny = reason => ({
    allowed: false,
    reason
  });

  if (!Number.isSafeInteger(nowSeconds) || nowSeconds <= 0) {
    return deny("INVALID_SERVER_TIME");
  }

  if (
    !verifiedSession ||
    typeof verifiedSession.userId !== "string" ||
    !verifiedSession.userId ||
    typeof verifiedSession.sessionId !== "string" ||
    !verifiedSession.sessionId ||
    !Number.isSafeInteger(verifiedSession.mfaVerifiedAtSeconds)
  ) {
    return deny("INVALID_VERIFIED_SESSION");
  }

  const age = nowSeconds - verifiedSession.mfaVerifiedAtSeconds;

  if (age < 0 || age >= MAX_MFA_AGE_SECONDS) {
    return deny("MFA_EXPIRED_OR_INVALID");
  }

  if (
    !registeredSession ||
    registeredSession.userId !== verifiedSession.userId ||
    registeredSession.sessionId !== verifiedSession.sessionId ||
    registeredSession.mfaVerifiedAtSeconds !==
      verifiedSession.mfaVerifiedAtSeconds ||
    registeredSession.status !== "active" ||
    registeredSession.revoked !== false
  ) {
    return deny("SESSION_NOT_REGISTERED");
  }

  // Alleen exact true is voldoende; onbekend is niet vertrouwd.
  if (trustedNetwork !== true) {
    return deny("NETWORK_NOT_VERIFIED");
  }

  return {
    allowed: true,
    reason: "VERIFIED"
  };
}