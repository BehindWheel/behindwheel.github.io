import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeOffset } from "./geo";
import { UserArrow } from "./userArrow";

// The arrow against a stubbed maplibre Marker, a bare-bones document and a
// manual frame clock: the test decides when a frame runs and what time it is.
const { markers } = vi.hoisted(() => ({
  markers: [] as {
    lngLat: [number, number];
    removed: boolean;
    setLngLat: (p: [number, number]) => unknown;
    addTo: () => unknown;
    remove: () => void;
  }[],
}));

vi.mock("maplibre-gl", () => ({
  Marker: class {
    lngLat: [number, number] = [0, 0];
    removed = false;
    constructor() {
      markers.push(this);
    }
    setLngLat(lngLat: [number, number]) {
      this.lngLat = lngLat;
      return this;
    }
    addTo() {
      return this;
    }
    remove() {
      this.removed = true;
    }
  },
}));

const start = { lat: 53.6694, lng: 23.8133 };
let now: number;
let frames: (() => void)[];
let styles: { transform: string }[];

describe("UserArrow", () => {
  beforeEach(() => {
    markers.length = 0;
    frames = [];
    styles = [];
    now = 0;
    vi.stubGlobal("document", {
      createElement: () => {
        const style = { transform: "" };
        styles.push(style);
        return { className: "", style, innerHTML: "", appendChild: () => {} };
      },
    });
    vi.stubGlobal("performance", { now: () => now });
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) => frames.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {
      frames = [];
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const runFrame = () => frames.shift()?.();

  it("creates the marker on the first fix and turns the arrow to the bearing", () => {
    const arrow = new UserArrow({} as never);
    arrow.update(start, 297.4, false);
    expect(markers).toHaveLength(1);
    expect(markers[0].lngLat).toEqual([start.lng, start.lat]);
    // styles[1] is the inner arrow span (the marker element was created first).
    expect(styles[1].transform).toBe("rotate(297deg)");
  });

  it("snaps to the fix when the driver stands still", () => {
    const arrow = new UserArrow({} as never);
    arrow.update(start, 0, false);
    const next = computeOffset(start, 50, 90);
    arrow.update(next, 0, false);
    expect(markers[0].lngLat).toEqual([next.lng, next.lat]);
    expect(frames).toHaveLength(0);
  });

  it("snaps over a cold-fix jump instead of flying", () => {
    const arrow = new UserArrow({} as never);
    arrow.update(start, 0, true);
    frames = [];
    const far = computeOffset(start, 5000, 90);
    arrow.update(far, 0, true);
    expect(markers[0].lngLat).toEqual([far.lng, far.lat]);
    expect(frames).toHaveLength(0);
  });

  it("glides between moving fixes over the animation window", () => {
    const arrow = new UserArrow({} as never);
    arrow.update(start, 0, true);
    frames = [];
    const next = computeOffset(start, 50, 90);
    arrow.update(next, 0, true);
    // Nothing moved yet: the glide starts from the old position.
    expect(markers[0].lngLat[0]).toBeCloseTo(start.lng, 6);

    now = 700; // half of the 1400 ms window
    runFrame();
    expect(markers[0].lngLat[0]).toBeCloseTo((start.lng + next.lng) / 2, 6);

    now = 1400;
    runFrame();
    expect(markers[0].lngLat[0]).toBeCloseTo(next.lng, 6);
    expect(frames).toHaveLength(0);
  });

  it("restarts the glide from the interpolated spot when a fix lands mid-glide", () => {
    const arrow = new UserArrow({} as never);
    arrow.update(start, 0, true);
    frames = [];
    const first = computeOffset(start, 60, 90);
    arrow.update(first, 0, true);
    now = 700;
    runFrame();
    const midway = markers[0].lngLat[0];

    const second = computeOffset(first, 60, 90);
    arrow.update(second, 0, true);
    // The new glide starts where the old one had got to — no backward jump.
    now = 700;
    runFrame();
    expect(markers[0].lngLat[0]).toBeCloseTo(midway, 6);
  });

  it("removes the marker and stops gliding", () => {
    const arrow = new UserArrow({} as never);
    arrow.update(start, 0, true);
    arrow.remove();
    expect(markers[0].removed).toBe(true);
    expect(frames).toHaveLength(0);
    // A later fix builds a fresh marker.
    arrow.update(start, 0, false);
    expect(markers).toHaveLength(2);
  });
});
