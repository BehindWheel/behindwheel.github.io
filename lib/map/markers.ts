// The DOM markers the map draws with — the dashboard marker convention
// (ui/map/markers.js + map.css): a sign is an <img> inside .marker-body,
// sized 18x20, the maplibregl root anchors bottom so the sign's tip sits on
// the point; the skins live in the sibling map.css.

import maplibregl from "maplibre-gl";
import "./map.css";
import type { MediumSpeedCamera, RoadRepair, StationaryCamera } from "../cdn";

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

function speedLabel(car: number, truck: number): string {
  return truck > 0 ? `${car} / ${truck} км/ч` : `${car} км/ч`;
}

function popupHtml(body: string): string {
  return `<div class="site-popup">${body}</div>`;
}

export function stationaryPopup(camera: StationaryCamera): string {
  return popupHtml(
    `<strong>${camera.name}</strong>` +
      `<div>${speedLabel(camera.speedCar, camera.speedTruck)}</div>` +
      `<div>${camera.bidirectional ? "Оба направления" : "Одно направление"}</div>` +
      `<div class="site-popup-muted">Обновлено ${camera.updateTime}</div>`,
  );
}

export function mediumSpeedPopup(camera: MediumSpeedCamera): string {
  return popupHtml(
    `<strong>${camera.name}</strong>` +
      `<div>${speedLabel(camera.speedCar, camera.speedTruck)}</div>` +
      `<div>${camera.bidirectional ? "Оба направления" : "Одно направление"}, ${camera.points.length} точек</div>` +
      `<div class="site-popup-muted">Обновлено ${camera.updateTime}</div>`,
  );
}

export function repairPopup(repair: RoadRepair): string {
  return popupHtml(
    `<strong>${repair.road}</strong>` +
      (repair.note ? `<div>${repair.note}</div>` : "") +
      `<div>${repair.dateBegin} — ${repair.dateEnd}</div>` +
      (repair.speed > 0 ? `<div>Ограничение ${repair.speed} км/ч</div>` : "") +
      `<div class="site-popup-muted">${repair.verified ? "Проверено" : "Не проверено"}</div>`,
  );
}

export function showPopup(map: maplibregl.Map, lngLat: maplibregl.LngLat, html: string): void {
  new maplibregl.Popup({ maxWidth: "280px" })
    .setLngLat(lngLat)
    .setHTML(html)
    .addTo(map);
}

type SignMarkerOptions = {
  icon: string;
};

function createSignMarker({ icon }: SignMarkerOptions): maplibregl.Marker {
  const element = document.createElement("div");
  element.className = "sign-marker";
  const body = document.createElement("span");
  body.className = "marker-body";
  const img = document.createElement("img");
  img.src = icon;
  img.alt = "";
  body.appendChild(img);
  element.appendChild(body);
  return new maplibregl.Marker({ element, anchor: "bottom" });
}

function bindGroupClicks<T extends { id: string }>(
  map: maplibregl.Map,
  group: MarkerGroup<T>,
  popup: (item: T) => string,
): void {
  for (const marker of group.markers) {
    const element = marker.getElement();
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      const item = group.itemById.get(element.dataset.id ?? "");
      if (item) {
        showPopup(map, marker.getLngLat(), popup(item));
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

export function createMarkerGroups(data: {
  stationary: StationaryCamera[];
  mediumSpeed: MediumSpeedCamera[];
  repairs: RoadRepair[];
}): MarkerGroups {
  return {
    stationary: buildGroup(
      data.stationary.filter((camera) => camera.point),
      (camera) => [
        createSignMarker({ icon: ICONS.camera }).setLngLat([
          camera.point.lng,
          camera.point.lat,
        ]),
      ],
    ),
    mediumSpeed: buildGroup(
      data.mediumSpeed.filter((camera) => camera.points.length > 0),
      (camera) => [
        createSignMarker({ icon: ICONS.mediumSpeed }).setLngLat([
          camera.points[0].lng,
          camera.points[0].lat,
        ]),
      ],
    ),
    repairs: buildGroup(
      data.repairs.filter(
        (repair) => repair.type === "point" ? repair.point : repair.points?.length,
      ),
      (repair) => {
        // A point work wears the warning sign at its point; a stretch wears
        // the barrier sign at both ends of its polyline (road-repairs-point.svg
        // vs road-repairs.svg). A one-vertex polyline gets a single sign.
        if (repair.type === "point") {
          return [
            createSignMarker({ icon: ICONS.repairsPoint }).setLngLat([
              repair.point!.lng,
              repair.point!.lat,
            ]),
          ];
        }
        const points = repair.points!;
        const ends =
          points.length > 1
            ? [points[0], points[points.length - 1]]
            : [points[0]];
        return ends.map((at) =>
          createSignMarker({ icon: ICONS.repairsLine }).setLngLat([
            at.lng,
            at.lat,
          ]),
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

export function bindMarkerPopups(map: maplibregl.Map, groups: MarkerGroups): void {
  bindGroupClicks(map, groups.stationary, stationaryPopup);
  bindGroupClicks(map, groups.mediumSpeed, mediumSpeedPopup);
  bindGroupClicks(map, groups.repairs, repairPopup);
}

export function setMarkersVisibility(
  markers: maplibregl.Marker[],
  visible: boolean,
): void {
  for (const marker of markers) {
    marker.getElement().style.display = visible ? "" : "none";
  }
}
