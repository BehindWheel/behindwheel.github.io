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

// The CDN regions are latin slugs; the UI reads them as the Belarusian
// oblast names in the nominative — the panel row is labeled «Область».
// A slug outside the map passes through unchanged.
const REGION_NAMES: Record<string, string> = {
  brest: "Брестская",
  gomel: "Гомельская",
  grodno: "Гродненская",
  minsk: "Минская",
  mogilev: "Могилёвская",
  vitebsk: "Витебская",
};

export function regionName(slug: string): string {
  return REGION_NAMES[slug] ?? slug;
}

export type CdnData = {
  generatedAt: string;
  stationary: StationaryCamera[];
  mediumSpeed: MediumSpeedCamera[];
  repairs: RoadRepair[];
};

// A CDN that never answers would otherwise leave the map on its loading
// face forever — no error, no retry. 15s is generous for three ~25KB files;
// past that the error state with its retry button beats a silent spinner.
const FETCH_TIMEOUT_MS = 15_000;

// AbortSignal.timeout rejects with a DOMException whose English message
// would sit next to Russian UI text on the error face — reword it.
function toFetchError(url: string, error: unknown): Error {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return new Error(`${url}: таймаут ${FETCH_TIMEOUT_MS / 1000} с`);
  }
  return error instanceof Error ? error : new Error(String(error));
}

async function fetchJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (error) {
    throw toFetchError(url, error);
  }
  if (!res.ok) {
    throw new Error(`${url}: HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

// The manifest carries each feature file's sha256; verifying it catches a
// truncated or corrupted upload before it renders as half a map. Needs a
// secure context — behindwheel.github.io is https, and where crypto.subtle
// is missing (plain-http previews) verification is skipped, not failed.
async function fetchVerifiedJson<T>(url: string, expectedSha256: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (error) {
    throw toFetchError(url, error);
  }
  if (!res.ok) {
    throw new Error(`${url}: HTTP ${res.status}`);
  }
  const bytes = await res.arrayBuffer();
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const actual = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    if (actual !== expectedSha256) {
      throw new Error(`${url}: контрольная сумма не совпала`);
    }
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
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
    return { url: `${CDN_BASE}${entry.url}`, sha256: entry.sha256 };
  };
  const stationary = featureUrl("stationary");
  const mediumSpeed = featureUrl("medium-speed");
  const repairs = featureUrl("repairs");
  const [stationaryData, mediumSpeedData, repairsData] = await Promise.all([
    fetchVerifiedJson<{ items: StationaryCamera[] }>(stationary.url, stationary.sha256),
    fetchVerifiedJson<{ items: MediumSpeedCamera[] }>(mediumSpeed.url, mediumSpeed.sha256),
    fetchVerifiedJson<{ items: RoadRepair[] }>(repairs.url, repairs.sha256),
  ]);
  return {
    generatedAt: manifest.generatedAt,
    stationary: stationaryData.items,
    mediumSpeed: mediumSpeedData.items,
    repairs: repairsData.items,
  };
}
