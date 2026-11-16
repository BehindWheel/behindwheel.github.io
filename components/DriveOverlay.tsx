"use client";

// The drive-mode chrome: the start/stop button, the alert cards and the
// speed-limit sign. The cards mirror the app's drive alerts (an icon, the
// camera kind, the distance), the sign appears while the drive is over a
// nearest camera's limit — traffic-sign artwork, deliberately unthemed.

import type { DriveState } from "@/lib/alerts/driveSession";
import type { Alert, OverSpeedAlert } from "@/lib/alerts/engine";

const ALERT_TITLES: Record<Alert["cameraType"], string> = {
  stationary: "Стационарная камера",
  mediumSpeed: "Участок средней скорости",
  mobile: "Мобильная камера",
};

const ALERT_ICONS: Record<Alert["cameraType"], string> = {
  stationary: "/icons/camera.svg",
  mediumSpeed: "/icons/medium-speed.svg",
  mobile: "/icons/camera.svg",
};

export function DriveButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`filter-button drive-button${active ? " drive-button-active" : ""}`}
      aria-label={active ? "Завершить режим поездки" : "Включить режим поездки"}
      title={active ? "Завершить режим поездки" : "Включить режим поездки"}
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
      {nearest.map((alert) => (
        <div className="drive-card" key={`${alert.id}:${alert.distance}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="drive-card-icon" src={ALERT_ICONS[alert.cameraType]} alt="" />
          <div className="drive-card-text">
            <span className="drive-card-title">{ALERT_TITLES[alert.cameraType]}</span>
            <span className="drive-card-distance">{alert.distance} м</span>
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
      aria-label={`Превышение, ограничение ${overSpeed.speedLimit}`}
    >
      {overSpeed.speedLimit}
    </div>
  );
}
