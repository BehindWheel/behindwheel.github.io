import type { Feature, FeatureCollection, LineString } from "geojson";
import type { StyleSpecification } from "maplibre-gl";
import maplibregl from "maplibre-gl";
import type {
  CdnData,
  CdnPoint,
  MediumSpeedCamera,
  RoadRepair,
  StationaryCamera,
} from "./cdn";

export const BELARUS_BOUNDS: [[number, number], [number, number]] = [
  [23.0, 51.2],
  [32.9, 56.2],
];

export const LIBERTY_STYLE = "https://tiles.openfreemap.org/styles/liberty";

// Esri World Imagery is a free raster basemap (max zoom 19) — the same
// satellite toggle the private dashboard uses.
export const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    "esri-satellite": {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Esri World Imagery",
    },
  },
  layers: [
    {
      id: "esri-satellite",
      type: "raster",
      source: "esri-satellite",
    },
  ],
};

export const LAYER_IDS = {
  mediumSpeed: "medium-speed-line",
  repairsLines: "repairs-line",
} as const;

// One GeoJSON source per logical layer; a redraw replaces `data` and never
// stacks sources or layers (same rule as the private dashboard overlays).
// Point features do not live in sources at all — they are DOM sign markers
// (the dashboard marker convention: road-repairs-point.svg for a point work).
const SOURCE_IDS = ["medium-speed", "repairs"] as const;

const ICONS = {
  camera: "/icons/camera.svg",
  mediumSpeed: "/icons/medium-speed.svg",
  repairsPoint: "/icons/road-repairs-point.svg",
  repairsLine: "/icons/road-repairs.svg",
} as const;

export type MarkerGroup<T extends { id: string }> = {
  markers: maplibregl.Marker[];
  itemById: Map<string, T>;
};

export type MarkerGroups = {
  stationary: MarkerGroup<StationaryCamera>;
  mediumSpeed: MarkerGroup<MediumSpeedCamera>;
  repairs: MarkerGroup<RoadRepair>;
};

const toLineGeometry = (points: CdnPoint[]): LineString => ({
  type: "LineString",
  coordinates: points.map((p) => [p.lng, p.lat]),
});

function mediumSpeedCollection(items: MediumSpeedCamera[]): FeatureCollection<LineString> {
  return {
    type: "FeatureCollection",
    features: items.map(
      (camera): Feature<LineString> => ({
        type: "Feature",
        id: camera.id,
        geometry: toLineGeometry(camera.points),
        properties: { id: camera.id },
      }),
    ),
  };
}

function repairsLineCollection(items: RoadRepair[]): FeatureCollection<LineString> {
  return {
    type: "FeatureCollection",
    features: items
      .filter((repair) => repair.type === "line")
      .map(
        (repair): Feature<LineString> => ({
          type: "Feature",
          id: repair.id,
          geometry: toLineGeometry(repair.points ?? []),
          properties: { id: repair.id },
        }),
      ),
  };
}

function speedLabel(car: number, truck: number): string {
  return truck > 0 ? `${car} / ${truck} км/ч` : `${car} км/ч`;
}

function popupHtml(body: string): string {
  return `<div class="site-popup">${body}</div>`;
}

export function stationaryPopup(camera: StationaryCamera): string {
  return popupHtml(
    `<strong>${camera.name}</strong>` +
      `<div>${speedLabel(camera.speedCar, camera.speedTruck)}</div>` +
      `<div>${camera.bidirectional ? "Оба направления" : "Одно направление"}</div>` +
      `<div class="site-popup-muted">Обновлено ${camera.updateTime}</div>`,
  );
}

export function mediumSpeedPopup(camera: MediumSpeedCamera): string {
  return popupHtml(
    `<strong>${camera.name}</strong>` +
      `<div>${speedLabel(camera.speedCar, camera.speedTruck)}</div>` +
      `<div>${camera.bidirectional ? "Оба направления" : "Одно направление"}, ${camera.points.length} точек</div>` +
      `<div class="site-popup-muted">Обновлено ${camera.updateTime}</div>`,
  );
}

export function repairPopup(repair: RoadRepair): string {
  return popupHtml(
    `<strong>${repair.road}</strong>` +
      (repair.note ? `<div>${repair.note}</div>` : "") +
      `<div>${repair.dateBegin} — ${repair.dateEnd}</div>` +
      (repair.speed > 0 ? `<div>Ограничение ${repair.speed} км/ч</div>` : "") +
      `<div class="site-popup-muted">${repair.verified ? "Проверено" : "Не проверено"}</div>`,
  );
}

function showPopup(map: maplibregl.Map, lngLat: maplibregl.LngLat, html: string): void {
  new maplibregl.Popup({ maxWidth: "280px" })
    .setLngLat(lngLat)
    .setHTML(html)
    .addTo(map);
}

type SignMarkerOptions = {
  icon: string;
  // A thin direction ray above the sign, rotated clockwise from north by the
  // camera angle — the read-only echo of the dashboard's rays. CSS rotation
  // never follows map bearing; the public map is north-locked, so it shows.
  rayAngle?: number;
  label?: string;
  verified?: boolean;
};

// The dashboard marker convention (ui/map/markers.js): a sign is an <img>
// inside .marker-body, sized 18x20, the marker root keeps the maplibregl
// absolute positioning and anchors bottom, so the sign's tip sits on the point.
function createSignMarker({ icon, rayAngle, label, verified }: SignMarkerOptions): maplibregl.Marker {
  const element = document.createElement("div");
  element.className = "sign-marker";
  if (rayAngle !== undefined) {
    const ray = document.createElement("span");
    ray.className = "marker-ray";
    ray.style.transform = `rotate(${rayAngle}deg)`;
    element.appendChild(ray);
  }
  const body = document.createElement("span");
  body.className = "marker-body";
  const img = document.createElement("img");
  img.src = icon;
  img.alt = "";
  body.appendChild(img);
  if (verified) {
    const badge = document.createElement("span");
    badge.className = "marker-verified-badge";
    body.appendChild(badge);
  }
  element.appendChild(body);
  if (label) {
    const speed = document.createElement("span");
    speed.className = "marker-speed-badge";
    speed.textContent = label;
    element.appendChild(speed);
  }
  return new maplibregl.Marker({ element, anchor: "bottom" });
}

function bindGroupClicks<T extends { id: string }>(
  map: maplibregl.Map,
  group: MarkerGroup<T>,
  popup: (item: T) => string,
): void {
  for (const marker of group.markers) {
    const element = marker.getElement();
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      const item = group.itemById.get(element.dataset.id ?? "");
      if (item) {
        showPopup(map, marker.getLngLat(), popup(item));
      }
    });
  }
}

function buildGroup<T extends { id: string }>(
  items: T[],
  markerAt: (item: T) => maplibregl.Marker,
): MarkerGroup<T> {
  const group: MarkerGroup<T> = { markers: [], itemById: new Map() };
  for (const item of items) {
    group.itemById.set(item.id, item);
    const marker = markerAt(item);
    marker.getElement().dataset.id = item.id;
    group.markers.push(marker);
  }
  return group;
}

export function createMarkerGroups(data: CdnData): MarkerGroups {
  return {
    stationary: buildGroup(
      data.stationary.filter((camera) => camera.point),
      (camera) =>
        createSignMarker({
          icon: ICONS.camera,
          rayAngle: camera.angle,
          label: `${camera.speedCar}`,
        }).setLngLat([camera.point.lng, camera.point.lat]),
    ),
    mediumSpeed: buildGroup(
      data.mediumSpeed.filter((camera) => camera.points.length > 0),
      (camera) =>
        createSignMarker({ icon: ICONS.mediumSpeed }).setLngLat([
          camera.points[0].lng,
          camera.points[0].lat,
        ]),
    ),
    repairs: buildGroup(
      data.repairs.filter((repair) => repair.point ?? repair.points?.length),
      (repair) => {
        // A point work sits at its point; a stretch wears its sign at the
        // first vertex of the polyline (the dashboard marker convention:
        // road-repairs-point.svg vs road-repairs.svg).
        const at = repair.point ?? repair.points![0];
        return createSignMarker({
          icon: repair.type === "point" ? ICONS.repairsPoint : ICONS.repairsLine,
          verified: repair.verified,
        }).setLngLat([at.lng, at.lat]);
      },
    ),
  };
}

export function addMarkerGroups(map: maplibregl.Map, groups: MarkerGroups): void {
  for (const group of [groups.stationary, groups.mediumSpeed, groups.repairs]) {
    for (const marker of group.markers) {
      marker.addTo(map);
    }
  }
}

export function bindMarkerPopups(map: maplibregl.Map, groups: MarkerGroups): void {
  bindGroupClicks(map, groups.stationary, stationaryPopup);
  bindGroupClicks(map, groups.mediumSpeed, mediumSpeedPopup);
  bindGroupClicks(map, groups.repairs, repairPopup);
}

export function applyOverlays(map: maplibregl.Map, data: CdnData): void {
  for (const sourceId of SOURCE_IDS) {
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
    }
  }

  (map.getSource("medium-speed") as maplibregl.GeoJSONSource).setData(
    mediumSpeedCollection(data.mediumSpeed),
  );
  (map.getSource("repairs") as maplibregl.GeoJSONSource).setData(
    repairsLineCollection(data.repairs),
  );

  if (!map.getLayer(LAYER_IDS.mediumSpeed)) {
    map.addLayer({
      id: LAYER_IDS.mediumSpeed,
      type: "line",
      source: "medium-speed",
      paint: {
        "line-color": "#2563eb",
        "line-width": 4,
        "line-opacity": 0.85,
      },
    });
  }

  if (!map.getLayer(LAYER_IDS.repairsLines)) {
    map.addLayer({
      id: LAYER_IDS.repairsLines,
      type: "line",
      source: "repairs",
      paint: {
        "line-color": "#ef4444",
        "line-width": 3,
        "line-opacity": 0.9,
        "line-dasharray": [2, 2],
      },
    });
  }
}

export function bindLayerPopups(map: maplibregl.Map, data: CdnData): void {
  map.on("click", LAYER_IDS.mediumSpeed, (event) => {
    const id = event.features?.[0]?.properties?.id as string | undefined;
    const camera = data.mediumSpeed.find((item) => item.id === id);
    if (camera) {
      showPopup(map, event.lngLat, mediumSpeedPopup(camera));
    }
  });
  map.on("click", LAYER_IDS.repairsLines, (event) => {
    const id = event.features?.[0]?.properties?.id as string | undefined;
    const repair = data.repairs.find((item) => item.id === id);
    if (repair) {
      showPopup(map, event.lngLat, repairPopup(repair));
    }
  });
}

// After setStyle() the map drops every source and layer, so overlays must be
// replayed on top of the new basemap. DOM markers survive the swap.
export function onStyleLoad(map: maplibregl.Map, replay: () => void): void {
  map.on("style.load", replay);
}

export function setLayerVisibility(
  map: maplibregl.Map,
  layerId: string,
  visible: boolean,
): void {
  if (map.getLayer(layerId)) {
    map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
  }
}

export function setMarkersVisibility(
  markers: maplibregl.Marker[],
  visible: boolean,
): void {
  for (const marker of markers) {
    marker.getElement().style.display = visible ? "" : "none";
  }
}
