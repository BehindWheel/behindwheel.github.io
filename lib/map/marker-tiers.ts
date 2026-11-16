// The zoom-tier density control for the sign markers (issue #34): the map
// reads like the mobile app — colored dots below SIGN_MIN, the small sign
// face from SIGN_MIN, growing to the large face at SIGN_LARGE. No object
// ever disappears from the map, and the overlay lines show at every zoom.
//
// The experiment's earlier stages — supercluster bubbles, then region
// badges — both lost to "see everything": at 266 points the bubbles hid
// markers that fit fine, and once every marker wore its colored dot face,
// the badges only repeated what the map already showed. The counts moved to
// the filter panel instead.
//
// Filters are respected everywhere: dots and signs follow the toggles, and
// so do the line layers.

import * as maplibregl from "maplibre-gl";
import { MARKER_KINDS, type MarkerGroups, type SelectionKind } from "./markers";
import { LAYER_IDS, setLayerVisibility } from "./overlays";

// Tier edges in GL zoom units, mirroring the mobile app's
// Circle → Small → Large progression: below SIGN_MIN every marker wears its
// colored dot face, the small sign face starts at SIGN_MIN and grows to the
// large one at SIGN_LARGE.
const SIGN_MIN_ZOOM = 8.5;
const SIGN_LARGE_ZOOM = 11;

export type LayerToggles = Record<SelectionKind, boolean>;

// One sign marker: the flat registry the tiers index into. A line object
// contributes two markers (its ends), a point object one — the marker groups
// already carry that split, so the registry just walks the groups.
type SignEntry = {
  kind: SelectionKind;
  id: string;
  region: string;
  element: HTMLElement;
  lngLat: [number, number];
  visible: boolean;
};

// The overlay lines show at every zoom; this registry is just which layers
// follow which toggle. The stationary cameras and the traffic sensors are
// points — they carry no line, so they have no entry here.
const LINE_LAYERS: Record<
  Exclude<SelectionKind, "stationary" | "traffic">,
  string[]
> = {
  mediumSpeed: [LAYER_IDS.mediumSpeed, LAYER_IDS.mediumSpeedHit],
  repairs: [LAYER_IDS.repairsLines, LAYER_IDS.repairsLinesHit],
};

function collectSigns(groups: MarkerGroups): SignEntry[] {
  const signs: SignEntry[] = [];
  for (const kind of MARKER_KINDS) {
    for (const marker of groups[kind].markers) {
      const element = marker.getElement();
      // The region rides the object, looked up by the id the builder
      // stamped on the element — the registry keeps it for the filter.
      const region = groups[kind].itemById.get(element.dataset.id ?? "")?.region ?? "";
      signs.push({
        kind,
        id: element.dataset.id ?? "",
        region,
        element,
        lngLat: marker.getLngLat().toArray() as [number, number],
        visible: true,
      });
    }
  }
  return signs;
}

export class MarkerTiers {
  private map: maplibregl.Map;
  private signs: SignEntry[];
  private toggles: LayerToggles;
  // null — the whole country; a slug narrows the map to one oblast.
  private region: string | null = null;

  constructor(
    map: maplibregl.Map,
    groups: MarkerGroups,
    toggles: LayerToggles,
  ) {
    this.map = map;
    this.toggles = toggles;
    this.signs = collectSigns(groups);
    map.on("moveend", this.update);
    map.on("zoomend", this.update);
    this.update();
  }

  private update = (): void => {
    const zoom = this.map.getZoom();
    const dotMode = zoom < SIGN_MIN_ZOOM;
    const smallMode = !dotMode && zoom < SIGN_LARGE_ZOOM;
    for (const entry of this.signs) {
      this.setSignVisible(entry, this.visible(entry));
      entry.element.classList.toggle("dot-mode", dotMode);
      entry.element.classList.toggle("small-mode", smallMode);
    }
    // The overlay lines show at every zoom — they are the geography of the
    // events. Only the filter toggles govern them here; the tiers govern
    // the marker skins.
    for (const [kind, layerIds] of Object.entries(LINE_LAYERS)) {
      const on = this.toggles[kind as keyof LayerToggles];
      for (const layerId of layerIds) {
        setLayerVisibility(this.map, layerId, on);
      }
    }
  };

  private visible(entry: SignEntry): boolean {
    return (
      this.toggles[entry.kind] &&
      (this.region === null || entry.region === this.region)
    );
  }

  private setSignVisible(entry: SignEntry, visible: boolean): void {
    if (entry.visible !== visible) {
      entry.visible = visible;
      entry.element.classList.toggle("is-hidden", !visible);
    }
  }

  // Filters changed: re-run the tier logic for the current view.
  setToggles(toggles: LayerToggles): void {
    this.toggles = toggles;
    this.update();
  }

  // The region filter changed: re-run the tier logic. The overlay lines
  // don't go through here — their sources are rebuilt by applyOverlays,
  // which reads the same region.
  setRegion(region: string | null): void {
    this.region = region;
    this.update();
  }

  // Back to the plain all-signs map: forget the tiers, restore display.
  remove(): void {
    this.map.off("moveend", this.update);
    this.map.off("zoomend", this.update);
    for (const entry of this.signs) {
      this.setSignVisible(entry, this.visible(entry));
      entry.element.classList.remove("dot-mode", "small-mode");
    }
  }

  // Zoom to a sign so a shared link lands in the sign tiers with the marker
  // actually visible.
  flyToSign(id: string): void {
    const entry = this.signs.find((sign) => sign.id === id);
    if (!entry) return;
    this.map.flyTo({ center: entry.lngLat, zoom: SIGN_MIN_ZOOM + 0.5 });
  }
}
