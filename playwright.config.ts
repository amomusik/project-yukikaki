import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

/**
 * E2E runs against a production build (`next build && next start`, see e2e/serve-prod.sh) on its
 * own port (E2E_PORT, default 3200), never the shared dev server: on-demand dev compiles, HMR from
 * concurrent edits and an overloaded dev process made navigations abort (ERR_ABORTED) and DB calls
 * fail mid-test. The build runs from a synced snapshot of the repo outside the tree, so a
 * `pnpm dev` on 3100 can keep running (and, without DATABASE_URL, the snapshot gets its own PGlite).
 * Set E2E_BASE_URL to test an already-running server instead (no server is started then).
 */
const port = Number(process.env.E2E_PORT ?? 3200);
const external = process.env.E2E_BASE_URL;
const baseURL = external ?? `http://127.0.0.1:${port}`;

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
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: external
    ? undefined
    : {
        command: `bash e2e/serve-prod.sh ${port}`,
        url: `${baseURL}/ja`,
        reuseExistingServer: false,
        timeout: 600_000, // includes `next build`
        stdout: "pipe",
      },
});
