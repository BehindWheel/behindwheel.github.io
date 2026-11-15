import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // the minified maplibre worker, copied into public/ by the prebuild script
    // (scripts/copy-maplibre-worker.mjs)
    "public/maplibre-gl-worker.mjs",
    // the hand-written offline shell: browser-only globals (caches,
    // clients) the app-target eslint config would flag
    "public/sw.js",
  ]),
]);

export default eslintConfig;
