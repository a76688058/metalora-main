import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountKind } from "./accountKind";
import { otpRateKeyHmac } from "./otpCrypto";

export type AuthSecurityEventName =
  | "recovery_resolve"
  | "password_reset"
  | "password_change"
  | "signup_complete";

type RecoveryResolveInput = {
  event: "recovery_resolve";
  outcome: string;
  requestId: string;
  userId?: string | null;
  meta?: { account_kind?: AccountKind };
};

type PasswordResetInput = {
  event: "password_reset";
  outcome: string;
  requestId: string;
  userId?: string | null;
};

type PasswordChangeInput = {
  event: "password_change";
  outcome: string;
  requestId: string;
  userId?: string | null;
};

type SignupCompleteInput = {
  event: "signup_complete";
  outcome: string;
  requestId: string;
  userId?: string | null;
};

export type AuthSecurityEventInput =
  | RecoveryResolveInput
  | PasswordResetInput
  | PasswordChangeInput
  | SignupCompleteInput;

const ACCOUNT_KINDS: ReadonlySet<string> = new Set(["password", "social", "none"]);

export function sanitizeAuthSecurityMeta(
  event: AuthSecurityEventName,
  candidate: Record<string, unknown> | undefined,
): Record<string, string> {
  if (event !== "recovery_resolve" || !candidate) return {};
  const kind = candidate.account_kind;
  if (typeof kind === "string" && ACCOUNT_KINDS.has(kind)) {
    return { account_kind: kind };
  }
  return {};
}

export function buildAuthSecurityEventRow(
  pepper: string,
  ip: string,
  input: AuthSecurityEventInput,
): {
  event: AuthSecurityEventName;
  outcome: string;
  request_id: string;
  user_id: string | null;
  ip_hmac: string;
  meta: Record<string, string>;
} {
  const rawMeta =
    input.event === "recovery_resolve" ? (input.meta as Record<string, unknown> | undefined) : undefined;
  return {
    event: input.event,
    outcome: input.outcome,
    request_id: input.requestId,
    user_id: input.userId ?? null,
    ip_hmac: otpRateKeyHmac(pepper, "ip", ip),
    meta: sanitizeAuthSecurityMeta(input.event, rawMeta),
  };
}

export async function recordAuthSecurityEvent(
  admin: SupabaseClient,
  pepper: string,
  ip: string,
  input: AuthSecurityEventInput,
): Promise<void> {
  await admin.from("auth_security_events").insert(buildAuthSecurityEventRow(pepper, ip, input));
}
