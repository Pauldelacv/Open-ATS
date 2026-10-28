// Empties the end-to-end database before the server starts, so that the test begins on a
// fresh instance (first-run setup). Refuses to touch a database whose name lacks "e2e".
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url || !/e2e/.test(new URL(url).pathname)) {
  console.error("DATABASE_URL must point to an e2e database");
  process.exit(1);
}
const sql = postgres(url, { max: 1, onnotice: () => {} });
await sql`drop schema if exists public cascade`;
await sql`drop schema if exists drizzle cascade`;
await sql`create schema public`;
await sql.end();
console.log("e2e database reset");
