// maplibre-gl v6 spawns its worker from a URL that turbopack resolves to a
// virtual /_next/static/media/maplibre-gl-worker.mjs?v=… — a URL that never
// exists on disk (the emitted file is content-hashed). The worker 404s and
// the map hangs silently before its first render. This script copies the
// installed version's worker into public/ so createMap.ts can point
// setWorkerUrl at a real, version-matched file.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const workerPath = require.resolve("maplibre-gl/dist/maplibre-gl-worker.mjs");

mkdirSync("public", { recursive: true });
copyFileSync(workerPath, "public/maplibre-gl-worker.mjs");
console.log(`copied ${workerPath} -> public/maplibre-gl-worker.mjs`);
