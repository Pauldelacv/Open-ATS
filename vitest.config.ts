import path from "node:path";
import { defineConfig } from "vitest/config";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://openats:openats@localhost:5432/openats_test";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    // Integration tests share one database: run files one after the other.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: databaseUrl,
      APP_URL: "http://localhost:3999",
      AUTH_SECRET: "test-secret-not-used-elsewhere",
      DATA_DIR: path.resolve(__dirname, "node_modules/.cache/open-ats-test"),
      APP_TIMEZONE: "Europe/Paris",
    },
  },
});
