// A browser GPS fix turned into the drive mode's location: km/h instead of
// m/s, and a bearing that is always a number. Pure — the session feeds it
// Coordinates and the previous location, the engine reads the result.

import type { DriveLocation } from "./engine";
import { computeHeading, distanceBetween, type LatLng } from "./geo";

// The fields of the browser's GeolocationCoordinates the drive mode reads.
export type FixCoords = {
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
};

// A real displacement carries a course; jitter below this would spin the
// arrow — the previous bearing holds for it.
const MIN_COURSE_DISTANCE = 10;

export function locationFromFix(
  coords: FixCoords,
  previous: DriveLocation | null,
): DriveLocation {
  const latLng = { lat: coords.latitude, lng: coords.longitude };
  const speed = coords.speed !== null && coords.speed > 0 ? Math.round(coords.speed * 3.6) : 0;
  return { latLng, bearing: resolveBearing(coords.heading, latLng, previous), speed };
}

// Coordinates.heading is null without movement or on platforms that don't
// report it (and NaN on some): the course over ground from the previous fix
// stands in, same as the app's bearing staying until the GPS sends a new one.
function resolveBearing(
  heading: number | null,
  to: LatLng,
  previous: DriveLocation | null,
): number {
  if (heading !== null && !Number.isNaN(heading)) {
    return heading;
  }
  if (previous && previous.speed > 0) {
    if (distanceBetween(previous.latLng, to) > MIN_COURSE_DISTANCE) {
      return (computeHeading(previous.latLng, to) + 360) % 360;
    }
    return previous.bearing;
  }
  return 0;
}
