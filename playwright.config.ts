import { defineConfig } from "@playwright/test";

// The e2e suite drives the production export (out/) — the same files GitHub
// Pages ships — through Playwright's own Chromium. `npm run build` must run
// first; the webServer below serves whatever is in out/.
export default defineConfig({
  testDir: "e2e",
  use: {
    baseURL: "http://localhost:3111",
    viewport: { width: 1280, height: 720 },
    // E2E_VIDEO=1 keeps a recording of the run in test-results/ — a handy
    // artifact for reviewing the drive demo without a headed window.
    video: process.env.E2E_VIDEO ? "on" : "off",
  },
  webServer: {
    command: "node scripts/serve-out.mjs 3111",
    port: 3111,
    reuseExistingServer: true,
  },
});
