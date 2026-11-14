// The GeoJSON sources and layers — the dashboard overlays.js rule: one source
// per logical group, a redraw replaces the group's data and never stacks
// sources or layers. Point features do not live in sources at all — they are
// DOM sign markers (see markers.ts).

import type { Feature, FeatureCollection, LineString } from "geojson";
import maplibregl from "maplibre-gl";
import type { CdnData, CdnPoint, MediumSpeedCamera, RoadRepair } from "../cdn";
import { mediumSpeedPopup, repairPopup, showPopup } from "./markers";
import { ACCENT_COLOR, REPAIRS_LINE_COLOR } from "./style";

export const LAYER_IDS = {
  mediumSpeed: "medium-speed-line",
  repairsLines: "repairs-line",
} as const;

const SOURCE_IDS = ["medium-speed", "repairs"] as const;

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
        "line-color": ACCENT_COLOR,
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
        "line-color": REPAIRS_LINE_COLOR,
        "line-width": 4,
        "line-opacity": 0.9,
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

export function setLayerVisibility(
  map: maplibregl.Map,
  layerId: string,
  visible: boolean,
): void {
  if (map.getLayer(layerId)) {
    map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
  }
}
