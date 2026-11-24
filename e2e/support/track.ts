// The drive tracks the fake GPS feed plays, precomputed in Node.

import { computeOffset, type LatLng } from "../../lib/alerts/geo";

// The drive speed hardcoded into the fast fixtures: fast enough to exceed
// any camera limit the fixtures pick, so the over-speed face and phrase
// join the sequence.
const DRIVE_KMH = 80;

export type GpsFix = { lat: number; lng: number; heading: number; speedMs: number };

// Precomputes the whole GPS track in Node: from 650 m short of the target on
// the approach bearing, 30 m per fix, clamped at 25 m like the app's dead
// zone. lateralM shifts the whole track sideways — the perpendicular
// crossing that only the angle check may reject.
export function buildFixes(
  target: LatLng,
  bearing: number,
  opts: { lateralM?: number; speedKmh?: number; steps?: number } = {},
): GpsFix[] {
  const steps = opts.steps ?? 22;
  const speedMs = (opts.speedKmh ?? DRIVE_KMH) / 3.6;
  let at = computeOffset(target, 650, bearing + 180);
  if (opts.lateralM) {
    at = computeOffset(at, opts.lateralM, bearing + 90);
  }
  const fixes: GpsFix[] = [];
  for (let i = 0; i < steps; i++) {
    const fix = computeOffset(at, Math.min(i * 30, 625), bearing);
    fixes.push({ lat: fix.lat, lng: fix.lng, heading: bearing, speedMs });
  }
  return fixes;
}
