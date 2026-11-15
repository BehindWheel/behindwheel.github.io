import { describe, expect, it } from "vitest";
import { loadToggles, saveToggles } from "./layerToggles";
import type { LayerToggles } from "./map/marker-tiers";

class MemStorage {
  private map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

describe("loadToggles", () => {
  it("defaults to everything on without a stored choice", () => {
    expect(loadToggles(new MemStorage() as unknown as Storage)).toEqual({
      stationary: true,
      mediumSpeed: true,
      repairs: true,
    });
  });

  it("restores a saved choice", () => {
    const storage = new MemStorage();
    storage.setItem(
      "layer-toggles",
      JSON.stringify({ stationary: true, mediumSpeed: false, repairs: false }),
    );
    expect(loadToggles(storage as unknown as Storage)).toEqual({
      stationary: true,
      mediumSpeed: false,
      repairs: false,
    });
  });

  it("fills missing fields from a partial record", () => {
    const storage = new MemStorage();
    storage.setItem("layer-toggles", JSON.stringify({ repairs: false }));
    const toggles = loadToggles(storage as unknown as Storage);
    expect(toggles.repairs).toBe(false);
    expect(toggles.stationary).toBe(true);
  });

  it("falls back to defaults on malformed JSON", () => {
    const storage = new MemStorage();
    storage.setItem("layer-toggles", "{not json");
    expect(loadToggles(storage as unknown as Storage)).toEqual({
      stationary: true,
      mediumSpeed: true,
      repairs: true,
    });
  });
});

describe("saveToggles", () => {
  it("writes the record loadToggles reads back", () => {
    const storage = new MemStorage();
    const toggles: LayerToggles = {
      stationary: false,
      mediumSpeed: true,
      repairs: false,
    };
    saveToggles(storage as unknown as Storage, toggles);
    expect(loadToggles(storage as unknown as Storage)).toEqual(toggles);
  });
});
