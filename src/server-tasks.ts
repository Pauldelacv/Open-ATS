import { env } from "@/lib/env";

const globalForTasks = globalThis as unknown as { __openAtsTasksStarted?: boolean };

/** Runs once per server process: migrations, optional demo data, retention schedule. */
export async function startServerTasks() {
  if (globalForTasks.__openAtsTasksStarted) return;
  globalForTasks.__openAtsTasksStarted = true;
  const e = env();

  if (e.RUN_MIGRATIONS) {
    const { runMigrations } = await import("@/lib/db/migrate");
    try {
      await runMigrations();
      console.info("[startup] database migrations applied");
    } catch (error) {
      console.error("[startup] database migrations failed", error);
      process.exit(1);
    }
  }

  if (e.SEED_DEMO) {
    const { seedDemo } = await import("@/lib/demo/seed");
    try {
      const result = await seedDemo();
      console.info(`[startup] demo data ${result.created ? "created" : "already present"}`);
    } catch (error) {
      console.error("[startup] demo seed failed", error);
    }
  }

  if (e.NODE_ENV !== "test") {
    const { scheduleMailbox } = await import("@/lib/mail/imap");
    scheduleMailbox();
  }

  if (e.RETENTION_JOB && e.NODE_ENV !== "test") {
    const { scheduleRetention } = await import("@/lib/services/gdpr-schedule");
    scheduleRetention();
  }
}
