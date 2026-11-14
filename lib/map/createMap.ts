import maplibregl from "maplibre-gl";
import { BELARUS_BOUNDS, LIBERTY_STYLE } from "./style";

// The single MapLibre bootstrap — the same role as the dashboard's
// ui/map/createMap.js: vector style, bounds, the bottom-left controls.
export function createMap(container: HTMLElement): maplibregl.Map {
  const map = new maplibregl.Map({
    container,
    style: LIBERTY_STYLE,
    bounds: BELARUS_BOUNDS,
  });
  map.addControl(new maplibregl.NavigationControl(), "bottom-left");
  map.addControl(
    new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true } }),
    "bottom-left",
  );
  return map;
}

// setStyle() wipes every source and layer, so overlays must be replayed on
// top of the new basemap; DOM markers survive the swap on their own.
export function onStyleLoad(map: maplibregl.Map, replay: () => void): void {
  map.on("style.load", replay);
}
