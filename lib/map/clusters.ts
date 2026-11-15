// The zoom-band density control for the sign markers (issue #34): at country
// zoom 266 signs read as a pile, so they give way to six region badges; from
// REGION_MAX every sign shows, and the overlay lines come and go with them.
//
// The experiment's middle band — supercluster bubbles — lost to "see
// everything": at 266 points a 40px radius almost never caught a real
// overlap, a bubble just hid two markers a screen apart. The hybrid
// collapsed into two bands, and the dependency went with it.
//
// Filters are respected in every band: badges count only the visible kinds,
// and the line layers follow both the toggles and the band.

import * as maplibregl from "maplibre-gl";
import type { CdnData } from "../cdn";
import { regionName } from "../cdn";
import { MARKER_KINDS, type MarkerGroups, type SelectionKind } from "./markers";
import { LAYER_IDS, setLayerVisibility } from "./overlays";

// Band edge in GL zoom units: below it the country view wins. Tuned against
// the live map — Grodno oblast (the densest) reads clean from 7.5.
const REGION_MAX_ZOOM = 7.5;

export type LayerToggles = Record<SelectionKind, boolean>;

// One sign marker: the flat registry the bands index into. A line object
// contributes two signs (its ends), a point object one — the marker groups
// already carry that split, so the registry just walks the groups.
type SignEntry = {
  kind: SelectionKind;
  id: string;
  element: HTMLElement;
  lngLat: [number, number];
  region: string;
  visible: boolean;
};

// The overlay lines hide with the signs at country zoom — an orphaned line
// fragment under a region badge reads as noise.
const LINE_LAYERS: Record<Exclude<SelectionKind, "stationary">, string[]> = {
  mediumSpeed: [LAYER_IDS.mediumSpeed, LAYER_IDS.mediumSpeedHit],
  repairs: [LAYER_IDS.repairsLines, LAYER_IDS.repairsLinesHit],
};

function collectSigns(groups: MarkerGroups, regionById: Map<string, string>): SignEntry[] {
  const signs: SignEntry[] = [];
  for (const kind of MARKER_KINDS) {
    for (const marker of groups[kind].markers) {
      const element = marker.getElement();
      const id = element.dataset.id ?? "";
      signs.push({
        kind,
        id,
        element,
        lngLat: marker.getLngLat().toArray() as [number, number],
        region: regionById.get(id) ?? "",
        visible: true,
      });
    }
  }
  return signs;
}

// The badge artwork — the same files the filter panel and the markers use,
// so a badge's breakdown reads in the same icon language as everything else.
const KIND_ICONS: Record<SelectionKind, string> = {
  stationary: "/icons/camera.svg",
  mediumSpeed: "/icons/medium-speed.svg",
  repairs: "/icons/road-repairs-point.svg",
};

const KIND_LABELS: Record<SelectionKind, string> = {
  stationary: "камеры",
  mediumSpeed: "участки средней скорости",
  repairs: "ремонты",
};

export class ClusterManager {
  private map: maplibregl.Map;
  private signs: SignEntry[];
  private toggles: LayerToggles;
  private badges: Map<string, { marker: maplibregl.Marker; count: number }>;

  constructor(
    map: maplibregl.Map,
    groups: MarkerGroups,
    data: CdnData,
    toggles: LayerToggles,
  ) {
    this.map = map;
    this.toggles = toggles;
    this.signs = collectSigns(groups, ClusterManager.regionById(data));
    this.badges = this.buildBadges();
    for (const { marker } of this.badges.values()) {
      marker.addTo(map);
    }
    map.on("moveend", this.update);
    map.on("zoomend", this.update);
    this.update();
  }

  // Signs carry only ids; the CDN data is the region source.
  private static regionById(data: CdnData): Map<string, string> {
    const byId = new Map<string, string>();
    for (const camera of data.stationary) byId.set(camera.id, camera.region);
    for (const camera of data.mediumSpeed) byId.set(camera.id, camera.region);
    for (const repair of data.repairs) byId.set(repair.id, repair.region);
    return byId;
  }

  private visible(entry: SignEntry): boolean {
    return this.toggles[entry.kind];
  }

  // The region badges: centroid comes from the visible signs' coordinates,
  // so a fully filtered-out region simply has no badge. The counts read
  // objects, not signs — a two-sign line is still one thing — and split by
  // kind, so the badge previews what lives in the oblast before any click.
  private buildBadges(): ClusterManager["badges"] {
    const buckets = new Map<
      string,
      { lats: number[]; lngs: number[]; ids: Set<string>; kinds: Map<SelectionKind, Set<string>> }
    >();
    for (const entry of this.signs) {
      if (!this.visible(entry) || !entry.region) continue;
      let bucket = buckets.get(entry.region);
      if (!bucket) {
        bucket = { lats: [], lngs: [], ids: new Set(), kinds: new Map() };
        buckets.set(entry.region, bucket);
      }
      bucket.lats.push(entry.lngLat[1]);
      bucket.lngs.push(entry.lngLat[0]);
      bucket.ids.add(entry.id);
      let kindIds = bucket.kinds.get(entry.kind);
      if (!kindIds) {
        kindIds = new Set();
        bucket.kinds.set(entry.kind, kindIds);
      }
      kindIds.add(entry.id);
    }
    const badges = new Map<string, { marker: maplibregl.Marker; count: number }>();
    for (const [region, bucket] of buckets) {
      const count = bucket.ids.size;
      const element = document.createElement("div");
      element.className = "region-badge";
      element.tabIndex = 0;
      element.setAttribute("role", "button");
      const breakdown = [...bucket.kinds.entries()]
        .filter(([, kindIds]) => kindIds.size > 0)
        .map(([kind, kindIds]) => `${KIND_LABELS[kind]}: ${kindIds.size}`)
        .join(", ");
      element.setAttribute("aria-label", `${regionName(region)}: ${breakdown}`);
      const name = document.createElement("span");
      name.textContent = regionName(region);
      element.append(name);
      for (const kind of MARKER_KINDS) {
        const kindIds = bucket.kinds.get(kind);
        if (!kindIds || kindIds.size === 0) continue;
        const kindLabel = document.createElement("span");
        kindLabel.className = "region-badge-kind";
        const icon = document.createElement("img");
        icon.src = KIND_ICONS[kind];
        icon.alt = "";
        const number = document.createElement("span");
        number.textContent = String(kindIds.size);
        kindLabel.append(icon, number);
        element.append(kindLabel);
      }
      const centroid: [number, number] = [
        bucket.lngs.reduce((a, b) => a + b, 0) / bucket.lngs.length,
        bucket.lats.reduce((a, b) => a + b, 0) / bucket.lats.length,
      ];
      element.addEventListener("click", () => {
        // Half a step above the band edge: the flight must land the user
        // with the signs already showing, or the badge they just clicked
        // would stay on screen.
        this.map.flyTo({ center: centroid, zoom: REGION_MAX_ZOOM + 0.5 });
      });
      element.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          element.click();
        }
      });
      const marker = new maplibregl.Marker({ element, anchor: "center" }).setLngLat(centroid);
      badges.set(region, { marker, count });
    }
    return badges;
  }

  private update = (): void => {
    const country = this.map.getZoom() < REGION_MAX_ZOOM;
    for (const entry of this.signs) {
      this.setSignVisible(entry, !country && this.visible(entry));
    }
    for (const [kind, layerIds] of Object.entries(LINE_LAYERS)) {
      const on = !country && this.toggles[kind as keyof LayerToggles];
      for (const layerId of layerIds) {
        setLayerVisibility(this.map, layerId, on);
      }
    }
    this.setBadgesVisible(country);
  };

  // The badge markers stay attached; the band only flips their class, so
  // the CSS opacity transition covers every band switch.
  private setBadgesVisible(country: boolean): void {
    for (const { marker } of this.badges.values()) {
      marker.getElement().classList.toggle("is-hidden", !country);
    }
  }

  private setSignVisible(entry: SignEntry, visible: boolean): void {
    if (entry.visible !== visible) {
      entry.visible = visible;
      entry.element.classList.toggle("is-hidden", !visible);
    }
  }

  // Filters changed: rebuild the badges from the visible kinds only, then
  // re-run the band logic for the current view. The old markers must come
  // off first — the status flip in MapScreen re-runs this on an unchanged
  // view, and a rebuild without removal doubles every badge.
  setToggles(toggles: LayerToggles): void {
    this.toggles = toggles;
    for (const { marker } of this.badges.values()) {
      marker.remove();
    }
    this.badges = this.buildBadges();
    for (const { marker } of this.badges.values()) {
      marker.addTo(this.map);
    }
    this.update();
  }

  // Back to the plain all-signs map: forget the band logic, restore display.
  remove(): void {
    this.map.off("moveend", this.update);
    this.map.off("zoomend", this.update);
    for (const { marker } of this.badges.values()) {
      marker.remove();
    }
    for (const entry of this.signs) {
      this.setSignVisible(entry, this.visible(entry));
    }
  }

  // Zoom to a sign so a shared link lands above the band edge with the
  // marker actually visible.
  flyToSign(id: string): void {
    const entry = this.signs.find((sign) => sign.id === id);
    if (!entry) return;
    this.map.flyTo({ center: entry.lngLat, zoom: REGION_MAX_ZOOM + 0.5 });
  }
}
