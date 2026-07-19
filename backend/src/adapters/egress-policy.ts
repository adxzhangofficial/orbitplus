import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { isIP } from "node:net";
import { env } from "../config/env.js";
import { AppError, badRequest } from "../lib/errors.js";

function ipv4Category(address: string): "public" | "private" | "blocked" {
  const [a, b] = address.split(".").map(Number);
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return "private";
  if (
    a === 0 || a === 127 || (a === 169 && b === 254) || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 192 && b === 0)
    || (a === 198 && (b === 18 || b === 19))
  ) return "blocked";
  return "public";
}

function addressCategory(address: string): "public" | "private" | "blocked" {
  const version = isIP(address);
  if (version === 4) return ipv4Category(address);
  if (version !== 6) return "blocked";
  const normalized = address.toLowerCase();
  if (normalized === "::" || normalized === "::1" || /^(fe8|fe9|fea|feb)/.test(normalized) || normalized.startsWith("ff")) return "blocked";
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return "private";
  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mapped ? ipv4Category(mapped) : "public";
}

/** Resolve once, validate every answer, and connect to the validated address to
 * prevent DNS rebinding around the egress policy. Loopback, link-local, carrier
 * NAT, metadata, multicast, and reserved destinations are always denied. */
export async function resolveAllowedSftpAddress(host: string): Promise<string> {
  // `all: true` selects the array overload; ReturnType<typeof lookup> resolves to
  // the single-address overload, so the element type is declared explicitly.
  let results: LookupAddress[];
  try {
    results = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new AppError(502, "SFTP_DNS_FAILED", "The SFTP hostname could not be resolved");
  }
  if (!results.length) throw new AppError(502, "SFTP_DNS_FAILED", "The SFTP hostname did not resolve to an address");
  for (const result of results) {
    const category = addressCategory(result.address);
    if (category === "blocked" || (category === "private" && !env.SFTP_ALLOW_PRIVATE_NETWORKS)) {
      throw badRequest(category === "private"
        ? "Private-network SFTP targets require an isolated worker with SFTP_ALLOW_PRIVATE_NETWORKS=true"
        : "This SFTP target is blocked by the worker egress policy");
    }
  }
  return results[0]!.address;
}
