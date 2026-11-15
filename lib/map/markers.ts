// The DOM markers the map draws with — the dashboard marker convention
// (ui/map/markers.js + map.css): a sign is an <img> inside .marker-body,
// sized 18x20, the maplibregl root anchors bottom so the sign's tip sits on
// the point; the skins live in the sibling map.css.

import * as maplibregl from "maplibre-gl";
import "./map.css";
import type {
  CdnPoint,
  MediumSpeedCamera,
  RoadRepair,
  StationaryCamera,
} from "../cdn";

const ICONS = {
  camera: "/icons/camera.svg",
  mediumSpeed: "/icons/medium-speed.svg",
  repairsPoint: "/icons/road-repairs-point.svg",
  repairsLine: "/icons/road-repairs.svg",
} as const;

export type MarkerGroup<T extends { id: string }> = {
  markers: maplibregl.Marker[];
  itemById: Map<string, T>;
};

export type MarkerGroups = {
  stationary: MarkerGroup<StationaryCamera>;
  mediumSpeed: MarkerGroup<MediumSpeedCamera>;
  repairs: MarkerGroup<RoadRepair>;
};

export type SelectionKind = "stationary" | "mediumSpeed" | "repairs";

// The group walk order the tiers rely on (marker-tiers.ts walks the groups
// with this to build its flat sign registry).
export const MARKER_KINDS: SelectionKind[] = [
  "stationary",
  "mediumSpeed",
  "repairs",
];

export type SelectFeature = (kind: SelectionKind, id: string) => void;

type SignMarkerOptions = {
  icon: string;
  // The accessible name: the marker element is a focusable button (WCAG
  // 2.1.1 — a click-only div is unreachable from the keyboard).
  label: string;
  // Drives the dot skin's color (the low-zoom face) through data-kind.
  kind: SelectionKind;
};

function createSignMarker({
  icon,
  label,
  kind,
}: SignMarkerOptions): maplibregl.Marker {
  const element = document.createElement("div");
  element.className = "sign-marker";
  element.tabIndex = 0;
  element.setAttribute("role", "button");
  element.setAttribute("aria-label", label);
  element.dataset.kind = kind;
  const body = document.createElement("span");
  body.className = "marker-body";
  const img = document.createElement("img");
  img.src = icon;
  img.alt = "";
  body.appendChild(img);
  element.appendChild(body);
  // The dot tier's hover tooltip: the object's name without the kind prefix —
  // the dot color already tells the kind. The full label stays on aria-label.
  element.dataset.tooltip = label.slice(label.indexOf(":") + 1).trim();
  // The low-zoom face (the mobile app's Circle tier): a plain colored dot
  // instead of the artwork, so a country-wide view carries every object
  // without a pile of signs. Same element, same click — the band logic just
  // swaps the skin through a class.
  const dot = document.createElement("span");
  dot.className = "marker-dot";
  element.appendChild(dot);
  return new maplibregl.Marker({ element, anchor: "bottom" });
}

function bindGroupActivations<T extends { id: string }>(
  group: MarkerGroup<T>,
  kind: SelectionKind,
  onSelect: SelectFeature,
): void {
  for (const marker of group.markers) {
    const element = marker.getElement();
    const select = (event: Event) => {
      event.stopPropagation();
      const id = element.dataset.id;
      if (id !== undefined) {
        onSelect(kind, id);
      }
    };
    element.addEventListener("click", select);
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        select(event);
      }
    });
  }
}

function buildGroup<T extends { id: string }>(
  items: T[],
  markersAt: (item: T) => maplibregl.Marker[],
): MarkerGroup<T> {
  const group: MarkerGroup<T> = { markers: [], itemById: new Map() };
  for (const item of items) {
    group.itemById.set(item.id, item);
    for (const marker of markersAt(item)) {
      marker.getElement().dataset.id = item.id;
      group.markers.push(marker);
    }
  }
  return group;
}

// The dashboard puts an endpoint sign at both polyline ends (a medium-speed
// section's two cameras, a repair stretch's entry/exit); a one-vertex line
// gets a single sign.
function lineEnds(points: CdnPoint[]): CdnPoint[] {
  return points.length > 1 ? [points[0], points[points.length - 1]] : [points[0]];
}

export function createMarkerGroups(data: {
  stationary: StationaryCamera[];
  mediumSpeed: MediumSpeedCamera[];
  repairs: RoadRepair[];
}): MarkerGroups {
  return {
    stationary: buildGroup(
      data.stationary.filter((camera) => camera.point),
      (camera) => [
        createSignMarker({
          icon: ICONS.camera,
          label: `Стационарная камера: ${camera.name}`,
          kind: "stationary",
        }).setLngLat([camera.point.lng, camera.point.lat]),
      ],
    ),
    mediumSpeed: buildGroup(
      data.mediumSpeed.filter((camera) => camera.points.length > 0),
      (camera) =>
        lineEnds(camera.points).map((at) =>
          createSignMarker({
            icon: ICONS.mediumSpeed,
            label: `Участок средней скорости: ${camera.name}`,
            kind: "mediumSpeed",
          }).setLngLat([at.lng, at.lat]),
        ),
    ),
    repairs: buildGroup(
      data.repairs.filter(
        (repair) => repair.type === "point" ? repair.point : repair.points?.length,
      ),
      (repair) => {
        // A point work wears the warning sign at its point, a stretch the
        // barrier sign (road-repairs-point.svg vs road-repairs.svg).
        if (repair.type === "point") {
          return [
            createSignMarker({
              icon: ICONS.repairsPoint,
              label: `Ремонт дороги: ${repair.road}`,
              kind: "repairs",
            }).setLngLat([repair.point!.lng, repair.point!.lat]),
          ];
        }
        return lineEnds(repair.points!).map((at) =>
          createSignMarker({
            icon: ICONS.repairsLine,
            label: `Ремонт дороги: ${repair.road}`,
            kind: "repairs",
          }).setLngLat([at.lng, at.lat]),
        );
      },
    ),
  };
}

export function addMarkerGroups(map: maplibregl.Map, groups: MarkerGroups): void {
  for (const group of [groups.stationary, groups.mediumSpeed, groups.repairs]) {
    for (const marker of group.markers) {
      marker.addTo(map);
    }
  }
}

export function bindMarkerSelections(
  groups: MarkerGroups,
  onSelect: SelectFeature,
): void {
  bindGroupActivations(groups.stationary, "stationary", onSelect);
  bindGroupActivations(groups.mediumSpeed, "mediumSpeed", onSelect);
  bindGroupActivations(groups.repairs, "repairs", onSelect);
}
