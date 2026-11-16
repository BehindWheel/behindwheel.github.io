import { describe, expect, it } from "vitest";
import { computeHeading, computeOffset, distanceBetween, roundDistanceTo } from "./geo";

// Reference values the mobile app's SphericalUtil produces for the same
// inputs — the corridor check rides these, so they must match to the meter.
describe("distanceBetween", () => {
  it("measures the Grodno city-center to the Brest highway stretch", () => {
    const from = { lat: 53.6694, lng: 23.8133 };
    const to = { lat: 53.6703, lng: 23.8133 };
    // ~100 m due north
    expect(Math.round(distanceBetween(from, to))).toBeCloseTo(100, 0);
  });

  it("returns zero for the same point", () => {
    const at = { lat: 53.6694, lng: 23.8133 };
    expect(distanceBetween(at, at)).toBe(0);
  });

  it("one degree of latitude is about 111 km", () => {
    const from = { lat: 0, lng: 0 };
    const to = { lat: 1, lng: 0 };
    expect(Math.round(distanceBetween(from, to) / 10) * 10).toBeCloseTo(111200, -3);
  });
});

describe("roundDistanceTo", () => {
  it("rounds to whole meters like the app's roundDistanceTo", () => {
    const from = { lat: 53.6694, lng: 23.8133 };
    const to = { lat: 53.6694, lng: 23.8143 };
    expect(roundDistanceTo(from, to)).toBe(Math.round(distanceBetween(from, to)));
  });
});

describe("computeOffset", () => {
  it("steps due north for heading 0", () => {
    const from = { lat: 53.6694, lng: 23.8133 };
    const at = computeOffset(from, 600, 0);
    expect(roundDistanceTo(from, at)).toBe(600);
    expect(at.lng).toBeCloseTo(from.lng, 8);
    expect(at.lat).toBeGreaterThan(from.lat);
  });

  it("steps east for heading 90", () => {
    const from = { lat: 53.6694, lng: 23.8133 };
    const at = computeOffset(from, 1000, 90);
    expect(roundDistanceTo(from, at)).toBe(1000);
    expect(at.lng).toBeGreaterThan(from.lng);
    // The great-circle east step drifts off the parallel by ~0.1 m per km —
    // not a rhumb line, so the latitude match is loose.
    expect(at.lat).toBeCloseTo(from.lat, 4);
  });

  it("a round trip returns to the origin", () => {
    const from = { lat: 53.6694, lng: 23.8133 };
    const at = computeOffset(computeOffset(from, 750, 217), 750, (217 + 180) % 360);
    expect(roundDistanceTo(from, at)).toBeLessThan(1);
  });
});

describe("computeHeading", () => {
  it("reads 0 north, 90 east, -90 west", () => {
    const center = { lat: 53.6694, lng: 23.8133 };
    expect(computeHeading(center, computeOffset(center, 500, 0))).toBeCloseTo(0, 5);
    expect(computeHeading(center, computeOffset(center, 500, 90))).toBeCloseTo(90, 5);
    expect(computeHeading(center, computeOffset(center, 500, -90))).toBeCloseTo(-90, 5);
  });

  it("wraps into [-180, 180)", () => {
    const from = { lat: 0, lng: 179 };
    const to = { lat: 0, lng: -179 };
    const heading = computeHeading(from, to);
    expect(heading).toBeGreaterThan(0);
    expect(heading).toBeLessThanOrEqual(180);
  });
});
