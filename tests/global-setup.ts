import path from "node:path";
import { rm } from "node:fs/promises";
import postgres from "postgres";
import { runMigrations } from "../src/lib/db/migrate";

/** Fresh schema for every test run. */
export default async function setup() {
  const url =
    process.env.TEST_DATABASE_URL ?? "postgres://openats:openats@localhost:5432/openats_test";
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await sql`drop schema if exists public cascade`;
  await sql`drop schema if exists drizzle cascade`;
  await sql`create schema public`;
  await sql.end();
  await runMigrations(path.resolve(__dirname, "../drizzle"), url);
  await rm(path.resolve(__dirname, "../node_modules/.cache/open-ats-test"), {
    recursive: true,
    force: true,
  });
}
