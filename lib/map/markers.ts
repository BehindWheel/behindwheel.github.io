// The DOM markers the map draws with — the dashboard marker convention
// (ui/map/markers.js + map.css): a sign is an <img> inside .marker-body,
// sized 18x20, the maplibregl root anchors bottom so the sign's tip sits on
// the point; the skins live in the sibling map.css.

import maplibregl from "maplibre-gl";
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

export type SelectFeature = (kind: SelectionKind, id: string) => void;

type SignMarkerOptions = {
  icon: string;
  // The accessible name: the marker element is a focusable button (WCAG
  // 2.1.1 — a click-only div is unreachable from the keyboard).
  label: string;
};

function createSignMarker({ icon, label }: SignMarkerOptions): maplibregl.Marker {
  const element = document.createElement("div");
  element.className = "sign-marker";
  element.tabIndex = 0;
  element.setAttribute("role", "button");
  element.setAttribute("aria-label", label);
  const body = document.createElement("span");
  body.className = "marker-body";
  const img = document.createElement("img");
  img.src = icon;
  img.alt = "";
  body.appendChild(img);
  element.appendChild(body);
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
            }).setLngLat([repair.point!.lng, repair.point!.lat]),
          ];
        }
        return lineEnds(repair.points!).map((at) =>
          createSignMarker({
            icon: ICONS.repairsLine,
            label: `Ремонт дороги: ${repair.road}`,
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

export function setMarkersVisibility(
  markers: maplibregl.Marker[],
  visible: boolean,
): void {
  for (const marker of markers) {
    marker.getElement().style.display = visible ? "" : "none";
  }
}
