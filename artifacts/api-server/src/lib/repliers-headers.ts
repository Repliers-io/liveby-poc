import type { Request } from "express";

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

function isValidIp(ip: string): boolean {
  return IPV4.test(ip) || IPV6.test(ip);
}

export function getRepliersHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {};

  // ── Client IP ──────────────────────────────────────────────────────────────
  // x-forwarded-for is a comma-separated chain: client, proxy1, ..., last-proxy
  // The last entry is the dynamic load balancer (Replit), so the real client
  // IP is the second-to-last. If there's only one entry, use it directly.
  const forwardedFor = (req.headers["x-forwarded-for"] as string | undefined ?? "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);

  let realIp: string;
  if (forwardedFor.length >= 2) {
    realIp = forwardedFor[forwardedFor.length - 2];
  } else {
    realIp = forwardedFor[0] ?? req.socket.remoteAddress?.replace(/^::ffff:/, "") ?? "";
  }

  if (!isValidIp(realIp)) {
    realIp = req.socket.remoteAddress?.replace(/^::ffff:/, "") ?? "";
  }

  headers["x-repliers-forwarded-for"] = realIp;

  return headers;
}
