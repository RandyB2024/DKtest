const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const TRUST_MS = 24 * 60 * 60 * 1000;
const MIN_VERIFIED = 3;

export function preferredIp(records, now = Date.now()) {
  const counts = new Map();

  for (const record of records) {
    if (record.mfaVerified !== true) continue;
    if (typeof record.ip !== "string" || !record.ip) continue;

    const time = Date.parse(record.timestamp);

    if (!Number.isFinite(time)) continue;
    if (time > now || now - time > WINDOW_MS) continue;

    counts.set(record.ip, (counts.get(record.ip) ?? 0) + 1);
  }

  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1]);

  if (!ranked.length || ranked[0][1] < MIN_VERIFIED) {
    return null;
  }

  if (ranked[1] && ranked[1][1] === ranked[0][1]) {
    return null;
  }

  return ranked[0][0];
}

export function evaluateIpTrust({
  currentIp,
  trustedIp,
  mfaVerifiedAt,
  now = Date.now()
}) {
  const verifiedAt = Date.parse(mfaVerifiedAt);

  if (
    !Number.isFinite(verifiedAt) ||
    verifiedAt > now ||
    now - verifiedAt >= TRUST_MS
  ) {
    return { trusted: false, reason: "MFA_EXPIRED" };
  }

  if (!trustedIp || !currentIp) {
    return { trusted: false, reason: "IP_UNKNOWN" };
  }

  if (trustedIp !== currentIp) {
    return { trusted: false, reason: "IP_CHANGED" };
  }

  return { trusted: true, reason: "TRUSTED_SESSION_IP" };
}