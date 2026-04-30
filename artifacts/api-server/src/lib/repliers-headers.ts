import type { Request } from "express";

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

function isValidIp(ip: string): boolean {
  return IPV4.test(ip) || IPV6.test(ip);
}

function isPrivateIp(ip: string): boolean {
  return (
    /^10\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    ip === "127.0.0.1" ||
    ip === "::1"
  );
}

export function getRepliersHeaders(req: Request): Record<string, string> {
  // Parse the full x-forwarded-for chain (client, proxy1, proxy2, ..., edge)
  const forwardedFor = (req.headers["x-forwarded-for"] as string | undefined ?? "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);

  // Find the first public (non-private) IP — private IPs are always internal
  // proxy hops, never the real client, regardless of proxy topology.
  const realIp =
    forwardedFor.find((ip) => isValidIp(ip) && !isPrivateIp(ip)) ??
    forwardedFor[0] ??
    req.socket.remoteAddress?.replace(/^::ffff:/, "") ??
    "";

  return { "x-repliers-forwarded-for": realIp };
}
