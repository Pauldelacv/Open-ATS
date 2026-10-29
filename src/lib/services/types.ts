import type { Role } from "@/lib/db/schema";

/** Request context. Every service function receives it and scopes its queries to `orgId`. */
export type Ctx = {
  orgId: string;
  userId: string;
  role: Role;
  /** Set when an automatic rule acts: no actor is recorded, and moves may start other rules. */
  rule?: { id: string; depth: number };
};
