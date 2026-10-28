import { runMigrations } from "../src/lib/db/migrate";

await runMigrations();
console.log("Migrations applied.");
