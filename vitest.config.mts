import { defineConfig } from "vitest/config";


export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 20_000,
    // Booting an in-memory Postgres per file can take >10s on a busy machine.
    hookTimeout: 60_000,
  },
});
