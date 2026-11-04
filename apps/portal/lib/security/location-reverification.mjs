export const DISTANCE_LIMIT_KM = 50;
export const TIME_WINDOW_MS = 30 * 60 * 1000;

function validLocation(value) {
  return value &&
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude) &&
    value.latitude >= -90 &&
    value.latitude <= 90 &&
    value.longitude >= -180 &&
    value.longitude <= 180 &&
    Number.isFinite(value.timestamp);
}

function distanceKm(a, b) {
  const radians = degrees => degrees * Math.PI / 180;
  const latitudeDifference = radians(b.latitude - a.latitude);
  const longitudeDifference = radians(b.longitude - a.longitude);

  const h =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(radians(a.latitude)) *
    Math.cos(radians(b.latitude)) *
    Math.sin(longitudeDifference / 2) ** 2;

  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

/**
 * Tijdstempels zijn Unix-milliseconden.
 * Vergelijk uitsluitend betrouwbare serverwaarnemingen.
 * Deze functie geeft geen authenticatie of toegang.
 */
export function evaluateLocationReverification(previous, current) {
  if (!validLocation(previous) || !validLocation(current)) {
    return { decision: "unknown", reason: "LOCATION_UNAVAILABLE" };
  }

  const elapsed = current.timestamp - previous.timestamp;

  if (elapsed < 0) {
    return { decision: "unknown", reason: "INVALID_LOCATION_TIME" };
  }

  const distance = distanceKm(previous, current);

  if (elapsed <= TIME_WINDOW_MS && distance > DISTANCE_LIMIT_KM) {
    return {
      decision: "reauthenticate",
      reason: "LOCATION_CHANGE_50KM_30MIN"
    };
  }

  return {
    decision: "no_additional_challenge",
    reason: "LOCATION_WITHIN_POLICY"
  };
}