import { defineConfig } from "vitest/config";

// The lib/ helpers are pure node-side code: no DOM, no maplibre — the node
// environment keeps the tests fast and honest.
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
