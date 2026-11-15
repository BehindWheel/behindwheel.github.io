// The GeoJSON sources and layers — the dashboard overlays.js rule: one source
// per logical group, a redraw replaces the group's data and never stacks
// sources or layers. Point features do not live in sources at all — they are
// DOM sign markers (see markers.ts).

import type { Feature, FeatureCollection, LineString } from "geojson";
import * as maplibregl from "maplibre-gl";
import { getTheme } from "../theme";
import type { CdnData, CdnPoint, MediumSpeedCamera, RoadRepair } from "../cdn";
import type { SelectFeature } from "./markers";
import {
  MEDIUM_SPEED_LINE_COLOR,
  REPAIRS_CASE_COLOR,
  REPAIRS_CASE_DARK_COLOR,
  REPAIRS_CASE_WIDTH,
  REPAIRS_DASHARRAY,
  REPAIRS_LINE_COLOR,
  REPAIRS_LINE_DARK_COLOR,
  REPAIRS_WIDTH,
} from "./style";

export const LAYER_IDS = {
  mediumSpeed: "medium-speed-line",
  repairsCase: "repairs-line-case",
  repairsLines: "repairs-line",
  // Invisible fat targets over the visible lines — clicks land on these, the
  // dashboard overlays.js rule.
  mediumSpeedHit: "medium-speed-line-hit",
  repairsLinesHit: "repairs-line-hit",
} as const;

const SOURCE_IDS = ["medium-speed", "repairs"] as const;

// The visible stroke; three times its width at least 16 px is the finger
// target — the hitbox carries the clicks, not the stroke.
const LINE_WIDTH = 4;
const HIT_LINE_WIDTH = 16;

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
    features: items.flatMap((repair) =>
      repair.type === "line"
        ? [
            {
              type: "Feature",
              id: repair.id,
              geometry: toLineGeometry(repair.points ?? []),
              properties: { id: repair.id },
            } satisfies Feature<LineString>,
          ]
        : [],
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
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": MEDIUM_SPEED_LINE_COLOR,
        "line-width": LINE_WIDTH,
        "line-opacity": 1,
      },
    });
    map.addLayer({
      id: LAYER_IDS.mediumSpeedHit,
      type: "line",
      source: "medium-speed",
      paint: {
        "line-color": "#000",
        "line-width": HIT_LINE_WIDTH,
        "line-opacity": 0,
      },
    });
  }

  if (!map.getLayer(LAYER_IDS.repairsLines)) {
    // The roadwork read: a solid casing first, then the dashed stroke on
    // top. The dasharray is in line-width units, and both layers' widths
    // are fixed constants — the pattern stays constant screen-size at every
    // zoom, no interpolation needed.
    map.addLayer({
      id: LAYER_IDS.repairsCase,
      type: "line",
      source: "repairs",
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color":
          getTheme() === "dark" ? REPAIRS_CASE_DARK_COLOR : REPAIRS_CASE_COLOR,
        "line-width": REPAIRS_CASE_WIDTH,
        "line-opacity": 1,
      },
    });
    map.addLayer({
      id: LAYER_IDS.repairsLines,
      type: "line",
      source: "repairs",
      layout: {
        // Butt caps: a round cap bloats every dash into a pill — the casing
        // below carries the rounded ends for the whole line.
        "line-cap": "butt",
        "line-join": "round",
      },
      paint: {
        // On the dark basemap the repairs red reads its lighter step; the
        // layers are re-added on every style.load, so the choice is picked
        // fresh each time the basemap swaps.
        "line-color":
          getTheme() === "dark" ? REPAIRS_LINE_DARK_COLOR : REPAIRS_LINE_COLOR,
        "line-width": REPAIRS_WIDTH,
        "line-dasharray": REPAIRS_DASHARRAY,
        "line-opacity": 1,
      },
    });
    map.addLayer({
      id: LAYER_IDS.repairsLinesHit,
      type: "line",
      source: "repairs",
      paint: {
        "line-color": "#000",
        "line-width": HIT_LINE_WIDTH,
        "line-opacity": 0,
      },
    });
  }
}

// map.on() registers a listener and never dedupes, and bindLayerSelection is
// re-run on every data load — so the handlers bind once per map. They read
// the feature id from the click event, nothing is captured. Click and cursor
// both sit on the invisible hitbox layers — the visible stroke is 4 px, too
// thin for a finger.
const layerSelectionBound = new WeakSet<maplibregl.Map>();

export function bindLayerSelection(
  map: maplibregl.Map,
  onSelect: SelectFeature,
): void {
  if (layerSelectionBound.has(map)) {
    return;
  }
  layerSelectionBound.add(map);
  map.on("click", LAYER_IDS.mediumSpeedHit, (event) => {
    const id = event.features?.[0]?.properties?.id as string | undefined;
    if (id !== undefined) {
      onSelect("mediumSpeed", id);
    }
  });
  map.on("click", LAYER_IDS.repairsLinesHit, (event) => {
    const id = event.features?.[0]?.properties?.id as string | undefined;
    if (id !== undefined) {
      onSelect("repairs", id);
    }
  });

  // The sign markers are DOM and take their pointer cursor from CSS; the
  // lines live on the canvas, so the hover cursor goes through layer events
  // — same click targets as above.
  const canvas = map.getCanvas();
  for (const layerId of [LAYER_IDS.mediumSpeedHit, LAYER_IDS.repairsLinesHit]) {
    map.on("mouseenter", layerId, () => {
      canvas.style.cursor = "pointer";
    });
    map.on("mouseleave", layerId, () => {
      canvas.style.cursor = "";
    });
  }
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
