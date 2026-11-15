// The zoom-band density control for the sign markers (issue #34): the map
// drills down through three bands — a single Belarus badge at country zoom,
// six oblast badges next, and from SIGN_MIN every sign shows. The overlay
// lines come and go with the signs: an orphaned line fragment under a badge
// reads as noise.
//
// The experiment's middle band — supercluster bubbles — lost to "see
// everything": at 266 points a 40px radius almost never caught a real
// overlap, a bubble just hid two markers a screen apart. The dependency went
// with it; what stayed is the progressive disclosure Belarus → oblast → signs.
//
// Filters are respected in every band: badges count only the visible kinds,
// and the line layers follow both the toggles and the band.

import * as maplibregl from "maplibre-gl";
import type { CdnData } from "../cdn";
import { regionName } from "../cdn";
import { MARKER_KINDS, type MarkerGroups, type SelectionKind } from "./markers";
import { LAYER_IDS, setLayerVisibility } from "./overlays";
import { BELARUS_BOUNDS } from "./style";

// Band edges in GL zoom units. Below BELARUS_MAX the country badge wins; the
// oblast band owns the middle; from SIGN_MIN every sign shows. Tuned against
// the live map — at 8.5 the densest oblast (Grodno) spreads across the whole
// viewport and reads fine.
const BELARUS_MAX_ZOOM = 7.5;
const SIGN_MIN_ZOOM = 8.5;

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

// A badge bucket: object ids (a two-sign line is still one thing) split by
// kind, plus the coordinate sums for the centroid.
type BadgeBucket = {
  lats: number[];
  lngs: number[];
  ids: Set<string>;
  kinds: Map<SelectionKind, Set<string>>;
};

type Badge = {
  marker: maplibregl.Marker;
  kinds: Map<SelectionKind, number>;
};

// The overlay lines show at every zoom — the bands govern only the sign
// markers. The registry here is just which layers follow which toggle.
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
  private belarusBadge: Badge | null = null;
  private regionBadges: Map<string, Badge>;

  constructor(
    map: maplibregl.Map,
    groups: MarkerGroups,
    data: CdnData,
    toggles: LayerToggles,
  ) {
    this.map = map;
    this.toggles = toggles;
    this.signs = collectSigns(groups, ClusterManager.regionById(data));
    this.regionBadges = new Map();
    this.rebuildBadges();
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

  private createBadge(
    name: string,
    bucket: BadgeBucket,
    targetZoom: number,
    // The country badge ignores the sign centroid — the dense west would
    // drag it off-center. It anchors to the geographic center of the bounds
    // the map fits at startup, so it sits dead-center on the first view.
    centroidOverride?: [number, number],
  ): Badge {
    const element = document.createElement("div");
    element.className = "region-badge";
    element.tabIndex = 0;
    element.setAttribute("role", "button");
    const breakdown = [...bucket.kinds.entries()]
      .filter(([, kindIds]) => kindIds.size > 0)
      .map(([kind, kindIds]) => `${KIND_LABELS[kind]}: ${kindIds.size}`)
      .join(", ");
    element.setAttribute("aria-label", `${name}: ${breakdown}`);
    const nameSpan = document.createElement("span");
    nameSpan.textContent = name;
    element.append(nameSpan);
    const kindsRow = document.createElement("span");
    kindsRow.className = "region-badge-kinds";
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
      kindsRow.append(kindLabel);
    }
    element.append(kindsRow);
    const centroid: [number, number] = centroidOverride ?? [
      bucket.lngs.reduce((a, b) => a + b, 0) / bucket.lngs.length,
      bucket.lats.reduce((a, b) => a + b, 0) / bucket.lats.length,
    ];
    element.addEventListener("click", () => {
      // Half a step above the target band edge: the flight must land the
      // user in the next band, or the badge they just clicked would stay on
      // screen. The centroid may sit off-screen for a sparse bucket — the
      // flight centers the map on it regardless, which is the point of the
      // drill-down.
      this.map.flyTo({ center: centroid, zoom: targetZoom });
    });
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        element.click();
      }
    });
    const marker = new maplibregl.Marker({ element, anchor: "center" }).setLngLat(centroid);
    const kinds = new Map<SelectionKind, number>();
    for (const [kind, kindIds] of bucket.kinds) {
      kinds.set(kind, kindIds.size);
    }
    return { marker, kinds };
  }

  private static addTo(bucket: BadgeBucket, entry: SignEntry): void {
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

  // The badges: one for the whole country (the Belarus band), one per oblast
  // with any visible object (the region band). Both come from the visible
  // signs' coordinates, so a fully filtered-out region simply has no badge.
  private rebuildBadges(): void {
    for (const { marker } of this.regionBadges.values()) {
      marker.remove();
    }
    if (this.belarusBadge) {
      this.belarusBadge.marker.remove();
    }
    this.regionBadges = new Map();
    this.belarusBadge = null;

    const whole: BadgeBucket = { lats: [], lngs: [], ids: new Set(), kinds: new Map() };
    const buckets = new Map<string, BadgeBucket>();
    for (const entry of this.signs) {
      if (!this.visible(entry) || !entry.region) continue;
      ClusterManager.addTo(whole, entry);
      let bucket = buckets.get(entry.region);
      if (!bucket) {
        bucket = { lats: [], lngs: [], ids: new Set(), kinds: new Map() };
        buckets.set(entry.region, bucket);
      }
      ClusterManager.addTo(bucket, entry);
    }
    if (whole.ids.size > 0) {
      this.belarusBadge = this.createBadge(
        "Беларусь",
        whole,
        BELARUS_MAX_ZOOM + 0.5,
        [
          (BELARUS_BOUNDS[0][0] + BELARUS_BOUNDS[1][0]) / 2,
          (BELARUS_BOUNDS[0][1] + BELARUS_BOUNDS[1][1]) / 2,
        ],
      );
    }
    for (const [region, bucket] of buckets) {
      this.regionBadges.set(
        region,
        this.createBadge(regionName(region), bucket, SIGN_MIN_ZOOM + 0.5),
      );
    }
  }

  private update = (): void => {
    const zoom = this.map.getZoom();
    const band =
      zoom < BELARUS_MAX_ZOOM ? "belarus" : zoom < SIGN_MIN_ZOOM ? "region" : "signs";
    const signsOn = band === "signs";
    for (const entry of this.signs) {
      this.setSignVisible(entry, signsOn && this.visible(entry));
    }
    // The overlay lines show at every zoom — they are the geography of the
    // events and give the badge bands their context. Only the filter
    // toggles govern them here; the bands govern the signs.
    for (const [kind, layerIds] of Object.entries(LINE_LAYERS)) {
      const on = this.toggles[kind as keyof LayerToggles];
      for (const layerId of layerIds) {
        setLayerVisibility(this.map, layerId, on);
      }
    }
    if (this.belarusBadge) {
      this.belarusBadge.marker
        .getElement()
        .classList.toggle("is-hidden", band !== "belarus");
    }
    for (const { marker } of this.regionBadges.values()) {
      marker.getElement().classList.toggle("is-hidden", band !== "region");
    }
  };

  private setSignVisible(entry: SignEntry, visible: boolean): void {
    if (entry.visible !== visible) {
      entry.visible = visible;
      entry.element.classList.toggle("is-hidden", !visible);
    }
  }

  // Filters changed: rebuild the badges from the visible kinds only, then
  // re-run the band logic for the current view.
  setToggles(toggles: LayerToggles): void {
    this.toggles = toggles;
    this.rebuildBadges();
    for (const { marker } of this.regionBadges.values()) {
      marker.addTo(this.map);
    }
    if (this.belarusBadge) {
      this.belarusBadge.marker.addTo(this.map);
    }
    this.update();
  }

  // Back to the plain all-signs map: forget the band logic, restore display.
  remove(): void {
    this.map.off("moveend", this.update);
    this.map.off("zoomend", this.update);
    if (this.belarusBadge) {
      this.belarusBadge.marker.remove();
    }
    for (const { marker } of this.regionBadges.values()) {
      marker.remove();
    }
    for (const entry of this.signs) {
      this.setSignVisible(entry, this.visible(entry));
    }
  }

  // Zoom to a sign so a shared link lands in the sign band with the marker
  // actually visible.
  flyToSign(id: string): void {
    const entry = this.signs.find((sign) => sign.id === id);
    if (!entry) return;
    this.map.flyTo({ center: entry.lngLat, zoom: SIGN_MIN_ZOOM + 0.5 });
  }
}
