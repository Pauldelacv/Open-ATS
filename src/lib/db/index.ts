import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  __openAtsSql?: postgres.Sql;
  __openAtsDb?: Database;
};

function create(): Database {
  const sql = postgres(env().DATABASE_URL, {
    max: env().NODE_ENV === "test" ? 4 : 10,
    onnotice: () => {},
  });
  globalForDb.__openAtsSql = sql;
  return drizzle(sql, { schema, casing: "snake_case" });
}

/** Lazily created so that importing modules at build time does not open a connection. */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    globalForDb.__openAtsDb ??= create();
    return Reflect.get(globalForDb.__openAtsDb, prop, receiver);
  },
});

export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function closeDb() {
  await globalForDb.__openAtsSql?.end({ timeout: 5 });
  globalForDb.__openAtsSql = undefined;
  globalForDb.__openAtsDb = undefined;
}

export { schema };
