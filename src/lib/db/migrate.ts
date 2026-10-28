import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { env } from "@/lib/env";

// Arbitrary constant shared by every instance of the app.
const MIGRATION_LOCK = 724_310_001;

/**
 * Applies pending migrations on a dedicated connection holding a session advisory lock,
 * so several instances starting together run them once.
 */
export async function runMigrations(
  migrationsFolder = path.join(process.cwd(), "drizzle"),
  databaseUrl = env().DATABASE_URL,
) {
  const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await client`select pg_advisory_lock(${MIGRATION_LOCK})`;
    await migrate(drizzle(client), { migrationsFolder });
    await client`select pg_advisory_unlock(${MIGRATION_LOCK})`;
  } finally {
    await client.end({ timeout: 5 });
  }
}
