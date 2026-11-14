import maplibregl from "maplibre-gl";
import { BELARUS_BOUNDS, LIBERTY_STYLE } from "./style";

// The single MapLibre bootstrap — the same role as the dashboard's
// ui/map/createMap.js: vector style, bounds, the bottom-right controls. The
// attribution control is off (the user's call, 2026-11-14, like the
// dashboard's).
export function createMap(container: HTMLElement): maplibregl.Map {
  const map = new maplibregl.Map({
    container,
    style: LIBERTY_STYLE,
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
  return map;
}

// setStyle() wipes every source and layer, so overlays must be replayed on
// top of the new basemap; DOM markers survive the swap on their own.
export function onStyleLoad(map: maplibregl.Map, replay: () => void): void {
  map.on("style.load", replay);
}
