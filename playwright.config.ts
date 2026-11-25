import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

/**
 * E2E runs against `pnpm dev` (port from E2E_PORT, default 3100 so it never
 * collides with other local tools on 3000). With the local PGlite database,
 * stop any other dev server first — PGlite allows one process at a time.
 */
const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 240_000, // live Dify review + remote Neon make the brief step slower than local mode
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: `pnpm dev --port ${port}`,
    url: `${baseURL}/ja`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
