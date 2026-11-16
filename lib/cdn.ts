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
  verified: boolean;
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
  verified: boolean;
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

// The slugs the CDN actually carries, in the map's north-to-south reading
// order — the region filter's option list and the search's region facets
// both walk this.
export const REGIONS: { slug: string; name: string }[] = [
  { slug: "brest", name: "Брестская" },
  { slug: "vitebsk", name: "Витебская" },
  { slug: "grodno", name: "Гродненская" },
  { slug: "gomel", name: "Гомельская" },
  { slug: "minsk", name: "Минская" },
  { slug: "mogilev", name: "Могилёвская" },
];

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

// The body schema this client reads, per feature. A file that carries a newer
// schema is skipped — the compatibility gate of the CDN contract (cdn.md): the
// client keeps the layers it can read instead of crashing on a shape it cannot.
const SUPPORTED_SCHEMA: Record<string, number> = {
  stationary: 1,
  "medium-speed": 1,
  repairs: 1,
};

// The CDN sets max-age=0 + must-revalidate + ETag on every file, so plain
// fetch() already revalidates: the browser sends If-None-Match and a 304
// costs nothing. No manual ETag cache is needed on top of that.
export async function loadCdnData(): Promise<CdnData> {
  const manifest = await fetchJson<CdnManifest>(`${CDN_BASE}/manifest.json`);
  const featureItems = async <T>(name: string): Promise<T[]> => {
    const entry = manifest.features[name];
    if (!entry) {
      throw new Error(`manifest.json: feature "${name}" is missing`);
    }
    const payload = await fetchJson<{ schema?: number; items: T[] }>(`${CDN_BASE}${entry.url}`);
    const supported = SUPPORTED_SCHEMA[name];
    if (supported !== undefined && payload.schema !== undefined && payload.schema > supported) {
      // The feature's body grew a shape this client cannot read: the layer stays
      // off and the rest of the map keeps working.
      console.warn(
        `cdn: feature "${name}" carries schema ${payload.schema}, this client reads ${supported} — the feature is skipped`,
      );
      return [];
    }
    return payload.items;
  };
  const [stationary, mediumSpeed, repairs] = await Promise.all([
    featureItems<StationaryCamera>("stationary"),
    featureItems<MediumSpeedCamera>("medium-speed"),
    featureItems<RoadRepair>("repairs"),
  ]);
  return {
    generatedAt: manifest.generatedAt,
    stationary,
    mediumSpeed,
    repairs,
  };
}
