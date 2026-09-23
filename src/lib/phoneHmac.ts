import { createHmac, timingSafeEqual } from "node:crypto";

/** Canonical uniqueness fingerprint. Uses PHONE_IDENTITY_KEY only. Not rotated at runtime. */
export function phoneFingerprint(e164: string, identityKey: string): string {
  if (!e164 || !identityKey) {
    throw new Error("phone fingerprint requires e164 and identity key");
  }
  return createHmac("sha256", identityKey).update(e164, "utf8").digest("hex");
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  try {
    const left = Buffer.from(a, "hex");
    const right = Buffer.from(b, "hex");
    if (left.length === 0 || left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}
