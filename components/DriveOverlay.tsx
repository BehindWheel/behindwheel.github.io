"use client";

// The drive-mode chrome: the start/stop button, the alert cards and the
// speed-limit sign. The cards mirror the app's drive alerts (an icon, the
// camera kind, the distance), the sign appears while the drive is over a
// nearest camera's limit — traffic-sign artwork, deliberately unthemed.

import type { DriveState } from "@/lib/alerts/driveSession";
import type { Alert, OverSpeedAlert } from "@/lib/alerts/engine";
import {
  CAMERA_TITLES,
  DISTANCE_UNIT,
  DRIVE_START_LABEL,
  DRIVE_STOP_LABEL,
  OVER_SPEED_LABEL,
} from "@/lib/alerts/messages";


const ALERT_ICONS: Record<Alert["cameraType"], string> = {
  stationary: "/icons/camera.svg",
  mediumSpeed: "/icons/medium-speed.svg",
  mobile: "/icons/camera.svg",
};

export function DriveButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  const label = active ? DRIVE_STOP_LABEL : DRIVE_START_LABEL;
  return (
    <button
      type="button"
      className={`filter-button drive-button${active ? " drive-button-active" : ""}`}
      aria-label={label}
      title={label}
      onClick={onToggle}
    >
      <span className="svg-icon icon-car" aria-hidden="true" />
    </button>
  );
}

// The nearest two alerts fill the card column — a driver passes a handful of
// cameras at once at most, and the voice already says everything the card
// would. Sorted by distance, the closest on top, like the app's list.
export function DriveAlertCards({ state }: { state: DriveState }) {
  const nearest = [...state.alerts].sort((a, b) => a.distance - b.distance).slice(0, 2);
  if (nearest.length === 0) {
    return null;
  }
  return (
    <div className="drive-cards" role="status" aria-live="polite">
      {/* The key must not carry the distance: it changes every fix, and a
          remounted card makes the live region read out again each second.
          The index tells apart the two ends of one section (same id). */}
      {nearest.map((alert, index) => (
        <div className="drive-card" key={`${alert.id}:${index}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="drive-card-icon" src={ALERT_ICONS[alert.cameraType]} alt="" />
          <div className="drive-card-text">
            <span className="drive-card-title">{CAMERA_TITLES[alert.cameraType]}</span>
            <span className="drive-card-distance">
              {alert.distance} {DISTANCE_UNIT}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// The over-speed face: the nearest camera's limit in a traffic-sign circle —
// red ring, white ground, black digits, regardless of the theme.
export function SpeedLimitSign({ overSpeed }: { overSpeed: OverSpeedAlert }) {
  if (overSpeed.kind === "none") {
    return null;
  }
  return (
    <div
      className="speed-sign"
      role="alert"
      aria-live="assertive"
      aria-label={OVER_SPEED_LABEL(overSpeed.speedLimit)}
    >
      {overSpeed.speedLimit}
    </div>
  );
}

// Why the map has no fixes: an insecure origin, a denied permission, a dead
// GPS. The mode keeps running — the pill rides above the drive button and
// the first good fix clears it.
export function GpsNotice({ error }: { error: string }) {
  return (
    <div className="drive-gps-error" role="status">
      {error}
    </div>
  );
}
