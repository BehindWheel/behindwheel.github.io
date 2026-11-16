// The drive mode session — the web counterpart of the app's drive flow:
// continuous GPS, the animated user arrow, the camera that follows, the
// alert engine per fix and the voice. Like MarkerTiers, it is a plain class
// owning imperative map state; React reads its snapshot through a listener.

import * as maplibregl from "maplibre-gl";
import type { CdnData } from "../cdn";
import {
  computeAlerts,
  computeOverSpeed,
  type Alert,
  type AlertableCamera,
  type DriveLocation,
  type OverSpeedAlert,
} from "../alerts/engine";
import { alertableCameras } from "../alerts/events";
import { AlertSoundController } from "../alerts/sounds";
import { DynamicZoom } from "../alerts/dynamicZoom";
import { computeHeading, distanceBetween, type LatLng } from "../alerts/geo";

// The app's NavigationMarker animation: positions glide over 1400 ms, a jump
// past 300 m (a cold GPS fix, tunnel exit) snaps instead of flying.
const ANIMATION_MS = 1400;
const SNAP_DISTANCE = 300;
// The app's in-city alert radius default. The app picks 600 in a city and
// 1000 outside through its city polygons, which the web data doesn't carry —
// the closer radius is the safe default: fewer false alerts on crossed roads.
const ALERT_RADIUS = 600;

export type DriveState = {
  location: DriveLocation | null;
  alerts: Alert[];
  overSpeed: OverSpeedAlert;
};

export class DriveSession {
  private map: maplibregl.Map;
  private events: AlertableCamera[];
  private sound: AlertSoundController;
  private onChange: (state: DriveState) => void;

  private watchId: number | null = null;
  private marker: maplibregl.Marker | null = null;
  private arrow: HTMLElement | null = null;
  private zoomCalculator = new DynamicZoom();
  private location: DriveLocation | null = null;
  private alerts: Alert[] = [];
  private overSpeed: OverSpeedAlert = { kind: "none" };
  private lastOverSpeed: OverSpeedAlert = { kind: "none" };
  // The marker glide: rAF interpolation between the previous fix and the new
  // one, restarted from the interpolated position when a fix lands mid-glide.
  private animation: { start: LatLng; end: LatLng; startedAt: number; frame: number } | null =
    null;

  constructor(
    map: maplibregl.Map,
    data: CdnData,
    onChange: (state: DriveState) => void,
  ) {
    this.map = map;
    this.events = alertableCameras(data);
    this.onChange = onChange;
    this.sound = new AlertSoundController();
  }

  start(): void {
    this.watchId = navigator.geolocation.watchPosition(
      (position) => this.onFix(position),
      () => {
        // A denied permission or a dead GPS signal: the mode stays on with
        // the last fix — the pill and the error face stay out of drive mode.
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    );
  }

  stop(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.stopAnimation();
    if (this.marker) {
      this.marker.remove();
      this.marker = null;
      this.arrow = null;
    }
    this.sound.stop();
    this.location = null;
    this.alerts = [];
    this.overSpeed = { kind: "none" };
    this.lastOverSpeed = { kind: "none" };
    this.publish();
  }

  private onFix(position: GeolocationPosition): void {
    const coords = position.coords;
    const speed = coords.speed !== null && coords.speed > 0 ? Math.round(coords.speed * 3.6) : 0;
    // Coordinates.heading is null without movement or on platforms that
    // don't report it — the course over ground from the previous fix stands
    // in, same as the app's bearing staying until the GPS sends a new one.
    const bearing = this.resolveBearing(coords.heading, coords);
    this.location = { latLng: { lat: coords.latitude, lng: coords.longitude }, bearing, speed };

    this.ensureMarker();
    this.placeMarker();
    this.followCamera();

    this.alerts = computeAlerts(this.events, this.location, ALERT_RADIUS);
    for (const alert of this.alerts) {
      this.sound.playCameraLimit(alert.id, alert.speedLimit, alert.cameraType);
    }

    this.overSpeed = computeOverSpeed(this.alerts, this.location.speed);
    // The app emits over-speed on the state change (distinctUntilChanged):
    // Regular → Double re-warns, a steady state doesn't. The tracker's five
    // seconds backstop repeats the phrase while the driver keeps speeding.
    if (this.overSpeed.kind !== "none" && !sameOverSpeed(this.overSpeed, this.lastOverSpeed)) {
      this.sound.playOverSpeed();
    }
    this.lastOverSpeed = this.overSpeed;

    this.publish();
  }

  private resolveBearing(heading: number | null, coords: GeolocationCoordinates): number {
    if (heading !== null && !Number.isNaN(heading)) {
      return heading;
    }
    if (this.location && this.location.speed > 0) {
      const from = this.location.latLng;
      const to = { lat: coords.latitude, lng: coords.longitude };
      // A real displacement carries a course; jitter below 10 m would spin
      // the arrow — hold the previous bearing for it.
      if (distanceBetween(from, to) > 10) {
        return (computeHeading(from, to) + 360) % 360;
      }
      return this.location.bearing;
    }
    return 0;
  }

  private ensureMarker(): void {
    if (this.marker) {
      return;
    }
    // The navigation arrow: a one-off stateful glyph, inline SVG in
    // currentColor (the icons rule) — the inner element carries the bearing
    // rotation so the anchor stays on the point.
    const element = document.createElement("div");
    element.className = "drive-marker";
    const arrow = document.createElement("span");
    arrow.className = "drive-arrow";
    arrow.innerHTML =
      '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">' +
      '<path d="M12 2 L19 21 L12 17 L5 21 Z" fill="currentColor" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>' +
      "</svg>";
    element.appendChild(arrow);
    this.arrow = arrow;
    this.marker = new maplibregl.Marker({ element, anchor: "center" })
      .setLngLat([this.location!.latLng.lng, this.location!.latLng.lat])
      .addTo(this.map);
  }

  private placeMarker(): void {
    if (!this.marker || !this.location) {
      return;
    }
    const target = this.location.latLng;
    const arrow = this.arrow;
    if (arrow) {
      arrow.style.transform = `rotate(${Math.round(this.location.bearing)}deg)`;
    }
    const current = this.animation
      ? lerp(this.animation.start, this.animation.end, this.progress())
      : target;
    this.stopAnimation();
    const jump =
      distanceBetween(current, target) > SNAP_DISTANCE ||
      this.location.speed === 0;
    if (jump) {
      this.marker.setLngLat([target.lng, target.lat]);
      return;
    }
    this.animation = {
      start: current,
      end: target,
      startedAt: performance.now(),
      frame: requestAnimationFrame(this.tick),
    };
  }

  private progress(): number {
    return this.animation
      ? Math.min((performance.now() - this.animation.startedAt) / ANIMATION_MS, 1)
      : 1;
  }

  private tick = (): void => {
    if (!this.animation || !this.marker) {
      return;
    }
    const t = this.progress();
    const at = lerp(this.animation.start, this.animation.end, t);
    this.marker.setLngLat([at.lng, at.lat]);
    if (t < 1) {
      this.animation.frame = requestAnimationFrame(this.tick);
    } else {
      this.animation = null;
    }
  };

  private stopAnimation(): void {
    if (this.animation) {
      cancelAnimationFrame(this.animation.frame);
      this.animation = null;
    }
  }

  private followCamera(): void {
    if (!this.location) {
      return;
    }
    const zoom = this.zoomCalculator.calculate(this.location.speed);
    const current = this.map.getZoom();
    // Center always glides to the fix; the zoom moves only when the dynamic
    // calculator steps it — a per-fix zoom set would fight the user's pinch.
    const next = Math.abs(zoom - current) >= 0.05 ? zoom : undefined;
    this.map.easeTo({
      center: [this.location.latLng.lng, this.location.latLng.lat],
      duration: 1100,
      easing: (t) => t,
      ...(next !== undefined ? { zoom: next } : {}),
    });
  }

  private publish(): void {
    this.onChange({
      location: this.location,
      alerts: this.alerts,
      overSpeed: this.overSpeed,
    });
  }
}

function lerp(from: LatLng, to: LatLng, t: number): LatLng {
  return {
    lat: from.lat + (to.lat - from.lat) * t,
    lng: from.lng + (to.lng - from.lng) * t,
  };
}

function sameOverSpeed(a: OverSpeedAlert, b: OverSpeedAlert): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  if (a.kind === "double" && b.kind === "double") {
    return a.cameraId === b.cameraId;
  }
  if (a.kind === "regular" && b.kind === "regular") {
    return a.speedLimit === b.speedLimit;
  }
  return true;
}
