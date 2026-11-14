export const CDN_BASE = "https://cdn-data.behindwheel.workers.dev";

export type CdnPoint = {
  lat: number;
  lng: number;
};

export type CdnManifestEntry = {
  version: number;
  url: string;
  sha256: string;
  size: number;
  count: number;
};

export type CdnManifest = {
  schema: number;
  generatedAt: string;
  features: Record<string, CdnManifestEntry>;
};

export type StationaryCamera = {
  id: string;
  name: string;
  point: CdnPoint;
  angle: number;
  bidirectional: boolean;
  updateTime: string;
  speedCar: number;
  speedTruck: number;
  region: string;
};

export type MediumSpeedCamera = {
  id: string;
  name: string;
  bidirectional: boolean;
  angleStart: number;
  angleEnd: number;
  speedCar: number;
  speedTruck: number;
  region: string;
  points: CdnPoint[];
  updateTime: string;
};

export type RoadRepair = {
  id: string;
  type: "point" | "line";
  road: string;
  dateBegin: string;
  dateEnd: string;
  speed: number;
  note: string;
  region: string;
  verified: boolean;
  updateTime: string;
  point?: CdnPoint;
  points?: CdnPoint[];
};

export type CdnData = {
  generatedAt: string;
  stationary: StationaryCamera[];
  mediumSpeed: MediumSpeedCamera[];
  repairs: RoadRepair[];
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url}: HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

// The CDN sets max-age=0 + must-revalidate + ETag on every file, so plain
// fetch() already revalidates: the browser sends If-None-Match and a 304
// costs nothing. No manual ETag cache is needed on top of that.
export async function loadCdnData(): Promise<CdnData> {
  const manifest = await fetchJson<CdnManifest>(`${CDN_BASE}/manifest.json`);
  const featureUrl = (name: string) => {
    const entry = manifest.features[name];
    if (!entry) {
      throw new Error(`manifest.json: feature "${name}" is missing`);
    }
    return `${CDN_BASE}${entry.url}`;
  };
  const [stationary, mediumSpeed, repairs] = await Promise.all([
    fetchJson<{ items: StationaryCamera[] }>(featureUrl("stationary")),
    fetchJson<{ items: MediumSpeedCamera[] }>(featureUrl("medium-speed")),
    fetchJson<{ items: RoadRepair[] }>(featureUrl("repairs")),
  ]);
  return {
    generatedAt: manifest.generatedAt,
    stationary: stationary.items,
    mediumSpeed: mediumSpeed.items,
    repairs: repairs.items,
  };
}
