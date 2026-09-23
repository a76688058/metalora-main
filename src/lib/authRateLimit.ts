import type { SupabaseClient } from "@supabase/supabase-js";
import { fixedWindowBucketStart, otpRateKeyHmac } from "./otpCrypto";

export async function hitAuthRateLimit(
  admin: SupabaseClient,
  pepper: string,
  scope: string,
  material: string,
  cap: number,
  windowSeconds: number,
): Promise<"ok" | "throttled" | "error"> {
  const bucket = fixedWindowBucketStart(Date.now(), windowSeconds);
  const { data, error } = await admin.rpc("auth_rate_limit_hit", {
    p_scope: scope,
    p_key_hmac: otpRateKeyHmac(pepper, scope, material),
    p_window_seconds: windowSeconds,
    p_bucket_started_at: bucket.toISOString(),
  });
  if (error) return "error";
  const count = typeof data === "number" ? data : Number(data);
  if (!Number.isFinite(count) || count > cap) return "throttled";
  return "ok";
}
