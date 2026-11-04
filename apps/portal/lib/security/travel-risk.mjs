const EARTH_RADIUS_KM = 6371;
const MIN_DISTANCE_KM = 500;
const MAX_SPEED_KMH = 900;

export function distanceKm(a, b) {
  const rad = value => value * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
    Math.cos(rad(b.latitude)) *
    Math.sin(dLon / 2) ** 2;

  return EARTH_RADIUS_KM * 2 *
    Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)));
}

function validLocation(value) {
  return value &&
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude) &&
    Math.abs(value.latitude) <= 90 &&
    Math.abs(value.longitude) <= 180;
}

export function evaluateTravelRisk(previous, current) {
  if (!previous || !current ||
      !validLocation(previous) || !validLocation(current)) {
    return {
      status: "unknown",
      reason: "LOCATION_UNAVAILABLE"
    };
  }

  const oldTime = Date.parse(previous.timestamp);
  const newTime = Date.parse(current.timestamp);

  if (!Number.isFinite(oldTime) || !Number.isFinite(newTime) ||
      newTime <= oldTime) {
    return {
      status: "unknown",
      reason: "INVALID_TIME"
    };
  }

  const hours = (newTime - oldTime) / 3600000;
  const kilometers = distanceKm(previous, current);
  const speed = kilometers / hours;

  if (kilometers >= MIN_DISTANCE_KM && speed > MAX_SPEED_KMH) {
    return {
      status: "high_risk",
      reason: "IMPOSSIBLE_TRAVEL",
      distanceKm: Math.round(kilometers),
      speedKmh: Math.round(speed),
      action: "RESTRICT_AND_REVERIFY"
    };
  }

  return {
    status: "normal",
    reason: "NO_IMPOSSIBLE_TRAVEL",
    distanceKm: Math.round(kilometers),
    speedKmh: Math.round(speed)
  };
}