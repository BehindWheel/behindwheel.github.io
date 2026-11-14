import type { StyleSpecification } from "maplibre-gl";

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

// The dashboard colors: medium-speed section lines take the amber of their
// sign marker (icons/medium-speed.svg fill #ffb366), curated repair stretches
// keep the brown repairs-line.
export const MEDIUM_SPEED_LINE_COLOR = "#ffb366";
export const REPAIRS_LINE_COLOR = "#7b4a21";
