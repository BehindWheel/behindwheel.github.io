"use client";

import { DRIVE_START_LABEL, DRIVE_STOP_LABEL } from "@/lib/alerts/messages";

type DriveButtonProps = {
  active: boolean;
  onToggle: () => void;
};

// The drive mode's start/stop toggle: the car glyph in the filter buttons'
// skin, blue while the mode runs, its label flipping between the two faces.
export default function DriveButton({ active, onToggle }: DriveButtonProps) {
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
