"use client";

import type { DriveState } from "@/lib/alerts/driveSession";
import DriveAlertCards from "@/components/drive/DriveAlertCards";
import GpsNotice from "@/components/drive/GpsNotice";
import SpeedLimitSign from "@/components/drive/SpeedLimitSign";

type DriveOverlayProps = {
  state: DriveState;
};

// Everything the map shows while the drive mode runs, apart from its toggle:
// the alert cards, the over-speed sign and the GPS notice. The parent mounts
// it only for an active session, so the three vanish together on exit.
export default function DriveOverlay({ state }: DriveOverlayProps) {
  return (
    <>
      <DriveAlertCards alerts={state.alerts} />
      <SpeedLimitSign overSpeed={state.overSpeed} />
      {state.gpsError && <GpsNotice error={state.gpsError} />}
    </>
  );
}
