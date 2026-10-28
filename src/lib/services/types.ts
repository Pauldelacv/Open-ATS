import type { Role } from "@/lib/db/schema";

/** Request context. Every service function receives it and scopes its queries to `orgId`. */
export type Ctx = {
  orgId: string;
  userId: string;
  role: Role;
};
