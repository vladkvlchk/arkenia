import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // tsconfigPaths teaches Vitest the "@/..." alias from tsconfig.json,
  // so tests import modules exactly the way the app does.
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // Colocated with the code they cover: number-input.tsx / number-input.test.tsx.
    // A test you can see in the same folder is a test you remember to update.
    include: ["src/**/*.test.{ts,tsx}"],
    // The app renders dates and money — pin the environment so a test that
    // passes in Kyiv also passes in CI. Determinism is not optional.
    env: { TZ: "UTC" },
  },
});
