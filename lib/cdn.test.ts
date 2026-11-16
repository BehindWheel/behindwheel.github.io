import { describe, expect, it, vi } from "vitest";
import { loadCdnData, regionName, REGIONS, type CdnManifest } from "./cdn";

describe("regionName", () => {
  it("reads the CDN slugs as oblast names", () => {
    expect(regionName("grodno")).toBe("Гродненская");
    expect(regionName("mogilev")).toBe("Могилёвская");
  });

  it("passes an unknown slug through", () => {
    expect(regionName("nowhere")).toBe("nowhere");
  });
});

describe("REGIONS", () => {
  it("carries every slug regionName knows", () => {
    for (const { slug, name } of REGIONS) {
      expect(regionName(slug)).toBe(name);
    }
  });
});

type Feature = { name: string; items: unknown[] };

// A stubbed fetch serving a manifest plus the three feature files.
async function stubCdn(features: Feature[]) {
  const bodies = new Map<string, string>();
  for (const feature of features) {
    bodies.set(`/${feature.name}.json`, JSON.stringify({ items: feature.items }));
  }
  const entries: CdnManifest["features"] = {};
  for (const feature of features) {
    entries[feature.name] = {
      version: 1,
      url: `/${feature.name}.json`,
      // The sha256 rides the envelope unchanged — it's the publisher's own
      // change-detection key, not a served-bytes checksum (cdn.md).
      sha256: "0".repeat(64),
      size: 0,
      count: feature.items.length,
    };
  }
  const manifest: CdnManifest = {
    schema: 1,
    generatedAt: "2026-11-15T17:00:21Z",
    features: entries,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      const path = new URL(url).pathname;
      const body = path === "/manifest.json" ? JSON.stringify(manifest) : bodies.get(path);
      if (body === undefined) {
        return new Response("nope", { status: 404 });
      }
      return new Response(body, { status: 200 });
    }),
  );
}

describe("loadCdnData", () => {
  it("loads the four feature files", async () => {
    await stubCdn([
      { name: "stationary", items: [{ id: "s1", region: "grodno" }] },
      { name: "medium-speed", items: [] },
      { name: "repairs", items: [] },
      { name: "traffic", items: [{ id: "t1", region: "minsk" }] },
    ]);
    const data = await loadCdnData();
    expect(data.generatedAt).toBe("2026-11-15T17:00:21Z");
    expect(data.stationary).toHaveLength(1);
    expect(data.mediumSpeed).toEqual([]);
    expect(data.repairs).toEqual([]);
    expect(data.traffic).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it("leaves a feature the manifest doesn't carry empty", async () => {
    await stubCdn([
      { name: "stationary", items: [{ id: "s1" }] },
      { name: "medium-speed", items: [] },
      { name: "traffic", items: [] },
      // "repairs" never lands in the manifest — the publisher hasn't shipped
      // it yet, so the map shows the layers it does have.
    ]);
    const data = await loadCdnData();
    expect(data.stationary).toHaveLength(1);
    expect(data.repairs).toEqual([]);
    vi.unstubAllGlobals();
  });
});
