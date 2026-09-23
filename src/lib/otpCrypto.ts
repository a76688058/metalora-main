import { createHmac, randomBytes, randomInt } from "node:crypto";

export const OTP_TTL_SECONDS = 300;
export const OTP_TICKET_TTL_SECONDS = 600;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const OTP_VERIFY_FAIL_CAP = 5;
export const OTP_SEND_PHONE_HOUR_CAP = 5;
export const OTP_SEND_IP_HOUR_CAP = 20;
export const OTP_VERIFY_IP_HOUR_CAP = 30;
export const OTP_RATE_WINDOW_SECONDS = 3600;

export const OTP_PURPOSES = [
  "signup",
  "recovery",
  "change_phone",
  "identity_link",
] as const;

export type OtpPurpose = (typeof OTP_PURPOSES)[number];

export function isOtpPurpose(value: unknown): value is OtpPurpose {
  return typeof value === "string" && (OTP_PURPOSES as readonly string[]).includes(value);
}

export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function generateProofToken(): string {
  return randomBytes(32).toString("hex");
}

export function otpCodeHmac(
  pepper: string,
  purpose: string,
  fingerprint: string,
  code: string,
): string {
  return createHmac("sha256", pepper)
    .update(`otp\n${purpose}\n${fingerprint}\n${code}`, "utf8")
    .digest("hex");
}

export function otpTicketHmac(pepper: string, token: string): string {
  return createHmac("sha256", pepper).update(`ticket\n${token}`, "utf8").digest("hex");
}

export function otpNamedTokenHmac(pepper: string, kind: string, token: string): string {
  return createHmac("sha256", pepper).update(`${kind}\n${token}`, "utf8").digest("hex");
}

export function otpRateKeyHmac(pepper: string, scope: string, material: string): string {
  return createHmac("sha256", pepper)
    .update(`rate\n${scope}\n${material}`, "utf8")
    .digest("hex");
}

/** UTC fixed window. Never store raw now() as the bucket start. */
export function fixedWindowBucketStart(nowMs: number, windowSeconds: number): Date {
  if (!Number.isInteger(windowSeconds) || windowSeconds <= 0) {
    throw new Error("windowSeconds must be a positive integer");
  }
  const unix = Math.floor(nowMs / 1000);
  const bucket = Math.floor(unix / windowSeconds) * windowSeconds;
  return new Date(bucket * 1000);
}
