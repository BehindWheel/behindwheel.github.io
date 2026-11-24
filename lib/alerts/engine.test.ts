import { describe, expect, it } from "vitest";
import {
  computeAlerts,
  computeOverSpeed,
  isAngleInRange,
  isSameOverSpeed,
  isUserOnCameraRoad,
  type AlertableCamera,
  type DriveLocation,
} from "./engine";

// The angle cases are the mobile app's AngleUtilTest verbatim — a camera
// fires when the driver moves opposite to its facing angle (±25°).
describe("isAngleInRange", () => {
  it("passes the app's possible values", () => {
    expect(isAngleInRange(190, 10, false)).toBe(true);
    expect(isAngleInRange(28, 197, false)).toBe(true);
    expect(isAngleInRange(217, 197, false)).toBe(false);
    expect(isAngleInRange(20, 10, false)).toBe(false);
    expect(isAngleInRange(117, 120, false)).toBe(false);
    expect(isAngleInRange(120, 30, false)).toBe(false);
    expect(isAngleInRange(30, 120, false)).toBe(false);
    expect(isAngleInRange(359, 320, false)).toBe(false);
    expect(isAngleInRange(359, 173, false)).toBe(true);
    expect(isAngleInRange(320, 359, false)).toBe(false);
    expect(isAngleInRange(289, 120, false)).toBe(true);
    expect(isAngleInRange(106, 280, false)).toBe(true);

    expect(isAngleInRange(117, 120, true)).toBe(true);
    expect(isAngleInRange(117, 298, true)).toBe(true);
  });
});

// The corridor cases are the mobile app's RoadCorridorUtilTest verbatim —
// the cross-track must sit within the 40 m road half-width.
describe("isUserOnCameraRoad", () => {
  it("passes the app's axis and corridor cases", () => {
    const camera = { lat: 0, lng: 0 };
    expect(isUserOnCameraRoad(camera, 0, camera)).toBe(true);
    expect(isUserOnCameraRoad(camera, 0, { lat: 0.001, lng: 0 })).toBe(true);
    expect(isUserOnCameraRoad(camera, 0, { lat: -0.001, lng: 0 })).toBe(true);
    // ~20 m east/west of a north-facing road: inside; ~60 m: outside.
    expect(isUserOnCameraRoad(camera, 0, { lat: 0, lng: 0.0001797 })).toBe(true);
    expect(isUserOnCameraRoad(camera, 0, { lat: 0, lng: 0.0005393 })).toBe(false);
    expect(isUserOnCameraRoad(camera, 0, { lat: 0, lng: -0.0001797 })).toBe(true);
    expect(isUserOnCameraRoad(camera, 0, { lat: 0, lng: -0.0005393 })).toBe(false);
    // The 40 m boundary is inside, 41 m is out.
    expect(isUserOnCameraRoad(camera, 0, { lat: 0, lng: 0.0003594 })).toBe(true);
    expect(isUserOnCameraRoad(camera, 0, { lat: 0, lng: -0.0003594 })).toBe(true);
    expect(isUserOnCameraRoad(camera, 0, { lat: 0, lng: 0.0003685 })).toBe(false);
    expect(isUserOnCameraRoad(camera, 0, { lat: 0, lng: -0.0003685 })).toBe(false);
    // An east-facing road cuts across latitude.
    expect(isUserOnCameraRoad(camera, 90, { lat: 0.0001802, lng: 0 })).toBe(true);
    expect(isUserOnCameraRoad(camera, 90, { lat: 0.0005405, lng: 0 })).toBe(false);
    expect(isUserOnCameraRoad(camera, 90, { lat: -0.0001802, lng: 0 })).toBe(true);
    expect(isUserOnCameraRoad(camera, 90, { lat: -0.0005405, lng: 0 })).toBe(false);
  });

  it("passes the app's Grodno cases", () => {
    const camera = { lat: 53.6694, lng: 23.8133 };
    expect(isUserOnCameraRoad(camera, 0, { lat: 53.6703, lng: 23.8133 })).toBe(true);
    expect(isUserOnCameraRoad(camera, 0, { lat: 53.67, lng: 23.8144 })).toBe(false);
  });
});

// The engine cases follow the app's AlertMessagesTransformation: the speed
// gate, the corridor window (20 m..radius) and the direction checks.
describe("computeAlerts", () => {
  const camera: AlertableCamera = {
    id: "cam-1",
    // 300 m north of the driver.
    position: { lat: 53.6721, lng: 23.8133 },
    angle: 180,
    bidirectional: false,
    speedLimit: 60,
    cameraType: "stationary",
  };
  const driver = (bearing: number, speed: number): DriveLocation => ({
    latLng: { lat: 53.6694, lng: 23.8133 },
    bearing,
    speed,
  });

  it("stays silent below the 10 km/h speed gate", () => {
    expect(computeAlerts([camera], driver(0, 9), 600)).toEqual([]);
    expect(computeAlerts([camera], driver(0, 0), 600)).toEqual([]);
  });

  it("stays silent without a location fix", () => {
    expect(computeAlerts([camera], null, 600)).toEqual([]);
  });

  it("warns driving toward a facing camera inside the radius", () => {
    const alerts = computeAlerts([camera], driver(0, 50), 600);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      kind: "camera",
      id: "cam-1",
      speedLimit: 60,
      cameraType: "stationary",
    });
    expect(alerts[0].distance).toBeGreaterThan(20);
    expect(alerts[0].distance).toBeLessThanOrEqual(600);
  });

  it("stays silent driving away from the camera", () => {
    // The driver moves south, the camera faces north (watches northbound
    // traffic): driving south the angle is not opposite to 180°... driving
    // north toward the camera is the fire case; here the driver moves south.
    expect(computeAlerts([camera], driver(180, 50), 600)).toEqual([]);
  });

  it("warns for a no-direction camera regardless of bearing", () => {
    const blind = { ...camera, angle: -1, bidirectional: false };
    // Ahead and ahead-left: inside the corridor lens either way.
    expect(computeAlerts([blind], driver(0, 50), 600)).toHaveLength(1);
    expect(computeAlerts([blind], driver(45, 50), 600)).toHaveLength(1);
    expect(computeAlerts([blind], driver(315, 50), 600)).toHaveLength(1);
  });

  it("stays silent past the alert radius and inside the 20 m dead zone", () => {
    // 700 m north: outside a 600 m radius.
    const far = { ...camera, position: { lat: 53.6757, lng: 23.8133 } };
    expect(computeAlerts([far], driver(0, 50), 600)).toEqual([]);
    // 15 m north: inside the dead zone (already passing).
    const near = { ...camera, position: { lat: 53.66955, lng: 23.8133 } };
    expect(computeAlerts([near], driver(0, 50), 600)).toEqual([]);
  });

  it("fires for a bidirectional camera on either drive direction", () => {
    const both = { ...camera, bidirectional: true };
    // The camera north of the driver fires northbound, a camera south of
    // the driver fires southbound — the corridor keeps each behind-the-back
    // pass silent no matter the facing.
    expect(computeAlerts([both], driver(0, 50), 600)).toHaveLength(1);
    // The camera south of the driver faces north (angle 0) — that is what
    // photographs a southbound driver.
    const south = {
      ...both,
      angle: 0,
      position: { lat: 53.6667, lng: 23.8133 },
    };
    expect(computeAlerts([south], driver(180, 50), 600)).toHaveLength(1);
    expect(computeAlerts([south], driver(0, 50), 600)).toEqual([]);
  });

  it("stays silent on a parallel street behind the corridor", () => {
    // ~80 m east of the road axis, northbound: inside the radius, off the road.
    const nearby = { ...camera, position: { lat: 53.6721, lng: 23.815 } };
    expect(computeAlerts([nearby], driver(0, 50), 600)).toEqual([]);
  });
});

describe("computeOverSpeed", () => {
  const alert = (distance: number, speedLimit: number, id = "cam-1") => ({
    kind: "camera" as const,
    id,
    distance,
    speedLimit,
    cameraType: "stationary" as const,
  });

  it("is none below the limit plus the 2 km/h allowance", () => {
    expect(computeOverSpeed([alert(300, 60)], 61)).toEqual({ kind: "none" });
    expect(computeOverSpeed([alert(300, 60)], 40)).toEqual({ kind: "none" });
    // At exactly limit + 2 the allowance is spent — the app warns.
    expect(computeOverSpeed([alert(300, 60)], 62)).toEqual({
      kind: "regular",
      speedLimit: 60,
    });
  });

  it("is regular over the limit beyond 150 m", () => {
    expect(computeOverSpeed([alert(300, 60)], 80)).toEqual({
      kind: "regular",
      speedLimit: 60,
    });
  });

  it("is double within 150 m", () => {
    expect(computeOverSpeed([alert(120, 60)], 80)).toEqual({
      kind: "double",
      cameraId: "cam-1",
      speedLimit: 60,
    });
  });

  it("picks the nearest camera", () => {
    // Both limits are exceeded at 95; the nearest camera's limit is what
    // the warning reads — 200 m at limit 90 beats 400 m at limit 60.
    expect(computeOverSpeed([alert(400, 60), alert(200, 90, "cam-2")], 95)).toEqual({
      kind: "regular",
      speedLimit: 90,
    });
  });
});

describe("isSameOverSpeed", () => {
  const none = { kind: "none" } as const;
  const regular = (speedLimit: number) => ({ kind: "regular", speedLimit }) as const;
  const double = (cameraId: string) =>
    ({ kind: "double", cameraId, speedLimit: 60 }) as const;

  it("is the same for a steady state, different across kinds", () => {
    expect(isSameOverSpeed(none, none)).toBe(true);
    expect(isSameOverSpeed(regular(60), regular(60))).toBe(true);
    expect(isSameOverSpeed(double("a"), double("a"))).toBe(true);
    // Regular → Double is the re-warn the app emits.
    expect(isSameOverSpeed(regular(60), double("a"))).toBe(false);
    expect(isSameOverSpeed(none, regular(60))).toBe(false);
  });

  it("tells apart what a kind names: the limit, the camera", () => {
    expect(isSameOverSpeed(regular(60), regular(90))).toBe(false);
    expect(isSameOverSpeed(double("a"), double("b"))).toBe(false);
  });
});
