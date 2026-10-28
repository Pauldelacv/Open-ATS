import type { Role } from "@/lib/db/schema";

export type Permission =
  | "job:manage"
  | "pipeline:move"
  | "pipeline:edit-stages"
  | "candidate:create"
  | "candidate:reject"
  | "candidate:email"
  | "candidate:tag"
  | "candidate:note"
  | "candidate:evaluate"
  | "candidate:export"
  | "candidate:delete"
  | "pool:view-all"
  | "templates:manage"
  | "settings:organization"
  | "settings:team"
  | "settings:privacy"
  | "emails:journal";

const recruiter: Permission[] = [
  "job:manage",
  "pipeline:move",
  "pipeline:edit-stages",
  "candidate:create",
  "candidate:reject",
  "candidate:email",
  "candidate:tag",
  "candidate:note",
  "candidate:evaluate",
  "candidate:export",
  "pool:view-all",
  "templates:manage",
  "emails:journal",
];

const grants: Record<Role, ReadonlySet<Permission>> = {
  admin: new Set<Permission>([
    ...recruiter,
    "candidate:delete",
    "settings:organization",
    "settings:team",
    "settings:privacy",
  ]),
  recruiter: new Set(recruiter),
  // Hiring managers: read the jobs they are assigned to, comment and evaluate.
  member: new Set<Permission>(["candidate:note", "candidate:evaluate"]),
};

export function can(role: Role, permission: Permission): boolean {
  return grants[role].has(permission);
}

export class ForbiddenError extends Error {
  constructor(public readonly permission?: Permission) {
    super(permission ? `Forbidden: ${permission}` : "Forbidden");
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  constructor(what = "Resource") {
    super(`${what} not found`);
    this.name = "NotFoundError";
  }
}

export function assertCan(role: Role, permission: Permission) {
  if (!can(role, permission)) throw new ForbiddenError(permission);
}
