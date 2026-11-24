import { beforeEach, describe, expect, it, vi } from "vitest";
import { DriveSession, type DriveState } from "./driveSession";
import { GPS_ERROR_INSECURE } from "./messages";

// The drive session against a stubbed maplibre and browser: a fake GPS feed
// drives a real approach to a camera and the test asserts the full chain —
// the marker, the camera-follow, the alert state and the phrase queue.
const { markerInstances, audioLog, easeCalls } = vi.hoisted(() => ({
  markerInstances: [] as {
    lngLat: [number, number];
    setLngLat: (p: [number, number]) => unknown;
    addTo: () => unknown;
    remove: () => void;
  }[],
  audioLog: [] as string[],
  easeCalls: [] as Record<string, unknown>[],
}));

vi.mock("maplibre-gl", () => ({
  Marker: class {
    element = document.createElement("div");
    lngLat: [number, number] = [0, 0];
    constructor() {
      markerInstances.push(this);
    }
    setLngLat(lngLat: [number, number]) {
      this.lngLat = lngLat;
      return this;
    }
    addTo() {
      return this;
    }
    remove() {}
  },
}));

// The sound stub records every phrase the queue constructs, in order; play
// simulates completion so the queue advances to the next phrase.
class FakeAudio {
  private listeners: Record<string, (() => void)[]> = {};
  constructor(src: string) {
    audioLog.push(src);
  }
  addEventListener(name: string, cb: () => void) {
    (this.listeners[name] = this.listeners[name] || []).push(cb);
  }
  play() {
    setTimeout(() => (this.listeners.ended || []).forEach((cb) => cb()), 5);
    return Promise.resolve();
  }
  pause() {}
  set volume(_: number) {}
  get volume() {
    return 1;
  }
}

const fakeMap = {
  getZoom: () => 14,
  easeTo: (opts: Record<string, unknown>) => {
    easeCalls.push(opts);
  },
};

// Approach the camera from 650 m to 30 m at 80 km/h, one fix per 30 m step.
function approachFixes(toLat: number, toLng: number, bearing: number) {
  const rad = (d: number) => (d * Math.PI) / 180;
  let toGo = 650;
  return (): GeolocationPosition => {
    toGo = Math.max(toGo - 30, 30);
    return {
      coords: {
        latitude: toLat + (Math.cos(rad(bearing + 180)) * toGo) / 111320,
        longitude:
          toLng + (Math.sin(rad(bearing + 180)) * toGo) / (111320 * Math.cos(rad(toLat))),
        heading: bearing,
        speed: 80 / 3.6,
        accuracy: 5,
        altitude: null,
        altitudeAccuracy: null,
      },
      timestamp: Date.now(),
    } as GeolocationPosition;
  };
}

describe("DriveSession", () => {
  let watchCb: ((p: GeolocationPosition) => void) | null = null;
  let errorCb: ((e: GeolocationPositionError) => void) | null = null;

  beforeEach(() => {
    // The marker element builder needs just enough DOM for the arrow markup.
    vi.stubGlobal("document", {
      createElement: () => ({
        className: "",
        style: {},
        innerHTML: "",
        tabIndex: 0,
        dataset: {},
        appendChild: () => {},
        setAttribute: () => {},
      }),
    });
    vi.stubGlobal("Audio", FakeAudio as unknown as typeof Audio);
    vi.stubGlobal("navigator", {
      geolocation: {
        watchPosition: (
          ok: (p: GeolocationPosition) => void,
          fail: (e: GeolocationPositionError) => void,
        ) => {
          watchCb = ok;
          errorCb = fail;
          return 1;
        },
        clearWatch: () => {
          watchCb = null;
          errorCb = null;
        },
      },
    });
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) => setTimeout(cb, 8));
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
    audioLog.length = 0;
    easeCalls.length = 0;
    markerInstances.length = 0;
  });

  // The stubs survive the file: the marker glide's rAF chain may still tick
  // a frame or two after a test ends, and a stray tick must not hit a
  // missing global. Vitest gives every file its own worker, so nothing
  // leaks across files.

  it("drives the full chain: marker, camera follow, alert state and voice", async () => {
    const camera = {
      id: "cam-1",
      position: { lat: 53.647197, lng: 23.810971 },
      angle: 117,
      bidirectional: true,
      speedLimit: 60,
    };
    const states: DriveState[] = [];
    const session = new DriveSession(
      fakeMap as never,
      {
        stationary: [
          {
            id: camera.id,
            name: "test",
            point: camera.position,
            angle: camera.angle,
            bidirectional: camera.bidirectional,
            updateTime: "",
            speedCar: camera.speedLimit,
            speedTruck: camera.speedLimit,
            region: "grodno",
          },
        ],
        mediumSpeed: [],
        repairs: [],
      } as never,
      (state) => states.push(state),
    );

    session.start();
    expect(watchCb).toBeTypeOf("function");

    // The camera faces 117°, so the fire bearing is 297° — approach on it.
    const nextFix = approachFixes(camera.position.lat, camera.position.lng, 297);
    for (let i = 0; i < 22; i++) {
      watchCb!(nextFix());
      await new Promise((r) => setTimeout(r, 10));
    }

    // The driving state before stop: the near alert and the over-speed face.
    // The last fix sits 30 m from the camera — inside the 150 m "double"
    // window, so the face shows the double warning, not the regular one.
    const last = states[states.length - 1];
    expect(last.alerts).toHaveLength(1);
    expect(last.alerts[0]).toMatchObject({
      kind: "camera",
      id: "cam-1",
      speedLimit: 60,
      cameraType: "stationary",
    });
    expect(last.overSpeed).toEqual({
      kind: "double",
      cameraId: "cam-1",
      speedLimit: 60,
    });

    // Stop first: the marker glide lags the fixes by design (it animates at
    // 1400 ms per fix while the test pumps fixes every 10 ms), and stop
    // kills the rAF chain before the assertions run.
    session.stop();
    await new Promise((r) => setTimeout(r, 20));
    expect(watchCb).toBeNull();

    // The marker rides the fixes toward the camera.
    expect(markerInstances).toHaveLength(1);
    expect(markerInstances[0].lngLat[0]).toBeCloseTo(camera.position.lng, 2);
    expect(markerInstances[0].lngLat[1]).toBeCloseTo(camera.position.lat, 2);

    // The camera follows toward the driver.
    expect(easeCalls.length).toBeGreaterThan(0);
    expect(easeCalls[easeCalls.length - 1].zoom).toBeCloseTo(14.3, 1);

    // The voice queue: camera phrase, then the limit phrase, then the
    // over-speed one — and the tracker keeps the repeats silent.
    expect(audioLog).toEqual([
      "/audio/stationary_camera.mp3",
      "/audio/limit_60.mp3",
      "/audio/sound_over_speed.mp3",
    ]);
  });

  it("names the GPS failure and clears it with the first good fix", async () => {
    const states: DriveState[] = [];
    const session = new DriveSession(
      fakeMap as never,
      { stationary: [], mediumSpeed: [], repairs: [] } as never,
      (state) => states.push(state),
    );
    session.start();

    // A denied permission reads as a human message, not as silence.
    errorCb!({ code: 1, message: "user denied", PERMISSION_DENIED: 1 } as GeolocationPositionError);
    expect(states[states.length - 1].gpsError).toContain("Нет доступа к геолокации");

    // The first good fix clears it and drives the state again.
    watchCb!({
      coords: {
        latitude: 53.647197,
        longitude: 23.810971,
        heading: 0,
        speed: 0,
        accuracy: 5,
        altitude: null,
        altitudeAccuracy: null,
      },
      timestamp: Date.now(),
    } as GeolocationPosition);
    expect(states[states.length - 1].gpsError).toBeNull();

    session.stop();
    await new Promise((r) => setTimeout(r, 10));
  });

  it("explains an insecure origin and starts no GPS watch", () => {
    vi.stubGlobal("window", { isSecureContext: false });
    const states: DriveState[] = [];
    const session = new DriveSession(
      fakeMap as never,
      { stationary: [], mediumSpeed: [], repairs: [] } as never,
      (state) => states.push(state),
    );
    session.start();

    // The browser would answer a watch here with PERMISSION_DENIED; the
    // session never asks, so the insecure explanation is the one that stays.
    expect(watchCb).toBeNull();
    expect(states[states.length - 1].gpsError).toBe(GPS_ERROR_INSECURE);

    session.stop();
    // Only the window stub goes: the other globals stay for stray rAF ticks.
    vi.stubGlobal("window", undefined);
  });
});
