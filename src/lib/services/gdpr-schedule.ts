import { runRetention } from "./gdpr";

const SIX_HOURS = 6 * 3600 * 1000;
const globalForSchedule = globalThis as unknown as { __openAtsRetention?: NodeJS.Timeout };

/** In-process retention job: a first run a minute after start-up, then every six hours. */
export function scheduleRetention() {
  if (globalForSchedule.__openAtsRetention) return;
  const run = async () => {
    try {
      const count = await runRetention();
      if (count > 0) console.info(`[retention] ${count} candidate(s) anonymised`);
    } catch (error) {
      console.error("[retention] failed", error);
    }
  };
  setTimeout(run, 60_000).unref();
  globalForSchedule.__openAtsRetention = setInterval(run, SIX_HOURS);
  globalForSchedule.__openAtsRetention.unref();
}
