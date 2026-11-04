import { readCloudflareContext } from "./cloudflare-context.mjs";
import { evaluateIpTrust } from "./trusted-ip.mjs";
import { evaluateLocationReverification } from "./location-reverification.mjs";

/**
 * Alleen server-side gebruiken.
 *
 * Tijdcontract:
 * - now en mfaVerifiedAt zijn Unix-milliseconden.
 * - evaluateIpTrust ontvangt Unix-seconden.
 * - locatie-waarnemingen gebruiken milliseconden.
 *
 * trustedEdge moet door infrastructuur worden vastgesteld.
 * Deze functie verleent zelf nooit toegang.
 */
export function evaluateRequestRisk({
  request,
  trustedEdge = false,
  trustedIp = null,
  previousLocation = null,
  mfaVerifiedAt = null,
  now = Date.now()
} = {}) {
  const edge = readCloudflareContext(request, { trustedEdge });

  if (!edge.trusted || !edge.ip) {
    return {
      decision: "block",
      reason: "UNTRUSTED_REQUEST_CONTEXT"
    };
  }

  if (!Number.isSafeInteger(now) || now <= 0) {
    return {
      decision: "block",
      reason: "INVALID_SERVER_TIME"
    };
  }

  if (
    typeof trustedIp !== "string" ||
    !trustedIp ||
    !Number.isSafeInteger(mfaVerifiedAt) ||
    mfaVerifiedAt <= 0
  ) {
    return {
      decision: "reauthenticate",
      reason: "UNVERIFIED_SESSION_CONTEXT"
    };
  }

  // De IP-controle rekent met seconden; beide waarden
  // moeten dezelfde tijdseenheid hebben.
  const ip = evaluateIpTrust({
    currentIp: edge.ip,
    trustedIp,
    mfaVerifiedAt: new Date(mfaVerifiedAt).toISOString(),
    now
  });

  const currentLocation = edge.location
    ? { ...edge.location, timestamp: now }
    : null;

  const location = evaluateLocationReverification(
    previousLocation,
    currentLocation
  );

  if (location.decision === "reauthenticate") {
    return {
      decision: "reauthenticate",
      reason: location.reason
    };
  }

  if (!ip.trusted) {
    return {
      decision: "reauthenticate",
      reason: ip.reason
    };
  }

  return {
    decision: "no_additional_challenge",
    reason: location.decision === "unknown"
      ? "LOCATION_UNAVAILABLE"
      : "NORMAL_RISK"
  };
}