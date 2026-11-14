import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import type {
  ExpressionSpecification,
  StyleSpecification,
} from "maplibre-gl";
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
  repairsPoints: "repairs-point",
} as const;

// One GeoJSON source per logical layer; a redraw replaces `data` and never
// stacks sources or layers (same rule as the private dashboard overlays).
const SOURCE_IDS = ["medium-speed", "repairs"] as const;

export type StationaryMarkerRegistry = {
  markers: maplibregl.Marker[];
  cameraById: Map<string, StationaryCamera>;
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

function repairsCollection(items: RoadRepair[]): FeatureCollection<Point | LineString> {
  return {
    type: "FeatureCollection",
    features: items.map(
      (repair): Feature<Point | LineString> => {
        const geometry: Point | LineString =
          repair.type === "line"
            ? toLineGeometry(repair.points ?? [])
            : {
                type: "Point",
                coordinates: [repair.point?.lng ?? 0, repair.point?.lat ?? 0],
              };
        return {
          type: "Feature",
          id: repair.id,
          geometry,
          properties: { id: repair.id, type: repair.type },
        };
      },
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
      `<div>${camera.bidirectional ? "Оба направления" : "Одно направление"}</div>` +
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

function createStationaryMarker(camera: StationaryCamera): maplibregl.Marker {
  const element = document.createElement("div");
  element.className = "camera-marker";
  element.dataset.id = camera.id;
  element.title = camera.name;
  const arrow = document.createElement("span");
  arrow.className = "camera-marker-arrow";
  // Only the arrow rotates — Marker.rotation would spin the speed badge too.
  // CSS keeps the badge upright; the arrow loses map-pitch alignment, which a
  // north-locked public map never shows anyway.
  arrow.style.transform = `rotate(${camera.angle}deg)`;
  element.appendChild(arrow);
  const speed = document.createElement("span");
  speed.className = "camera-marker-speed";
  speed.textContent = `${camera.speedCar}`;
  element.appendChild(speed);
  return new maplibregl.Marker({ element }).setLngLat([
    camera.point.lng,
    camera.point.lat,
  ]);
}

export function createStationaryMarkers(
  cameras: StationaryCamera[],
): StationaryMarkerRegistry {
  const registry: StationaryMarkerRegistry = {
    markers: [],
    cameraById: new Map(),
  };
  for (const camera of cameras) {
    registry.cameraById.set(camera.id, camera);
    registry.markers.push(createStationaryMarker(camera));
  }
  return registry;
}

export function addStationaryMarkers(
  map: maplibregl.Map,
  registry: StationaryMarkerRegistry,
): void {
  for (const marker of registry.markers) {
    marker.addTo(map);
  }
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
    repairsCollection(data.repairs),
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
      filter: ["==", ["get", "type"], "line"] as unknown as ExpressionSpecification,
      paint: {
        "line-color": "#ef4444",
        "line-width": 3,
        "line-opacity": 0.9,
        "line-dasharray": [2, 2],
      },
    });
  }

  if (!map.getLayer(LAYER_IDS.repairsPoints)) {
    map.addLayer({
      id: LAYER_IDS.repairsPoints,
      type: "circle",
      source: "repairs",
      filter: ["==", ["get", "type"], "point"] as unknown as ExpressionSpecification,
      paint: {
        "circle-color": "#ef4444",
        "circle-radius": 5,
        "circle-opacity": 0.85,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
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
  for (const layerId of [LAYER_IDS.repairsLines, LAYER_IDS.repairsPoints]) {
    map.on("click", layerId, (event) => {
      const id = event.features?.[0]?.properties?.id as string | undefined;
      const repair = data.repairs.find((item) => item.id === id);
      if (repair) {
        showPopup(map, event.lngLat, repairPopup(repair));
      }
    });
  }
}

export function bindMarkerPopups(
  map: maplibregl.Map,
  registry: StationaryMarkerRegistry,
): void {
  for (const marker of registry.markers) {
    const element = marker.getElement();
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      const camera = registry.cameraById.get(element.dataset.id ?? "");
      if (camera) {
        showPopup(map, marker.getLngLat(), stationaryPopup(camera));
      }
    });
  }
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
