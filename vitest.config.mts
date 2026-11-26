import { defineConfig } from "vitest/config";

/**
 * Three named suites (`pnpm test` runs all of them):
 *   unit         pure functions, no database          → pnpm test:unit
 *   contract     zod schemas vs recorded API fixtures  → pnpm test:contract
 *   integration  DB-backed on in-memory PGlite         → pnpm test:integration
 * Existing top-level files are classified by name below; new tests go in tests/unit/,
 * tests/contract/ or tests/integration/. Any unlisted top-level file runs as integration.
 */
const UNIT = [
  "tests/unit/**/*.test.ts",
  "tests/status.test.ts",
  "tests/city-profiles.test.ts",
  "tests/uuid.test.ts",
  "tests/graph-sync.test.ts",
  "tests/grounding.test.ts",
];
const CONTRACT = ["tests/contract/**/*.test.ts", "tests/dify.test.ts"];

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    testTimeout: 20_000,
    // Booting + migrating an in-memory Postgres per file can take >60s when three projects run in parallel on a busy machine.
    hookTimeout: 120_000,
    coverage: {
      provider: "v8",
      // No HTML reporter: it writes JS files under coverage/ that eslint would then lint.
      reporter: ["text-summary", "json-summary", "lcovonly"],
      reportsDirectory: "coverage",
      include: ["lib/**/*.ts"],
      // Network adapters for partner APIs are exercised by contract fixtures + live smoke/evals, not unit coverage.
      exclude: ["lib/integrations/**", "lib/graph/client.ts", "lib/db/pglite.ts"],
    },
    projects: [
      {
        extends: true,
        test: { name: "unit", include: UNIT, setupFiles: ["tests/setup-env.ts"] },
      },
      {
        extends: true,
        test: { name: "contract", include: CONTRACT, setupFiles: ["tests/setup-env.ts"] },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/**/*.test.ts"],
          exclude: [...UNIT, ...CONTRACT, "**/node_modules/**"],
          setupFiles: ["tests/setup.ts"],
        },
      },
    ],
  },
});
