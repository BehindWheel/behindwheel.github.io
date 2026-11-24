import { describe, expect, it } from "vitest";
import { locationFromFix } from "./fix";
import { computeOffset } from "./geo";
import type { DriveLocation } from "./engine";

const here = { lat: 53.6694, lng: 23.8133 };

const coords = (over: Partial<Parameters<typeof locationFromFix>[0]> = {}) => ({
  latitude: here.lat,
  longitude: here.lng,
  speed: 0 as number | null,
  heading: 0 as number | null,
  ...over,
});

const moving = (bearing: number): DriveLocation => ({
  latLng: here,
  bearing,
  speed: 50,
});

describe("locationFromFix", () => {
  it("converts m/s to whole km/h", () => {
    expect(locationFromFix(coords({ speed: 80 / 3.6 }), null).speed).toBe(80);
    expect(locationFromFix(coords({ speed: 13.9 }), null).speed).toBe(50);
  });

  it("reads a missing, zero or negative speed as standing still", () => {
    expect(locationFromFix(coords({ speed: null }), null).speed).toBe(0);
    expect(locationFromFix(coords({ speed: 0 }), null).speed).toBe(0);
    expect(locationFromFix(coords({ speed: -1 }), null).speed).toBe(0);
    expect(locationFromFix(coords({ speed: NaN }), null).speed).toBe(0);
  });

  it("carries the position through", () => {
    expect(locationFromFix(coords(), null).latLng).toEqual(here);
  });

  it("takes the browser's heading when it reports one", () => {
    expect(locationFromFix(coords({ heading: 297 }), moving(10)).bearing).toBe(297);
    // Zero is a real heading (north), not a missing one.
    expect(locationFromFix(coords({ heading: 0 }), moving(10)).bearing).toBe(0);
  });

  it("falls back to the course over ground from the previous fix", () => {
    // 100 m due east of the previous fix: the course is ~90°.
    const east = computeOffset(here, 100, 90);
    const fix = locationFromFix(
      coords({ latitude: east.lat, longitude: east.lng, heading: null }),
      moving(10),
    );
    expect(fix.bearing).toBeCloseTo(90, 0);
    // NaN heading (some platforms) reads the same as null.
    const nan = locationFromFix(
      coords({ latitude: east.lat, longitude: east.lng, heading: NaN }),
      moving(10),
    );
    expect(nan.bearing).toBeCloseTo(90, 0);
  });

  it("normalises a westward course into [0, 360)", () => {
    const west = computeOffset(here, 100, 270);
    const fix = locationFromFix(
      coords({ latitude: west.lat, longitude: west.lng, heading: null }),
      moving(10),
    );
    expect(fix.bearing).toBeCloseTo(270, 0);
  });

  it("holds the previous bearing against sub-10 m jitter", () => {
    const jitter = computeOffset(here, 5, 180);
    const fix = locationFromFix(
      coords({ latitude: jitter.lat, longitude: jitter.lng, heading: null }),
      moving(42),
    );
    expect(fix.bearing).toBe(42);
  });

  it("has no course without a moving previous fix", () => {
    const east = computeOffset(here, 100, 90);
    const away = coords({ latitude: east.lat, longitude: east.lng, heading: null });
    expect(locationFromFix(away, null).bearing).toBe(0);
    expect(locationFromFix(away, { ...moving(42), speed: 0 }).bearing).toBe(0);
  });
});
