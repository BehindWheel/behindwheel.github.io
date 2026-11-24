import { defineConfig } from "@playwright/test";

// The e2e suite drives the production export (out/) — the same files GitHub
// Pages ships — through Playwright's own Chromium. `npm run build` must run
// first; the webServer below serves whatever is in out/.
export default defineConfig({
  testDir: "e2e",
  use: {
    // 127.0.0.1, the address serve-out binds: a secure context like
    // localhost, without an IPv6-first lookup missing the server.
    baseURL: "http://127.0.0.1:3111",
    viewport: { width: 1280, height: 720 },
    // E2E_VIDEO=1 keeps a recording of the run in test-results/ — a handy
    // artifact for reviewing the drive demo without a headed window.
    video: process.env.E2E_VIDEO ? "on" : "off",
  },
  webServer: {
    command: "node scripts/serve-out.mjs 3111",
    port: 3111,
    // A server left over from an earlier run keeps serving the out/ it was
    // started with; reuse is for local iteration only, CI always starts fresh.
    reuseExistingServer: !process.env.CI,
  },
});
