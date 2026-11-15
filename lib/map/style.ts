export const BELARUS_BOUNDS: [[number, number], [number, number]] = [
  [23.0, 51.2],
  [32.9, 56.2],
];

// The basemap follows the color scheme like every themed surface: Liberty in
// light, a self-hosted copy of OpenFreeMap's Dark in dark. The stock dark
// style is pitch-black (rgb(12,12,12) background) and read too heavy; the
// copy lifts every color's lightness ~1.5x — same OpenMapTiles source, same
// glyphs and sprite, only the palette softened.
// Fiord (#45516E) and Positron (light gray) were the softer candidates, the
// black one won the call — this softened fork keeps the call but dials the
// black down.
export const LIGHT_MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
export const DARK_MAP_STYLE = "/styles/dark-soft.json";

// The dashboard colors, one step darker than their sign markers so the lines
// separate from Liberty's roads: medium-speed sections take the amber of
// icons/medium-speed.svg (#ffb366) — over the style's own amber road fill it
// is ~1.4:1 and the line only read through its width; repair stretches take
// the red of icons/road-repairs*.svg (#b3261e) instead of the old brown.
export const MEDIUM_SPEED_LINE_COLOR = "#d97b1f";
export const REPAIRS_LINE_COLOR = "#8c1a15";

// On the Dark basemap that repairs red sinks into the near-black land fill —
// the dark scheme reads a lighter step of the same red; the amber holds.
export const REPAIRS_LINE_DARK_COLOR = "#e8604f";

// The repairs line wears the roadwork look: a thin dashed stroke, just the
// red — no casing, per the user's call. The dash layer cuts butt caps (a
// round cap would bloat every dash into a pill), so the dasharray is the
// literal geometry: long dashes, a shorter gap. The width is a fixed
// constant, so the pattern is constant screen-size at every zoom.
export const REPAIRS_WIDTH = 2.5;
export const REPAIRS_DASHARRAY: [number, number] = [3, 2];
