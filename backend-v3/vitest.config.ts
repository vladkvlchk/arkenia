import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // PGlite instances boot per-suite; give integration suites headroom.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
