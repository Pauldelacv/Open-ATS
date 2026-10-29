import { eq, sql } from "drizzle-orm";
import { ImapFlow } from "imapflow";
import { db } from "@/lib/db";
import { mailboxState } from "@/lib/db/schema";
import { env, imapConfigured } from "@/lib/env";
import { ingestInboundEmail } from "@/lib/services/inbound";

const STATE_ID = "replies";
// Arbitrary constant shared by every instance of the app (migrations use 724_310_001).
const MAILBOX_LOCK = 724_310_002;
const FIRST_READ_DAYS = 14;
const MAX_MESSAGE_BYTES = 25 * 1024 * 1024;

export type PollResult = {
  fetched: number;
  stored: number;
  unmatched: number;
  ignored: number;
  skipped?: "not-configured" | "locked";
};

export async function getMailboxState() {
  const [state] = await db.select().from(mailboxState).where(eq(mailboxState.id, STATE_ID));
  return state ?? null;
}

async function saveState(
  values: Partial<typeof mailboxState.$inferInsert>,
  counts?: { stored: number; unmatched: number },
) {
  await db
    .insert(mailboxState)
    .values({
      id: STATE_ID,
      ...values,
      imported: counts?.stored ?? 0,
      unmatched: counts?.unmatched ?? 0,
    })
    .onConflictDoUpdate({
      target: mailboxState.id,
      set: {
        ...values,
        ...(counts
          ? {
              imported: sql`${mailboxState.imported} + ${counts.stored}`,
              unmatched: sql`${mailboxState.unmatched} + ${counts.unmatched}`,
            }
          : {}),
      },
    });
}

/**
 * Reads new messages of the shared mailbox and files candidates' replies. The mailbox is not
 * modified: progress is the last UID read, valid as long as the mailbox's UIDVALIDITY is.
 */
export async function pollMailbox(): Promise<PollResult> {
  const empty: PollResult = { fetched: 0, stored: 0, unmatched: 0, ignored: 0 };
  if (!imapConfigured()) return { ...empty, skipped: "not-configured" };
  const e = env();
  return db.transaction(async (tx) => {
    const [lock] = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(${MAILBOX_LOCK}) as locked`,
    );
    if (!lock?.locked) return { ...empty, skipped: "locked" as const };

    const result = { ...empty };
    const client = new ImapFlow({
      host: e.IMAP_HOST!,
      port: e.IMAP_PORT ?? (e.IMAP_SECURE ? 993 : 143),
      secure: e.IMAP_SECURE,
      auth: { user: e.IMAP_USER!, pass: e.IMAP_PASSWORD! },
      logger: false,
      socketTimeout: 60_000,
    });
    const startedAt = new Date();
    try {
      await client.connect();
      const lockBox = await client.getMailboxLock(e.IMAP_MAILBOX, { readOnly: true });
      try {
        const box = client.mailbox;
        const uidValidity = box && typeof box === "object" ? Number(box.uidValidity) : 0;
        const state = await getMailboxState();
        let lastUid = state && state.uidValidity === uidValidity ? state.lastUid : 0;
        let uids: number[];
        if (lastUid > 0) {
          uids = ((await client.search({ uid: `${lastUid + 1}:*` }, { uid: true })) || []).filter(
            (uid) => uid > lastUid,
          );
        } else {
          const since = new Date(Date.now() - FIRST_READ_DAYS * 86_400_000);
          uids = (await client.search({ since }, { uid: true })) || [];
        }
        uids.sort((a, b) => a - b);
        for (const uid of uids) {
          const meta = await client.fetchOne(String(uid), { size: true }, { uid: true });
          if (meta && meta.size && meta.size <= MAX_MESSAGE_BYTES) {
            const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
            if (message && message.source) {
              result.fetched++;
              try {
                const outcome = await ingestInboundEmail(message.source);
                if (outcome.status === "stored") result.stored++;
                else if (outcome.status === "unmatched") result.unmatched++;
                else result.ignored++;
              } catch (error) {
                console.error(`[mail] message ${uid} could not be read`, error);
                result.ignored++;
              }
            }
          }
          lastUid = Math.max(lastUid, uid);
        }
        await saveState(
          {
            uidValidity,
            lastUid,
            lastCheckAt: startedAt,
            lastSuccessAt: startedAt,
            lastError: null,
          },
          { stored: result.stored, unmatched: result.unmatched },
        );
      } finally {
        lockBox.release();
      }
      await client.logout();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[mail] mailbox check failed", message);
      await saveState({ lastCheckAt: startedAt, lastError: message.slice(0, 500) });
      client.close();
    }
    return result;
  });
}

const globalForMailbox = globalThis as unknown as { __openAtsMailbox?: NodeJS.Timeout };

/** Checks the shared mailbox shortly after start-up, then every IMAP_POLL_SECONDS. */
export function scheduleMailbox() {
  if (globalForMailbox.__openAtsMailbox || !imapConfigured()) return;
  const run = async () => {
    try {
      const result = await pollMailbox();
      if (result.stored > 0) console.info(`[mail] ${result.stored} reply(ies) filed`);
    } catch (error) {
      console.error("[mail] mailbox check failed", error);
    }
  };
  setTimeout(run, 10_000).unref();
  globalForMailbox.__openAtsMailbox = setInterval(run, env().IMAP_POLL_SECONDS * 1000);
  globalForMailbox.__openAtsMailbox.unref();
}
