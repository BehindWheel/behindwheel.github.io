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

function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  return crypto.subtle.digest("SHA-256", bytes).then((digest) =>
    Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
      "",
    ),
  );
}

type Feature = { name: string; items: unknown[] };

// A stubbed fetch serving a manifest plus feature bodies whose checksums are
// real — loadCdnData must verify them with the actual crypto.subtle.
async function stubCdn(features: Feature[], overrides: Record<string, string> = {}) {
  const bodies = new Map<string, string>();
  for (const feature of features) {
    const body = JSON.stringify({ items: feature.items });
    bodies.set(`/${feature.name}.json`, body);
  }
  const entries: CdnManifest["features"] = {};
  for (const feature of features) {
    entries[feature.name] = {
      version: 1,
      url: `/${feature.name}.json`,
      sha256:
        overrides[feature.name] ??
        (await sha256Hex(
          new TextEncoder().encode(bodies.get(`/${feature.name}.json`)!).buffer as ArrayBuffer,
        )),
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
  it("loads and verifies the three feature files", async () => {
    await stubCdn([
      { name: "stationary", items: [{ id: "s1", region: "grodno" }] },
      { name: "medium-speed", items: [] },
      { name: "repairs", items: [] },
    ]);
    const data = await loadCdnData();
    expect(data.generatedAt).toBe("2026-11-15T17:00:21Z");
    expect(data.stationary).toHaveLength(1);
    expect(data.mediumSpeed).toEqual([]);
    expect(data.repairs).toEqual([]);
    vi.unstubAllGlobals();
  });

  it("rejects a body whose checksum does not match", async () => {
    await stubCdn(
      [
        { name: "stationary", items: [] },
        { name: "medium-speed", items: [] },
        { name: "repairs", items: [] },
      ],
      { repairs: "0".repeat(64) },
    );
    await expect(loadCdnData()).rejects.toThrow("контрольная сумма не совпала");
    vi.unstubAllGlobals();
  });

  it("reports a missing manifest feature", async () => {
    await stubCdn([
      { name: "stationary", items: [] },
      { name: "medium-speed", items: [] },
      // "repairs" never lands in the manifest
    ]);
    await expect(loadCdnData()).rejects.toThrow('feature "repairs" is missing');
    vi.unstubAllGlobals();
  });
});
