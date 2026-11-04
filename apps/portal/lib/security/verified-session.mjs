const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Leest de sessie-identiteit uitsluitend uit door Supabase
 * geverifieerde claims en controleert de actuele gebruiker.
 *
 * Dit is GEEN autorisatiebeslissing en GEEN MFA-vrijstelling.
 */
export async function readVerifiedSession(client) {
  if (
    !client?.auth ||
    typeof client.auth.getClaims !== "function" ||
    typeof client.auth.getUser !== "function"
  ) {
    return null;
  }

  try {
    const { data: claimsData, error: claimsError } =
      await client.auth.getClaims();

    if (claimsError || !claimsData?.claims) {
      return null;
    }

    const claims = claimsData.claims;
    const userId = claims.sub;
    const sessionId = claims.session_id;

    if (
      typeof userId !== "string" ||
      typeof sessionId !== "string" ||
      !UUID_PATTERN.test(userId) ||
      !UUID_PATTERN.test(sessionId) ||
      claims.role !== "authenticated"
    ) {
      return null;
    }

    const { data: userData, error: userError } =
      await client.auth.getUser();

    if (
      userError ||
      !userData?.user ||
      userData.user.id.toLowerCase() !== userId.toLowerCase()
    ) {
      return null;
    }

    return {
      userId: userId.toLowerCase(),
      sessionId: sessionId.toLowerCase()
    };
  } catch {
    return null;
  }
}