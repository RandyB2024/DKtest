function validIp(value) {
  if (typeof value !== "string" || !value || value !== value.trim()) {
    return false;
  }

  if (value.includes(":")) {
    try {
      const url = new URL(`http://[${value}]/`);
      return url.hostname.startsWith("[") &&
        url.hostname.endsWith("]");
    } catch {
      return false;
    }
  }

  const parts = value.split(".");
  return parts.length === 4 &&
    parts.every(part =>
      /^(0|[1-9][0-9]{0,2})$/.test(part) &&
      Number(part) <= 255
    );
}

function coordinate(value, min, max) {
  if (typeof value !== "string" &&
      typeof value !== "number") return null;

  if (typeof value === "string" && !value.trim()) return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) &&
    parsed >= min &&
    parsed <= max ? parsed : null;
}

/**
 * trustedEdge must be established by trusted server infrastructure,
 * NEVER by a browser header, query parameter or cookie.
 *
 * A Request or its cf object alone is not proof of provenance.
 */
export function readCloudflareContext(request, { trustedEdge = false } = {}) {
  if (!trustedEdge || !request?.headers) {
    return {
      trusted: false,
      ip: null,
      location: null,
      reason: "UNTRUSTED_EDGE"
    };
  }

  const ip = request.headers.get("cf-connecting-ip");

  if (!validIp(ip)) {
    return {
      trusted: false,
      ip: null,
      location: null,
      reason: "INVALID_EDGE_IP"
    };
  }

  const latitude = coordinate(request.cf?.latitude, -90, 90);
  const longitude = coordinate(request.cf?.longitude, -180, 180);

  const location = latitude !== null && longitude !== null
    ? { latitude, longitude }
    : null;

  return {
    trusted: true,
    ip,
    location,
    reason: location ? "EDGE_LOCATION_AVAILABLE" : "EDGE_LOCATION_UNKNOWN"
  };
}