// The voice-alert trigger engine, a port of the mobile app's guidance logic
// (kmp/features/guidance/domain/util/): the corridor distance, the camera
// angle and road-corridor checks, the over-speed classifier and the
// played-alert dedup. Speeds are km/h like the app's LocationInfo, bearings
// are degrees, distances meters — the web must warn at the same points the
// app does, so every constant is the app's.

import {
  computeHeading,
  computeOffset,
  distanceBetween,
  roundDistanceTo,
  type LatLng,
} from "./geo";

export type CameraType = "stationary" | "mobile" | "mediumSpeed";

// One alertable object reduced to what the engine reads: a camera (or, for a
// medium-speed section, one of its ends) with its direction. angle === -1 is
// the app's "no direction" marker — such a camera warns regardless of travel.
export type AlertableCamera = {
  id: string;
  position: LatLng;
  angle: number;
  bidirectional: boolean;
  speedLimit: number;
  cameraType: CameraType;
};

export type CameraAlert = {
  kind: "camera";
  id: string;
  distance: number;
  speedLimit: number;
  cameraType: CameraType;
};

export type Alert = CameraAlert;

// The drive-mode fix the engine consumes. speed is km/h — the browser's
// Coordinates.speed is m/s, the caller converts.
export type DriveLocation = {
  latLng: LatLng;
  bearing: number;
  speed: number;
};

// The app's AlertMessagesTransformation.kt constants.
const MIN_DISTANCE = 20;
const MIN_SPEED = 10;

// The app's AngleUtil.kt: a camera fires when the travel direction is
// opposite to the camera's facing angle (a speed camera watches oncoming
// traffic) within ±25°. Bidirectional cameras fire for either facing.
const ANGLE_THRESHOLD = 25;

// The app's RoadCorridorUtil.kt: |cross-track| within 40 m of the camera's
// road axis — a driver on a neighboring road inside the radius stays silent.
const ROAD_HALF_WIDTH = 40.0;

export function isAngleInRange(
  cameraAngle: number,
  bearing: number,
  bidirectional: boolean,
): boolean {
  if (bidirectional) {
    return (
      isOppositeAngle(cameraAngle, bearing) ||
      isOppositeAngle(opposite(cameraAngle), bearing)
    );
  }
  return isOppositeAngle(cameraAngle, bearing);
}

function isOppositeAngle(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  return diff >= 180 - ANGLE_THRESHOLD && diff <= 180 + ANGLE_THRESHOLD;
}

function opposite(angle: number): number {
  return (angle + 180) % 360;
}

// True when the user sits within ROAD_HALF_WIDTH meters of the camera's road
// axis — the cross-track distance is distance(camera, user) ×
// sin(headingToUser − cameraAngle).
export function isUserOnCameraRoad(
  cameraLatLng: LatLng,
  cameraAngle: number,
  userLatLng: LatLng,
): boolean {
  const distToUser = distanceBetween(cameraLatLng, userLatLng);
  if (distToUser < 1.0) return true; // user is essentially at the camera

  const headingToUser = computeHeading(cameraLatLng, userLatLng);
  let angleDiff = headingToUser - cameraAngle;
  angleDiff = ((angleDiff % 360.0) + 540.0) % 360.0 - 180.0;
  const crossTrackDistance = distToUser * Math.sin((angleDiff * Math.PI) / 180.0);
  return Math.abs(crossTrackDistance) <= ROAD_HALF_WIDTH;
}

// The app's alertMessagesTransformation: no alerts below MIN_SPEED or without
// a location fix; cameras additionally need their direction checks.
export function computeAlerts(
  events: AlertableCamera[],
  location: DriveLocation | null,
  alertRadius: number,
): Alert[] {
  if (!location || location.speed <= MIN_SPEED) {
    return [];
  }
  // The corridor's offset point is the same for every event in a fix — one
  // computeOffset per fix, not per event.
  const offsetLatLng = computeOffset(location.latLng, alertRadius, location.bearing);
  const alerts: Alert[] = [];
  for (const event of events) {
    const distance = corridorDistance(event.position, location, alertRadius, offsetLatLng);
    if (distance === null) {
      continue;
    }
    if (event.angle === -1) {
      alerts.push(toCameraAlert(event, distance));
      continue;
    }
    const inRange = isAngleInRange(
      event.angle,
      location.bearing,
      event.bidirectional,
    );
    const onRoad = inRange && isUserOnCameraRoad(event.position, event.angle, location.latLng);
    if (onRoad) {
      alerts.push(toCameraAlert(event, distance));
    }
  }
  return alerts;
}

// The app's corridor pre-check: the event must sit inside the circle of
// alertRadius drawn alertRadius ahead of the driver (the offset point), and
// MIN_DISTANCE..alertRadius meters from the driver itself — events just
// passed or behind stay silent until the driver leaves and re-approaches.
function corridorDistance(
  eventLatLng: LatLng,
  location: DriveLocation,
  alertRadius: number,
  offsetLatLng: LatLng,
): number | null {
  const distanceBetweenOffsetAndEvent = roundDistanceTo(eventLatLng, offsetLatLng);
  if (distanceBetweenOffsetAndEvent >= alertRadius) {
    return null;
  }
  const distanceToEvent = roundDistanceTo(location.latLng, eventLatLng);
  return distanceToEvent >= MIN_DISTANCE && distanceToEvent < alertRadius
    ? distanceToEvent
    : null;
}

function toCameraAlert(event: AlertableCamera, distance: number): CameraAlert {
  return {
    kind: "camera",
    id: event.id,
    distance,
    speedLimit: event.speedLimit,
    cameraType: event.cameraType,
  };
}

// The app's OverSpeedAlert.kt: driving at least ALLOWED_OVER_SPEED over a
// nearest camera's limit — Regular far away, Double within
// DOUBLE_OVER_SPEED_DISTANCE of it (the "double" warning repeats sooner and
// means "slow down now").
const ALLOWED_OVER_SPEED = 2;
const DOUBLE_OVER_SPEED_DISTANCE = 150;

export type OverSpeedAlert =
  | { kind: "none" }
  | { kind: "regular"; speedLimit: number }
  | { kind: "double"; cameraId: string; speedLimit: number };

export function computeOverSpeed(
  alerts: Alert[],
  currentSpeed: number,
): OverSpeedAlert {
  const nearestOverSpeedCamera = alerts
    .filter((alert) => currentSpeed >= alert.speedLimit + ALLOWED_OVER_SPEED)
    .sort((a, b) => a.distance - b.distance)[0];

  if (!nearestOverSpeedCamera) {
    return { kind: "none" };
  }
  if (nearestOverSpeedCamera.distance <= DOUBLE_OVER_SPEED_DISTANCE) {
    return {
      kind: "double",
      cameraId: nearestOverSpeedCamera.id,
      speedLimit: nearestOverSpeedCamera.speedLimit,
    };
  }
  return { kind: "regular", speedLimit: nearestOverSpeedCamera.speedLimit };
}

// The app's PlayedAlertTracker: one alert id stays silent for five minutes
// once played (over-speed five seconds), so cruising past a camera warns
// once, not every GPS fix. History entries older than thirty minutes drop.
export class PlayedAlertTracker {
  private history = new Map<string, number>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  shouldPlay(id: string, expirationMs: number = FIVE_MINUTES): boolean {
    const lastPlayed = this.history.get(id);
    if (lastPlayed === undefined) {
      return true;
    }
    return this.now() - lastPlayed > expirationMs;
  }

  record(id: string): void {
    this.history.set(id, this.now());
  }

  // Takes an id back: a phrase that was recorded but never sounded (the
  // browser refused to play it) must be allowed again on the next fix.
  forget(id: string): void {
    this.history.delete(id);
  }

  cleanup(): void {
    const currentTime = this.now();
    for (const [id, playedAt] of this.history) {
      if (currentTime - playedAt > THIRTY_MINUTES) {
        this.history.delete(id);
      }
    }
  }
}

export const FIVE_SECONDS = 5_000;
export const FIVE_MINUTES = 5 * 60_000;
export const THIRTY_MINUTES = 30 * 60_000;
