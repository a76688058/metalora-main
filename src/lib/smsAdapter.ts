import {
  isProductionSupabaseHost,
  supabaseHostFromUrl,
} from "./supabaseHosts";
import { PAYMENT_TEST_ENV_NAME } from "./paymentEnvGuard";

export type SmsSendInput = {
  e164: string;
  templateId: "otp_generic";
  otp: string;
  requestId: string;
  ttlSec: number;
};

export type SmsSendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; class: "timeout" | "rejected" | "network" };

export interface SmsAdapter {
  send(input: SmsSendInput): Promise<SmsSendResult>;
}

export class DevCaptureSmsAdapter implements SmsAdapter {
  private last: SmsSendInput | null = null;

  async send(input: SmsSendInput): Promise<SmsSendResult> {
    this.last = {
      e164: input.e164,
      templateId: input.templateId,
      otp: input.otp,
      requestId: input.requestId,
      ttlSec: input.ttlSec,
    };
    return { ok: true, providerMessageId: `dev-${input.requestId}` };
  }

  /** Payment-test script only. Never log. Never expose over HTTP. */
  peekForTests(): { e164: string; otp: string; requestId: string } | null {
    if (!this.last) return null;
    return {
      e164: this.last.e164,
      otp: this.last.otp,
      requestId: this.last.requestId,
    };
  }
}

export type SmsAdapterResolve =
  | { ok: true; adapter: SmsAdapter; kind: "dev-capture" }
  | { ok: false; reason: "fail_closed" };

/**
 * DevCapture is allowed only for payment-test + SMS_ADAPTER=dev-capture.
 * Production host, production env, or missing real adapter: fail closed.
 * No silent fallback.
 */
export function resolveSmsAdapter(
  env: Record<string, string | undefined>,
): SmsAdapterResolve {
  const host = supabaseHostFromUrl((env.VITE_SUPABASE_URL ?? "").trim());
  if (isProductionSupabaseHost(host)) {
    return { ok: false, reason: "fail_closed" };
  }

  const metaloraEnv = (env.METALORA_ENV ?? "").trim();
  const adapterName = (env.SMS_ADAPTER ?? "").trim();
  const nodeEnv = (env.NODE_ENV ?? "").trim();

  if (nodeEnv === "production" && metaloraEnv !== PAYMENT_TEST_ENV_NAME) {
    return { ok: false, reason: "fail_closed" };
  }
  if (metaloraEnv === "production") {
    return { ok: false, reason: "fail_closed" };
  }

  if (metaloraEnv === PAYMENT_TEST_ENV_NAME && adapterName === "dev-capture") {
    return { ok: true, adapter: new DevCaptureSmsAdapter(), kind: "dev-capture" };
  }

  return { ok: false, reason: "fail_closed" };
}
