import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";

/**
 * AUTH_SECRET when provided; otherwise a secret generated once and kept in the data volume,
 * so `docker compose up` works without any configuration and sessions survive restarts.
 */
export function authSecret(): string {
  const configured = env().AUTH_SECRET;
  if (configured) return configured;
  const file = path.join(env().DATA_DIR, ".auth-secret");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  mkdirSync(path.dirname(file), { recursive: true });
  const secret = randomBytes(32).toString("base64url");
  writeFileSync(file, secret, { mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    // Not supported on every file system; the secret is still usable.
  }
  return secret;
}
