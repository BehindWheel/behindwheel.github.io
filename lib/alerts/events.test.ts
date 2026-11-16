import { describe, expect, it } from "vitest";
import type { MediumSpeedCamera, StationaryCamera } from "../cdn";
import { alertableCameras, mediumSpeedCameraEvents, stationaryCameraEvents } from "./events";

const stationary: StationaryCamera = {
  id: "s1",
  name: "М6",
  point: { lat: 53.6694, lng: 23.8133 },
  angle: 180,
  bidirectional: false,
  updateTime: "2026-11-01T00:00:00Z",
  speedCar: 60,
  speedTruck: 60,
  region: "grodno",
};

const section: MediumSpeedCamera = {
  id: "m1",
  name: "М6 участок",
  bidirectional: false,
  angleStart: 45,
  angleEnd: 50,
  speedCar: 90,
  speedTruck: 90,
  region: "grodno",
  updateTime: "2026-11-01T00:00:00Z",
  points: [
    { lat: 53.7, lng: 23.8 },
    { lat: 53.71, lng: 23.81 },
    { lat: 53.72, lng: 23.82 },
  ],
};

describe("stationaryCameraEvents", () => {
  it("maps cameras, dropping pointless entries", () => {
    const events = stationaryCameraEvents([
      stationary,
      { ...stationary, id: "s2", point: undefined as unknown as { lat: number; lng: number } },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "s1",
      angle: 180,
      bidirectional: false,
      speedLimit: 60,
      cameraType: "stationary",
    });
  });
});

describe("mediumSpeedCameraEvents", () => {
  it("contributes the section ends with their travel angles", () => {
    const events = mediumSpeedCameraEvents([section]);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      id: "m1",
      position: { lat: 53.7, lng: 23.8 },
      angle: 45,
      speedLimit: 90,
      cameraType: "mediumSpeed",
    });
    expect(events[1]).toMatchObject({
      id: "m1",
      position: { lat: 53.72, lng: 23.82 },
      angle: 50,
    });
  });

  it("collapses a single-point section to one event", () => {
    const events = mediumSpeedCameraEvents([{ ...section, points: [{ lat: 53.7, lng: 23.8 }] }]);
    expect(events).toHaveLength(1);
    expect(events[0].angle).toBe(45);
  });

  it("skips empty sections", () => {
    expect(mediumSpeedCameraEvents([{ ...section, points: [] }])).toEqual([]);
  });
});

describe("alertableCameras", () => {
  it("joins both collections", () => {
    expect(alertableCameras({ stationary: [stationary], mediumSpeed: [section] })).toHaveLength(3);
  });
});
