import { closeDb } from "../src/lib/db";
import { runMigrations } from "../src/lib/db/migrate";
import { seedDemo } from "../src/lib/demo/seed";

await runMigrations();
const result = await seedDemo();
console.log(result.created ? "Demo data created." : "Demo data already present.");
await closeDb();
