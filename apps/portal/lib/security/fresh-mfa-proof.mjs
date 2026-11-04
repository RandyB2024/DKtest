/**
 * Vergelijkt geverifieerde TOTP-tijdstippen.
 * Dit is een aanvullende controle, geen zelfstandig MFA-bewijs.
 *
 * Tijden zijn Unix-seconden, afkomstig uit de door
 * Supabase geverifieerde AMR-claims.
 */
export function hasFreshMfaProof({
  previousTotpSeconds,
  currentTotpSeconds,
  nowSeconds = Math.floor(Date.now() / 1000)
}) {
  if (
    !Number.isSafeInteger(currentTotpSeconds) ||
    !Number.isSafeInteger(nowSeconds) ||
    currentTotpSeconds <= 0 ||
    currentTotpSeconds > nowSeconds ||
    nowSeconds - currentTotpSeconds > 300
  ) {
    return false;
  }

  if (previousTotpSeconds === null) {
    return true;
  }

  return (
    Number.isSafeInteger(previousTotpSeconds) &&
    previousTotpSeconds > 0 &&
    currentTotpSeconds > previousTotpSeconds
  );
}