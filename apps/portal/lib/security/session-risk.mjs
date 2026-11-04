import { evaluateTravelRisk } from "./travel-risk.mjs";
import { evaluateIpTrust } from "./trusted-ip.mjs";

export function evaluateSessionRisk({
  currentIp,
  trustedIp,
  mfaVerifiedAt,
  previousLocation,
  currentLocation,
  now = Date.now()
}) {
  const ip = evaluateIpTrust({
    currentIp,
    trustedIp,
    mfaVerifiedAt,
    now
  });

  const travel = evaluateTravelRisk(
    previousLocation,
    currentLocation
  );

  if (travel.status === "high_risk") {
    return {
      decision: "block",
      reason: "IMPOSSIBLE_TRAVEL"
    };
  }

  if (ip.reason === "MFA_EXPIRED") {
    return {
      decision: "reauthenticate",
      reason: "MFA_EXPIRED"
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
    reason: travel.status === "unknown"
      ? "LOCATION_UNAVAILABLE"
      : "NORMAL_RISK"
  };
}