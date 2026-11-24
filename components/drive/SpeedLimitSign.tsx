"use client";

import type { OverSpeedAlert } from "@/lib/alerts/engine";
import { OVER_SPEED_LABEL } from "@/lib/alerts/messages";

type SpeedLimitSignProps = {
  overSpeed: OverSpeedAlert;
};

// The over-speed face: the nearest camera's limit in a traffic-sign circle —
// red ring, white ground, black digits, regardless of the theme (traffic-sign
// artwork, deliberately unthemed). Shown only while the drive is over the
// limit.
export default function SpeedLimitSign({ overSpeed }: SpeedLimitSignProps) {
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
