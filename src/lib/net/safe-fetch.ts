import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { env } from "@/lib/env";

/** Addresses a server-side request must never reach: loopback, private, link-local… */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const [a, b] = address.split(".").map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(lower);
  }
  return true;
}

export class SafeFetchError extends Error {
  constructor(
    public readonly reason: "url" | "address" | "status" | "size" | "timeout" | "network",
    message?: string,
  ) {
    super(message ?? reason);
    this.name = "SafeFetchError";
  }
}

// Local addresses are allowed in tests only, where calendars are served by the test itself.
const allowPrivate = () => env().NODE_ENV === "test";

/** Refuses private addresses when the connection is made, not only when the name is resolved. */
function guardedLookup(
  hostname: string,
  options: object,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string | LookupAddress[],
    family?: number,
  ) => void,
) {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "");
    const list = addresses as LookupAddress[];
    if (!allowPrivate() && list.some((a) => isPrivateAddress(a.address)))
      return callback(new SafeFetchError("address", "Private address refused"), "");
    if ((options as { all?: boolean }).all) return callback(null, list);
    callback(null, list[0]!.address, list[0]!.family);
  });
}

/**
 * GET of an address typed by a user (a calendar feed): https only (`webcal` rewritten), no
 * private network, at most `maxBytes` and `timeoutMs`, three redirects.
 */
export async function safeFetchText(
  rawUrl: string,
  options: { maxBytes?: number; timeoutMs?: number } = {},
): Promise<string> {
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
  const timeoutMs = options.timeoutMs ?? 10_000;
  let url: URL;
  try {
    url = new URL(rawUrl.trim().replace(/^webcals?:\/\//i, "https://"));
  } catch {
    throw new SafeFetchError("url");
  }
  for (let redirects = 0; redirects <= 3; redirects++) {
    const allowedProtocol =
      url.protocol === "https:" || (allowPrivate() && url.protocol === "http:");
    if (!allowedProtocol || url.username || url.password) throw new SafeFetchError("url");
    if (isIP(url.hostname.replace(/^\[|\]$/g, "")) && !allowPrivate()) {
      if (isPrivateAddress(url.hostname.replace(/^\[|\]$/g, "")))
        throw new SafeFetchError("address");
    }
    const result = await new Promise<{ status: number; location?: string; body?: string }>(
      (resolve, reject) => {
        const client = url.protocol === "https:" ? https : http;
        const request = client.get(
          url,
          {
            lookup: guardedLookup as never,
            timeout: timeoutMs,
            headers: { "User-Agent": "Open ATS calendar reader", Accept: "text/calendar, */*" },
          },
          (response) => {
            const status = response.statusCode ?? 0;
            if (status >= 300 && status < 400 && response.headers.location) {
              response.resume();
              return resolve({ status, location: response.headers.location });
            }
            if (status !== 200) {
              response.resume();
              return reject(new SafeFetchError("status", `HTTP ${status}`));
            }
            const chunks: Buffer[] = [];
            let size = 0;
            response.on("data", (chunk: Buffer) => {
              size += chunk.length;
              if (size > maxBytes) {
                request.destroy();
                reject(new SafeFetchError("size"));
              } else chunks.push(chunk);
            });
            response.on("end", () =>
              resolve({ status, body: Buffer.concat(chunks).toString("utf8") }),
            );
            response.on("error", (e) => reject(new SafeFetchError("network", e.message)));
          },
        );
        request.on("timeout", () => {
          request.destroy();
          reject(new SafeFetchError("timeout"));
        });
        request.on("error", (e) =>
          reject(e instanceof SafeFetchError ? e : new SafeFetchError("network", e.message)),
        );
      },
    );
    if (result.body !== undefined) return result.body;
    url = new URL(result.location!, url);
  }
  throw new SafeFetchError("status", "Too many redirects");
}
