// The CDN collections reduced to what the alert engine reads. The mobile app
// warns on cameras and user reports; the CDN carries no reports, so the web
// drive mode warns on cameras only — stationary ones directly, medium-speed
// sections through their two end cameras, matching the ends the map's signs
// sit on.

import type { MediumSpeedCamera, StationaryCamera } from "../cdn";
import type { AlertableCamera } from "./engine";

export function stationaryCameraEvents(
  cameras: StationaryCamera[],
): AlertableCamera[] {
  return cameras
    .filter((camera) => camera.point)
    .map((camera) => ({
      id: camera.id,
      position: camera.point,
      angle: camera.angle,
      bidirectional: camera.bidirectional,
      speedLimit: camera.speedCar,
      cameraType: "stationary" as const,
    }));
}

// One section contributes its ends: the sign at each end is where the driver
// enters and leaves the measured stretch, and angleStart/angleEnd are the
// travel directions there. Both ends share the section id — the played-alert
// dedup then keeps the section silent for five minutes after its first
// warning, whichever end fired.
export function mediumSpeedCameraEvents(
  cameras: MediumSpeedCamera[],
): AlertableCamera[] {
  return cameras.flatMap((camera) => {
    if (camera.points.length === 0) {
      return [];
    }
    const ends =
      camera.points.length > 1
        ? [
            { point: camera.points[0], angle: camera.angleStart },
            { point: camera.points[camera.points.length - 1], angle: camera.angleEnd },
          ]
        : [{ point: camera.points[0], angle: camera.angleStart }];
    return ends.map(({ point, angle }) => ({
      id: camera.id,
      position: point,
      angle,
      bidirectional: camera.bidirectional,
      speedLimit: camera.speedCar,
      cameraType: "mediumSpeed" as const,
    }));
  });
}

export function alertableCameras(data: {
  stationary: StationaryCamera[];
  mediumSpeed: MediumSpeedCamera[];
}): AlertableCamera[] {
  return [...stationaryCameraEvents(data.stationary), ...mediumSpeedCameraEvents(data.mediumSpeed)];
}
