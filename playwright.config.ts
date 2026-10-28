import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3100);
const databaseUrl = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? "postgres://openats:openats@localhost:5432/openats_e2e";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    locale: "fr-FR",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `node scripts/e2e-reset.mjs && npx next start -p ${port}`,
    url: `http://localhost:${port}/api/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: databaseUrl,
      APP_URL: `http://localhost:${port}`,
      AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-secret-not-used-anywhere-else",
      DATA_DIR: process.env.DATA_DIR ?? "./data-e2e",
      SEED_DEMO: "false",
      RETENTION_JOB: "false",
    },
  },
});
