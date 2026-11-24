// The drive mode session — the web counterpart of the app's drive flow:
// continuous GPS, the animated user arrow, the camera that follows, the
// alert engine per fix and the voice. Like MarkerTiers, it is a plain class
// owning imperative map state; React reads its snapshot through a listener.

import type * as maplibregl from "maplibre-gl";
import type { CdnData } from "../cdn";
import {
  computeAlerts,
  computeOverSpeed,
  isSameOverSpeed,
  type Alert,
  type AlertableCamera,
  type DriveLocation,
  type OverSpeedAlert,
} from "./engine";
import { alertableCameras } from "./events";
import { locationFromFix } from "./fix";
import { AlertSoundController } from "./sounds";
import { DynamicZoom } from "./dynamicZoom";
import { ScreenWakeLock } from "./wakeLock";
import { UserArrow } from "./userArrow";
import { GPS_ERROR_DENIED, GPS_ERROR_INSECURE, GPS_ERROR_UNAVAILABLE } from "./messages";

// The app's in-city alert radius default. The app picks 600 in a city and
// 1000 outside through its city polygons, which the web data doesn't carry —
// the closer radius is the safe default: fewer false alerts on crossed roads.
const ALERT_RADIUS = 600;

export type DriveState = {
  location: DriveLocation | null;
  alerts: Alert[];
  overSpeed: OverSpeedAlert;
  // Why the phone has no fixes: a denied permission, an insecure origin or
  // a dead GPS signal — shown as a pill, cleared by the first good fix.
  gpsError: string | null;
};

export class DriveSession {
  private readonly map: maplibregl.Map;
  private readonly events: AlertableCamera[];
  private readonly onChange: (state: DriveState) => void;
  private readonly arrow: UserArrow;
  private readonly sound = new AlertSoundController();
  private readonly zoomCalculator = new DynamicZoom();
  // A locked phone screen suspends the page, GPS and voice with it.
  private readonly wakeLock = new ScreenWakeLock();

  private watchId: number | null = null;
  private location: DriveLocation | null = null;
  private alerts: Alert[] = [];
  private overSpeed: OverSpeedAlert = { kind: "none" };
  private lastOverSpeed: OverSpeedAlert = { kind: "none" };
  private gpsError: string | null = null;

  constructor(
    map: maplibregl.Map,
    data: CdnData,
    onChange: (state: DriveState) => void,
  ) {
    this.map = map;
    this.events = alertableCameras(data);
    this.onChange = onChange;
    this.arrow = new UserArrow(map);
  }

  start(): void {
    // start() runs inside the drive button's tap: the one moment the browser
    // lets the page unlock audio for the GPS-driven phrases to come.
    this.sound.unlock();
    // Geolocation is a secure-context API: an http:// page (a phone opening
    // the LAN address) never gets a permission prompt at all — say so before
    // the silent failure reads as a broken feature. No watch is started: the
    // browser would answer it with PERMISSION_DENIED and the error callback
    // would replace this (right) explanation with a wrong "grant access" one.
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      this.gpsError = GPS_ERROR_INSECURE;
      this.publish();
      return;
    }
    this.wakeLock.acquire();
    this.watchId = navigator.geolocation.watchPosition(
      (position) => this.onFix(position),
      (error) => {
        this.gpsError =
          error.code === error.PERMISSION_DENIED ? GPS_ERROR_DENIED : GPS_ERROR_UNAVAILABLE;
        this.publish();
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    );
  }

  stop(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.arrow.remove();
    this.sound.stop();
    this.wakeLock.release();
    this.location = null;
    this.alerts = [];
    this.overSpeed = { kind: "none" };
    this.lastOverSpeed = { kind: "none" };
    this.gpsError = null;
    this.publish();
  }

  private onFix(position: GeolocationPosition): void {
    const location = locationFromFix(position.coords, this.location);
    this.location = location;
    this.gpsError = null;

    this.arrow.update(location.latLng, location.bearing, location.speed > 0);
    this.followCamera(location);

    this.alerts = computeAlerts(this.events, location, ALERT_RADIUS);
    for (const alert of this.alerts) {
      this.sound.playCameraLimit(alert.id, alert.speedLimit, alert.cameraType);
    }

    this.overSpeed = computeOverSpeed(this.alerts, location.speed);
    // The app emits over-speed on the state change (distinctUntilChanged):
    // Regular → Double re-warns, a steady state doesn't, and slowing down
    // then speeding up again is a fresh state. The tracker's five seconds
    // only keep a driver hovering at the limit from being nagged.
    if (this.overSpeed.kind !== "none" && !isSameOverSpeed(this.overSpeed, this.lastOverSpeed)) {
      this.sound.playOverSpeed();
    }
    this.lastOverSpeed = this.overSpeed;

    this.publish();
  }

  private followCamera(location: DriveLocation): void {
    const zoom = this.zoomCalculator.calculate(location.speed);
    const current = this.map.getZoom();
    // Center always glides to the fix; the zoom moves only when the dynamic
    // calculator steps it — a per-fix zoom set would fight the user's pinch.
    const next = Math.abs(zoom - current) >= 0.05 ? zoom : undefined;
    this.map.easeTo({
      center: [location.latLng.lng, location.latLng.lat],
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
      gpsError: this.gpsError,
    });
  }
}
