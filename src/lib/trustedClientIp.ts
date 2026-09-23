/** Trusted client IP for OTP and auth security counters. Never use leftmost X-Forwarded-For. */

export const UNKNOWN_CLIENT_IP = "unknown";

export type TrustedIpMode = "production" | "local";

export type TrustedIpRequest = {
  ip?: string;
  socket?: { remoteAddress?: string | null };
  headers?: Record<string, unknown>;
};

export function resolveTrustedIpMode(
  env: Record<string, string | undefined>,
): TrustedIpMode {
  const metalora = (env.METALORA_ENV ?? "").trim();
  if (metalora === "payment-test") return "local";
  if ((env.NODE_ENV ?? "").trim() === "production" && metalora !== "payment-test") {
    return "production";
  }
  return "local";
}

/**
 * Normalize for HMAC keys: lowercase, strip IPv4-mapped IPv6 prefix, drop zone id.
 * Returns null if unparseable.
 */
export function normalizeClientIp(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  let value = raw.trim().toLowerCase();
  if (!value) return null;
  if (value.startsWith("::ffff:")) value = value.slice(7);
  const zone = value.indexOf("%");
  if (zone >= 0) value = value.slice(0, zone);
  if (value === "::1") value = "127.0.0.1";
  if (!value || value === UNKNOWN_CLIENT_IP) return null;
  if (value.includes("/") || value.includes(" ")) return null;
  return value;
}

/**
 * Production/Cloud Run: use Express `req.ip` after `trust proxy = 1`.
 * Payment-test/local: socket remote address only; ignore client X-Forwarded-For.
 */
export function trustedClientIp(req: TrustedIpRequest, mode: TrustedIpMode): string {
  if (mode === "local") {
    return normalizeClientIp(req.socket?.remoteAddress ?? null) ?? UNKNOWN_CLIENT_IP;
  }
  return normalizeClientIp(req.ip ?? null) ?? UNKNOWN_CLIENT_IP;
}

export function configureExpressTrustProxy(app: { set: (key: string, value: unknown) => unknown }, mode: TrustedIpMode): void {
  if (mode === "production") {
    app.set("trust proxy", 1);
    return;
  }
  app.set("trust proxy", false);
}
