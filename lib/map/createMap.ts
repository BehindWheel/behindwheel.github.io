import * as maplibregl from "maplibre-gl";
import { getTheme, onThemeChange, type Theme } from "../theme";
import { BELARUS_BOUNDS, DARK_MAP_STYLE, LIGHT_MAP_STYLE } from "./style";

// The basemap follows the theme store (an explicit choice or the device
// scheme): Liberty in light, Dark in dark. setStyle() wipes sources and
// layers wholesale — the style.load replay redraws the overlays on top of
// whichever style wins, and the DOM sign markers survive the swap on their
// own.
const styleFor = (theme: Theme): string =>
  theme === "dark" ? DARK_MAP_STYLE : LIGHT_MAP_STYLE;

// v6 ships ESM-only and spawns its worker from a URL. Turbopack resolves that
// URL to a virtual /_next/static/media/maplibre-gl-worker.mjs?v=… that never
// exists on disk (the real file is content-hashed), so the worker 404s and
// the map hangs silently before its first render — no tiles, no markers, no
// error events. The prebuild script copies the worker into public/ and we
// point maplibre at it explicitly; the copy happens per build, so worker and
// main module can never drift apart.
maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

// The single MapLibre bootstrap — the same role as the dashboard's
// ui/map/createMap.js: vector style, bounds, the bottom-right controls. The
// attribution control is off (the user's call, 2026-11-14, like the
// dashboard's).
export function createMap(container: HTMLElement): maplibregl.Map {
  let appliedStyle = styleFor(getTheme());
  const map = new maplibregl.Map({
    container,
    style: appliedStyle,
    bounds: BELARUS_BOUNDS,
    attributionControl: false,
  });
  // showCompass: false — the dashboard's navigation control carries zoom only;
  // the north arrow reads as noise on a map that nobody rotates.
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
  map.addControl(
    new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true } }),
    "bottom-right",
  );
  onThemeChange(() => {
    const next = styleFor(getTheme());
    if (next !== appliedStyle) {
      appliedStyle = next;
      map.setStyle(next);
    }
  });
  return map;
}

// setStyle() wipes every source and layer, so overlays must be replayed on
// top of the new basemap; DOM markers survive the swap on their own.
export function onStyleLoad(map: maplibregl.Map, replay: () => void): void {
  map.on("style.load", replay);
}
