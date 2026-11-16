import { describe, expect, it } from "vitest";
import { searchObjects } from "./search";
import type { CdnData } from "./cdn";

const data: CdnData = {
  generatedAt: "2026-11-15T17:00:21Z",
  stationary: [
    { id: "s1", name: "Советская, 35" },
    { id: "s2", name: "пр. Космонавтов, 80" },
  ],
  mediumSpeed: [{ id: "m1", name: "М6 Минск — Гродно" }],
  repairs: [{ id: "r1", road: "ул. Победы", type: "point" }],
  traffic: [{ id: "t1", name: "МКАД, 16 км" }],
} as CdnData;

describe("searchObjects", () => {
  it("matches a camera by name", () => {
    expect(searchObjects(data, "Советская")).toEqual([
      { kind: "stationary", id: "s1", label: "Советская, 35" },
    ]);
  });

  it("matches a repair by road", () => {
    expect(searchObjects(data, "Победы")).toEqual([
      { kind: "repairs", id: "r1", label: "ул. Победы" },
    ]);
  });

  it("matches a traffic sensor by name", () => {
    expect(searchObjects(data, "МКАД")).toEqual([
      { kind: "traffic", id: "t1", label: "МКАД, 16 км" },
    ]);
  });

  it("is case-insensitive in both directions", () => {
    expect(searchObjects(data, "м6 минск")).toHaveLength(1);
    expect(searchObjects(data, "СОВЕТСКАЯ")).toHaveLength(1);
  });

  it("ignores an empty or blank query", () => {
    expect(searchObjects(data, "")).toEqual([]);
    expect(searchObjects(data, "   ")).toEqual([]);
  });

  it("returns nothing for a miss", () => {
    expect(searchObjects(data, "Гродно-30")).toEqual([]);
  });

  it("truncates to the limit", () => {
    const many = {
      ...data,
      stationary: Array.from({ length: 12 }, (_, i) => ({
        id: `s${i}`,
        name: `Одна и та же улица ${i}`,
      })),
    } as unknown as CdnData;
    expect(searchObjects(many, "улица")).toHaveLength(8);
  });
});
