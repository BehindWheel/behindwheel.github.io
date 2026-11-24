// The live CDN as a fixture source: the e2e drives toward real cameras and
// sections from the snapshot the page itself reads, so the approach tracks
// always start from objects that exist.

import type { MediumSpeedCamera, StationaryCamera } from "../../lib/cdn";
import type { LatLng } from "../../lib/alerts/geo";

const CDN = "https://cdn-data.behindwheel.workers.dev";

export type StationaryFixture = {
  id: string;
  point: LatLng;
  angle: number;
  bidirectional: boolean;
  speedLimit: number;
};

export type SectionFixture = {
  id: string;
  end: LatLng;
  endAngle: number;
  speedLimit: number;
};

async function fetchStationary(): Promise<StationaryCamera[]> {
  const manifest = (await (await fetch(`${CDN}/manifest.json`)).json()) as {
    features: Record<string, { url: string }>;
  };
  return (
    (await (await fetch(`${CDN}${manifest.features.stationary.url}`)).json()) as {
      items: StationaryCamera[];
    }
  ).items;
}

async function fetchSections(): Promise<MediumSpeedCamera[]> {
  const manifest = (await (await fetch(`${CDN}/manifest.json`)).json()) as {
    features: Record<string, { url: string }>;
  };
  return (
    (await (await fetch(`${CDN}${manifest.features["medium-speed"].url}`)).json()) as {
      items: MediumSpeedCamera[];
    }
  ).items;
}

export async function pickStationary(): Promise<StationaryFixture> {
  // A camera the 80 km/h drive actually exceeds.
  const usable = (await fetchStationary()).filter(
    (c) => c.point && c.speedCar >= 40 && c.speedCar <= 75,
  );
  if (usable.length === 0) {
    throw new Error("the live CDN carries no camera the e2e can approach");
  }
  // The first by id — deterministic across runs with the same snapshot.
  const cam = usable.sort((a, b) => a.id.localeCompare(b.id))[0];
  return {
    id: cam.id,
    point: cam.point,
    angle: cam.angle,
    bidirectional: cam.bidirectional,
    speedLimit: cam.speedCar,
  };
}

export async function pickOneSidedCamera(): Promise<StationaryFixture | null> {
  // A camera with a facing angle and no opposite lane — the only kind whose
  // angle check alone keeps a sideways crossing silent.
  const usable = (await fetchStationary()).filter(
    (c) => c.point && !c.bidirectional && c.angle !== -1,
  );
  const cam = usable.sort((a, b) => a.id.localeCompare(b.id))[0];
  return cam
    ? { id: cam.id, point: cam.point, angle: cam.angle, bidirectional: false, speedLimit: cam.speedCar }
    : null;
}

export async function pickSection(): Promise<SectionFixture | null> {
  const usable = (await fetchSections()).filter(
    (s) => s.points.length > 0 && s.speedCar >= 40 && s.speedCar <= 75,
  );
  const section = usable.sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!section) {
    return null;
  }
  return {
    id: section.id,
    end: section.points[section.points.length - 1],
    endAngle: section.angleEnd,
    speedLimit: section.speedCar,
  };
}
