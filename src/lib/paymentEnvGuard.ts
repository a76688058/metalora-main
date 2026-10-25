import {
  isProductionSupabaseHost,
  supabaseHostFromUrl,
} from "./supabaseHosts";

export const PAYMENT_TEST_ENV_NAME = "payment-test";

export const PAYMENT_TEST_REQUIRED_ENV_NAMES = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TOSS_SECRET_KEY",
] as const;

export const PAYMENT_TEST_CROSS_WRITE_ERROR =
  "결제 테스트 환경이 프로덕션 데이터베이스를 가리키고 있습니다.";

export function isTossTestSecret(secret: string): boolean {
  const trimmed = secret.trim();
  return trimmed.startsWith("test_sk_") || trimmed.startsWith("test_gsk_");
}

export function missingPaymentTestEnv(
  env: Record<string, string | undefined>,
): string[] {
  return PAYMENT_TEST_REQUIRED_ENV_NAMES.filter((name) => {
    const value = env[name];
    return typeof value !== "string" || value.trim() === "";
  });
}

export function refuseTossTestToProductionSupabase(input: {
  tossSecretKey: string;
  supabaseUrl: string;
}): { refuse: true; reason: "toss_test_to_production" } | { refuse: false } {
  const host = supabaseHostFromUrl(input.supabaseUrl);
  if (isTossTestSecret(input.tossSecretKey) && isProductionSupabaseHost(host)) {
    return { refuse: true, reason: "toss_test_to_production" };
  }
  return { refuse: false };
}

export function refusePaymentTestProductionHost(input: {
  metaloraEnv: string;
  supabaseUrl: string;
}): { refuse: true; reason: "payment_test_production_host" } | { refuse: false } {
  if (input.metaloraEnv !== PAYMENT_TEST_ENV_NAME) {
    return { refuse: false };
  }
  const host = supabaseHostFromUrl(input.supabaseUrl);
  if (!host || isProductionSupabaseHost(host)) {
    return { refuse: true, reason: "payment_test_production_host" };
  }
  return { refuse: false };
}

/** Apex storefront only. Tag URLs and revision URLs are not payment hosts. */
export const CANONICAL_PAYMENT_HOST = "metalora.art";

/** Confirmed Toss LIVE merchant id for domestic card activation. */
export const LIVE_TOSS_MID = "metalom5u3";

export const REQUIRED_CARD_METHOD = "카드";

/**
 * Header identity is what this process observes after the platform proxy.
 * Host equality is not an unspoofable proof that the socket reached metalora.art.
 * X-Forwarded-Host is never accepted as a substitute for Host.
 * Express `requestHostname` / `req.hostname` are not used: production sets
 * `trust proxy`, so those values prefer forwarded host data.
 * This repo has no runtime proof that Cloud Run strips a client-supplied
 * X-Forwarded-Host or refuses a forged Host on a public revision URL.
 * Gate A therefore keeps the public payment freeze as the charge boundary.
 * Gate B stays blocked until a control exists that does not rely on these headers.
 */
export const PAYMENT_HOST_SPOOFING_ASSESSMENT = {
  classification: "LIMITATION",
  gateB: "BLOCKED",
  primaryGateAControl: "PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7",
  summary:
    "The host guard rejects non-canonical, missing, malformed, and mismatched Host / X-Forwarded-Host values that the process can see. It does not prove a public candidate or revision URL cannot present Host metalora.art. A client or proxy that can set Host, or a platform that copies a client X-Forwarded-Host into the host the app trusts, bypasses this check. Confirm is outside the prepare freeze, so this limitation blocks Gate B.",
} as const;

export type PaymentHostRefusalReason =
  | "missing_host"
  | "malformed_host"
  | "forwarded_host_mismatch"
  | "non_canonical_host";

export type PaymentHostDecision =
  | { refuse: false; mode: "canonical" | "payment_test" }
  | { refuse: true; reason: PaymentHostRefusalReason };

export function isExplicitPaymentTestIsolation(input: {
  metaloraEnv?: string;
  viteMetaloraEnv?: string;
  mode?: string;
}): boolean {
  return (
    input.metaloraEnv === PAYMENT_TEST_ENV_NAME
    || input.viteMetaloraEnv === PAYMENT_TEST_ENV_NAME
    || input.mode === PAYMENT_TEST_ENV_NAME
  );
}

function singleHeaderRaw(
  value: unknown,
): { state: "absent" } | { state: "malformed" } | { state: "raw"; raw: string } {
  if (value == null) return { state: "absent" };
  if (Array.isArray(value)) {
    if (value.length === 0) return { state: "absent" };
    if (value.length !== 1 || typeof value[0] !== "string") return { state: "malformed" };
    return { state: "raw", raw: value[0] };
  }
  if (typeof value !== "string") return { state: "malformed" };
  return { state: "raw", raw: value };
}

/** One hostname, optional numeric port. Comma chains and junk are rejected. */
function parseObservedHost(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || /[\s,/\\@?#[\]]/.test(trimmed)) return null;
  const colon = trimmed.lastIndexOf(":");
  let hostname = trimmed;
  if (colon >= 0) {
    const port = trimmed.slice(colon + 1);
    if (!/^\d{1,5}$/.test(port)) return null;
    hostname = trimmed.slice(0, colon);
  }
  if (!hostname || hostname.startsWith(".") || hostname.endsWith(".") || hostname.includes("..")) {
    return null;
  }
  if (!/^[a-z0-9.-]+$/.test(hostname)) return null;
  return hostname;
}

/**
 * Production payment identity from the raw Host header.
 * `paymentTestIsolated` is the server's already-verified METALORA_ENV mode,
 * never a request header.
 */
export function evaluateCanonicalPaymentHost(input: {
  hostHeader: unknown;
  forwardedHostHeader: unknown;
  paymentTestIsolated: boolean;
}): PaymentHostDecision {
  if (input.paymentTestIsolated) {
    return { refuse: false, mode: "payment_test" };
  }

  const host = singleHeaderRaw(input.hostHeader);
  if (host.state === "absent") return { refuse: true, reason: "missing_host" };
  if (host.state === "malformed") return { refuse: true, reason: "malformed_host" };
  if (!host.raw.trim()) return { refuse: true, reason: "missing_host" };
  const parsedHost = parseObservedHost(host.raw);
  if (!parsedHost) return { refuse: true, reason: "malformed_host" };

  const forwarded = singleHeaderRaw(input.forwardedHostHeader);
  if (forwarded.state === "malformed") return { refuse: true, reason: "malformed_host" };
  if (forwarded.state === "raw") {
    if (!forwarded.raw.trim()) return { refuse: true, reason: "malformed_host" };
    const parsedForwarded = parseObservedHost(forwarded.raw);
    if (!parsedForwarded || parsedForwarded !== parsedHost) {
      return { refuse: true, reason: "forwarded_host_mismatch" };
    }
  }

  if (parsedHost !== CANONICAL_PAYMENT_HOST) {
    return { refuse: true, reason: "non_canonical_host" };
  }
  return { refuse: false, mode: "canonical" };
}

export function cartMayOpenCanonicalCheckout(input: {
  hostname: string;
  paymentTestIsolated: boolean;
}): boolean {
  if (input.paymentTestIsolated) return true;
  return input.hostname.trim().toLowerCase() === CANONICAL_PAYMENT_HOST;
}

export type TossDonePaymentCheck = {
  paymentKey?: unknown;
  orderId?: unknown;
  status?: unknown;
  totalAmount?: unknown;
  method?: unknown;
  mId?: unknown;
};

/**
 * Identity checks for a Toss Payment object.
 * `requireLiveMid` is false only for the isolated payment-test runtime.
 * Method is never defaulted to 카드.
 */
export function validateTossDonePayment(
  payment: TossDonePaymentCheck,
  expected: {
    orderNumber: string;
    totalPrice: number;
    paymentKey: string;
    requireLiveMid: boolean;
  },
): { ok: true } | { ok: false; reason: string } {
  if (payment.status !== "DONE") {
    return { ok: false, reason: `status_not_done:${String(payment.status ?? "missing")}` };
  }

  if (typeof payment.orderId !== "string" || payment.orderId !== expected.orderNumber) {
    return { ok: false, reason: "order_id_mismatch" };
  }

  const totalAmount = Number(payment.totalAmount);
  if (!Number.isFinite(totalAmount) || totalAmount !== expected.totalPrice) {
    return { ok: false, reason: "amount_mismatch" };
  }

  if (typeof payment.paymentKey !== "string" || payment.paymentKey.length === 0) {
    return { ok: false, reason: "payment_key_missing" };
  }
  if (payment.paymentKey !== expected.paymentKey) {
    return { ok: false, reason: "payment_key_mismatch" };
  }

  if (payment.method !== REQUIRED_CARD_METHOD) {
    return {
      ok: false,
      reason: typeof payment.method === "string" && payment.method.length > 0
        ? "method_not_card"
        : "method_missing",
    };
  }

  if (expected.requireLiveMid) {
    if (typeof payment.mId !== "string" || payment.mId.length === 0) {
      return { ok: false, reason: "mid_missing" };
    }
    if (payment.mId !== LIVE_TOSS_MID) {
      return { ok: false, reason: "mid_mismatch" };
    }
  }

  return { ok: true };
}

/**
 * Provider HTTP success plus local identity failure.
 * Do not finalize, do not POST confirm again.
 * recovery_required is an ops signal only. The paymentKey is not written onto
 * an order, so admin cancellation cannot discover that provider payment from
 * the order row. Reconciling it needs the existing ops order id plus Toss.
 */
export function capturedPaymentLocalMismatchDisposition(validationReason: string): {
  finalize: false;
  retryProviderConfirm: false;
  recoveryRequired: boolean;
  adminCancelAutomaticallyAvailable: false;
  limitation: string;
} {
  const statusNotDone = validationReason.startsWith("status_not_done");
  return {
    finalize: false,
    retryProviderConfirm: false,
    recoveryRequired: !statusNotDone,
    adminCancelAutomaticallyAvailable: false,
    limitation: statusNotDone
      ? "Provider status is not DONE. Do not finalize and do not retry confirm."
      : "Provider accepted a payment the local checks rejected. Finalize stays blocked and confirm is not retried. recovery_required is logged only. No order payment_key is stored, so admin cancellation does not see this capture until an operator matches the order id at Toss.",
  };
}
