// The zoom-band density control for the sign markers (issue #34, the hybrid
// experiment): at country zoom 266 signs read as a pile, so they give way to
// six region badges; the middle band clusters the signs by pixel radius
// through supercluster; close zoom shows every sign as before. The overlay
// lines are untouched — only the end signs compress.
//
// Filters are respected in every band: the index and the badges are rebuilt
// from the visible kinds only, so no count ever includes a hidden layer.

import Supercluster, { type ClusterProperties } from "supercluster";
import * as maplibregl from "maplibre-gl";
import type { CdnData } from "../cdn";
import { regionName } from "../cdn";
import { MARKER_KINDS, type MarkerGroups, type SelectionKind } from "./markers";

// Band edges in GL zoom units: below REGION_MAX the country view wins, from
// DETAIL_MIN every sign shows, the middle belongs to supercluster. Tuned
// against the live map — Grodno oblast (the densest) reads clean from 7.5.
const REGION_MAX_ZOOM = 7.5;
const DETAIL_MIN_ZOOM = 10;
const CLUSTER_RADIUS_PX = 60;

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

type ClusterPoint = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: { sign: number };
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

export class ClusterManager {
  private map: maplibregl.Map;
  private signs: SignEntry[];
  private toggles: LayerToggles;
  private data: CdnData;
  private index: Supercluster<{ sign: number }>;
  private bubbles: maplibregl.Marker[] = [];
  private badges: Map<
    string,
    { marker: maplibregl.Marker; count: number }
  >;

  constructor(
    map: maplibregl.Map,
    groups: MarkerGroups,
    data: CdnData,
    toggles: LayerToggles,
  ) {
    this.map = map;
    this.data = data;
    this.toggles = toggles;
    this.signs = collectSigns(groups, ClusterManager.regionById(data));
    this.index = this.buildIndex();
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

  private buildIndex(): Supercluster<{ sign: number }> {
    const points: ClusterPoint[] = [];
    for (const [i, entry] of this.signs.entries()) {
      if (!this.visible(entry)) continue;
      points.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: entry.lngLat },
        properties: { sign: i },
      });
    }
    return new Supercluster<{ sign: number }>({
      radius: CLUSTER_RADIUS_PX,
      maxZoom: DETAIL_MIN_ZOOM,
    }).load(points);
  }

  private visible(entry: SignEntry): boolean {
    return this.toggles[entry.kind];
  }

  // The region badges: centroid and bounds come from the visible signs'
  // coordinates, so a fully filtered-out region simply has no badge. The
  // count reads objects, not signs — a two-sign line is still one thing.
  private buildBadges(): ClusterManager["badges"] {
    const buckets = new Map<
      string,
      { lats: number[]; lngs: number[]; ids: Set<string> }
    >();
    for (const entry of this.signs) {
      if (!this.visible(entry) || !entry.region) continue;
      let bucket = buckets.get(entry.region);
      if (!bucket) {
        bucket = { lats: [], lngs: [], ids: new Set() };
        buckets.set(entry.region, bucket);
      }
      bucket.lats.push(entry.lngLat[1]);
      bucket.lngs.push(entry.lngLat[0]);
      bucket.ids.add(entry.id);
    }
    const badges = new Map<
      string,
      { marker: maplibregl.Marker; count: number }
    >();
    for (const [region, bucket] of buckets) {
      const count = bucket.ids.size;
      const element = document.createElement("div");
      element.className = "region-badge";
      element.tabIndex = 0;
      element.setAttribute("role", "button");
      element.setAttribute(
        "aria-label",
        `${regionName(region)}: ${count} объектов на карте`,
      );
      const name = document.createElement("span");
      name.textContent = regionName(region);
      const countLabel = document.createElement("span");
      countLabel.className = "region-badge-count";
      countLabel.textContent = String(count);
      element.append(name, countLabel);
      const centroid: [number, number] = [
        bucket.lngs.reduce((a, b) => a + b, 0) / bucket.lngs.length,
        bucket.lats.reduce((a, b) => a + b, 0) / bucket.lats.length,
      ];
      element.addEventListener("click", () => {
        // A fixed flight into the cluster band rather than fitBounds: an
        // oblast-sized bbox can resolve below the band edge, and the badge
        // the user just clicked would stay on screen. Half a step over the
        // edge guarantees the dissolve.
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
    const zoom = this.map.getZoom();
    if (zoom < REGION_MAX_ZOOM) {
      for (const bubble of this.bubbles) bubble.remove();
      this.bubbles = [];
      for (const entry of this.signs) this.setSignVisible(entry, false);
      this.addBadges();
      return;
    }
    this.removeBadges();
    if (zoom >= DETAIL_MIN_ZOOM) {
      for (const bubble of this.bubbles) bubble.remove();
      this.bubbles = [];
      for (const entry of this.signs) {
        this.setSignVisible(entry, this.visible(entry));
      }
      return;
    }
    this.showClusterBand(zoom);
  };

  private addBadges(): void {
    for (const { marker } of this.badges.values()) {
      marker.addTo(this.map);
    }
  }

  private removeBadges(): void {
    for (const { marker } of this.badges.values()) {
      marker.remove();
    }
  }

  private showClusterBand(zoom: number): void {
    for (const bubble of this.bubbles) bubble.remove();
    this.bubbles = [];
    const bounds = this.map.getBounds();
    const bbox: [number, number, number, number] = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ];
    const shown = new Set<number>();
    for (const feature of this.index.getClusters(bbox, Math.floor(zoom))) {
      const [lng, lat] = feature.geometry.coordinates;
      // supercluster unions the leaf props with its own cluster fields —
      // one cast covers both shapes of the union.
      const props = feature.properties as ClusterProperties & {
        sign?: number;
      };
      if (props.cluster) {
        const element = document.createElement("div");
        element.className = "cluster-bubble";
        element.textContent = String(props.point_count);
        element.addEventListener("click", () => {
          const target = this.index.getClusterExpansionZoom(props.cluster_id);
          this.map.easeTo({ center: [lng, lat], zoom: target });
        });
        const bubble = new maplibregl.Marker({ element, anchor: "center" })
          .setLngLat([lng, lat])
          .addTo(this.map);
        this.bubbles.push(bubble);
      } else {
        shown.add(props.sign!);
      }
    }
    for (const [i, entry] of this.signs.entries()) {
      this.setSignVisible(entry, shown.has(i));
    }
  }

  private setSignVisible(entry: SignEntry, visible: boolean): void {
    if (entry.visible !== visible) {
      entry.visible = visible;
      entry.element.style.display = visible ? "" : "none";
    }
  }

  // Filters changed: rebuild the index and the badges from the visible kinds
  // only, then re-run the band logic for the current view.
  setToggles(toggles: LayerToggles): void {
    this.toggles = toggles;
    this.index = this.buildIndex();
    this.removeBadges();
    this.badges = this.buildBadges();
    this.update();
  }

  // Back to the plain all-signs map: forget the band logic, restore display.
  remove(): void {
    this.map.off("moveend", this.update);
    this.map.off("zoomend", this.update);
    for (const bubble of this.bubbles) bubble.remove();
    this.removeBadges();
    for (const entry of this.signs) {
      this.setSignVisible(entry, this.visible(entry));
    }
  }

  // Zoom to a sign so a shared link lands inside the detail band with the
  // marker actually visible.
  flyToSign(id: string): void {
    const entry = this.signs.find((sign) => sign.id === id);
    if (!entry) return;
    this.map.flyTo({ center: entry.lngLat, zoom: DETAIL_MIN_ZOOM + 0.5 });
  }
}
