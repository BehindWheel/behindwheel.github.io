export const BELARUS_BOUNDS: [[number, number], [number, number]] = [
  [23.0, 51.2],
  [32.9, 56.2],
];

// The basemap follows the color scheme like every themed surface: Liberty in
// light, OpenFreeMap's Dark in dark.
export const LIGHT_MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
export const DARK_MAP_STYLE = "https://tiles.openfreemap.org/styles/dark";

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
