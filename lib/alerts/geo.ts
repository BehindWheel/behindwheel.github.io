// Spherical geometry, a port of the mobile app's location library
// (kmp/libraries/location/util/SphericalUtil.kt + Math.kt): the alert engine
// must make the same distance, offset and heading calls the drive mode makes,
// so the corridor check behaves identically on the road.

export type LatLng = {
  lat: number;
  lng: number;
};

const EARTH_RADIUS = 6371009.0;
const DEGREES_TO_RADIANS = 0.017453292519943295;
const RADIANS_TO_DEGREES = 57.29577951308232;

function toRadians(angdeg: number): number {
  return angdeg * DEGREES_TO_RADIANS;
}

function toDegrees(angrad: number): number {
  return angrad * RADIANS_TO_DEGREES;
}

function mod(x: number, m: number): number {
  return ((x % m) + m) % m;
}

function wrap(n: number, min: number, max: number): number {
  return n >= min && n < max ? n : mod(n - min, max - min) + min;
}

// Inverse haversine — good numerical stability around 0, same as the app.
function arcHav(x: number): number {
  return 2 * Math.asin(Math.sqrt(x));
}

function hav(x: number): number {
  const sinHalf = Math.sin(x * 0.5);
  return sinHalf * sinHalf;
}

function havDistance(lat1: number, lat2: number, dLng: number): number {
  return hav(lat1 - lat2) + hav(dLng) * Math.cos(lat1) * Math.cos(lat2);
}

function distanceRadians(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  return arcHav(havDistance(lat1, lat2, lng1 - lng2));
}

// Great-circle distance in meters.
export function distanceBetween(from: LatLng, to: LatLng): number {
  return (
    distanceRadians(
      toRadians(from.lat),
      toRadians(from.lng),
      toRadians(to.lat),
      toRadians(to.lng),
    ) * EARTH_RADIUS
  );
}

// The distance the alert engine rounds on — the app's roundDistanceTo.
export function roundDistanceTo(from: LatLng, to: LatLng): number {
  return Math.round(distanceBetween(from, to));
}

// The point `distance` meters away at compass bearing `heading`.
export function computeOffset(
  from: LatLng,
  distance: number,
  heading: number,
): LatLng {
  const d = distance / EARTH_RADIUS;
  const h = toRadians(heading);
  const fromLat = toRadians(from.lat);
  const fromLng = toRadians(from.lng);
  const cosDistance = Math.cos(d);
  const sinDistance = Math.sin(d);
  const sinFromLat = Math.sin(fromLat);
  const cosFromLat = Math.cos(fromLat);
  const sinLat = cosDistance * sinFromLat + sinDistance * cosFromLat * Math.cos(h);
  const dLng = Math.atan2(
    sinDistance * cosFromLat * Math.sin(h),
    cosDistance - sinFromLat * sinLat,
  );
  return { lat: toDegrees(Math.asin(sinLat)), lng: toDegrees(fromLng + dLng) };
}

// Initial compass heading from → to, in [-180, 180).
export function computeHeading(from: LatLng, to: LatLng): number {
  const fromLat = toRadians(from.lat);
  const fromLng = toRadians(from.lng);
  const toLat = toRadians(to.lat);
  const toLng = toRadians(to.lng);
  const dLng = toLng - fromLng;
  const heading = Math.atan2(
    Math.sin(dLng) * Math.cos(toLat),
    Math.cos(fromLat) * Math.sin(toLat) -
      Math.sin(fromLat) * Math.cos(toLat) * Math.cos(dLng),
  );
  return wrap(toDegrees(heading), -180, 180);
}
