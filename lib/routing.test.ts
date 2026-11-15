import { describe, expect, it } from "vitest";
import { markerSearch, parseMarkerParam } from "./routing";

describe("parseMarkerParam", () => {
  it("reads the marker id", () => {
    expect(parseMarkerParam("?marker=camera-1")).toBe("camera-1");
  });

  it("decodes an encoded id", () => {
    expect(parseMarkerParam(`?marker=${encodeURIComponent("дорога/1")}`)).toBe("дорога/1");
  });

  it("returns null without the param", () => {
    expect(parseMarkerParam("")).toBeNull();
    expect(parseMarkerParam("?other=1")).toBeNull();
  });
});

describe("markerSearch", () => {
  it("builds the param for an id", () => {
    expect(markerSearch("camera-1")).toBe("?marker=camera-1");
  });

  it("encodes unsafe characters", () => {
    expect(markerSearch("дорога/1")).toBe(`?marker=${encodeURIComponent("дорога/1")}`);
  });

  it("clears the param for null", () => {
    expect(markerSearch(null)).toBe("");
  });
});
