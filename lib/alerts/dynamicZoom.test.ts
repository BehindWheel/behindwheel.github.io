import { describe, expect, it } from "vitest";
import { DynamicZoom } from "./dynamicZoom";

// The app's DynamicZoomCalculator behavior: fast = zoomed out, stopped =
// zoomed in, the middle band holds to keep the map from breathing with GPS
// speed jitter.
describe("DynamicZoom", () => {
  it("zooms fully in at and below 15 km/h", () => {
    const zoom = new DynamicZoom();
    expect(zoom.calculate(0)).toBe(16.1);
    expect(zoom.calculate(15)).toBe(16.1);
  });

  it("holds the last zoom in the 15..25 km/h hysteresis band", () => {
    const zoom = new DynamicZoom();
    const fast = zoom.calculate(100);
    // Back under the rise threshold: the hold keeps the fast zoom.
    expect(zoom.calculate(20)).toBe(fast);
    expect(zoom.calculate(15)).toBe(16.1);
  });

  it("eases from 16.1 to 13 between 25 and 140 km/h", () => {
    const zoom = new DynamicZoom();
    expect(zoom.calculate(25)).toBe(16.1);
    expect(zoom.calculate(140)).toBe(13);
    // The one-decimal rounding of the app's calculator.
    expect(zoom.calculate(90)).toBe(14.1);
  });

  it("clamps speeds beyond 140", () => {
    const zoom = new DynamicZoom();
    expect(zoom.calculate(180)).toBe(13);
  });
});
