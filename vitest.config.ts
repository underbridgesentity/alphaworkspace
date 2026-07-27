import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Every createTestDb() boots a fresh PGlite and replays all 12 checked-in
    // migrations, which measures at ~40s on a loaded laptop and only gets
    // slower as migrations accumulate. 30s made whichever test happened to be
    // scheduled first fail as a timeout, with nothing wrong with the assertion.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/mocks/server-only.ts"),
    },
  },
});
