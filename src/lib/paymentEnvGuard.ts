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

/** Server env only. Unset, blank, and every other value stay DISABLED. */
export function serverPaymentAccess(env: { METALORA_PAYMENT_ACCESS?: string }): "ENABLED" | "DISABLED" {
  return env.METALORA_PAYMENT_ACCESS === "ENABLED" ? "ENABLED" : "DISABLED";
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

/** Server constant. Not derived from Host or X-Forwarded-Host. */
export const CANONICAL_PAYMENT_ORIGIN = "https://metalora.art";

export function canonicalPaymentReturnUrls(): { successUrl: string; failUrl: string } {
  return {
    successUrl: `${CANONICAL_PAYMENT_ORIGIN}/payment/success`,
    failUrl: `${CANONICAL_PAYMENT_ORIGIN}/payment/fail`,
  };
}

/** Request headers never prove that the caller reached the canonical origin. */
export function headersAuthorizePaymentOrigin(_input: {
  hostHeader: unknown;
  forwardedHostHeader: unknown;
}): false {
  return false;
}

export type PaymentAuthorizationDecision = {
  authorized: boolean;
  reason: "authorized" | "unauthenticated" | "order_not_owned" | "amount_mismatch";
};

/**
 * Payment authorization. Host and X-Forwarded-Host are ignored on purpose:
 * a matching or spoofed host is not proof that a charge is allowed.
 * The member id comes from the verified bearer, the owner and expected amount
 * come from the stored payment intent, and the requested amount is the body.
 */
export function authorizePaymentRequest(input: {
  authenticatedMemberId: string | null;
  orderOwnerId: string | null;
  expectedAmount: number;
  requestedAmount: number;
  hostHeader?: unknown;
  forwardedHostHeader?: unknown;
}): PaymentAuthorizationDecision {
  void input.hostHeader;
  void input.forwardedHostHeader;
  if (!input.authenticatedMemberId) {
    return { authorized: false, reason: "unauthenticated" };
  }
  if (!input.orderOwnerId || input.orderOwnerId !== input.authenticatedMemberId) {
    return { authorized: false, reason: "order_not_owned" };
  }
  if (!Number.isFinite(input.expectedAmount) || input.expectedAmount <= 0) {
    return { authorized: false, reason: "amount_mismatch" };
  }
  if (!Number.isFinite(input.requestedAmount) || input.requestedAmount !== input.expectedAmount) {
    return { authorized: false, reason: "amount_mismatch" };
  }
  return { authorized: true, reason: "authorized" };
}

/** Confirmed Toss LIVE merchant id for domestic card activation. */
export const LIVE_TOSS_MID = "metalom5u3";

export const REQUIRED_CARD_METHOD = "카드";

/**
 * Toss Payment.method response values for the card payment window.
 * requestPayment('카드') can return either pair. English and Korean are
 * the documented response enums. Request-only methods stay rejected.
 */
export const ACCEPTED_TOSS_CHECKOUT_METHODS = ["카드", "CARD", "간편결제", "EASY_PAY"] as const;

export type AcceptedTossCheckoutMethod = (typeof ACCEPTED_TOSS_CHECKOUT_METHODS)[number];

export function isAcceptedTossCheckoutMethod(method: unknown): method is AcceptedTossCheckoutMethod {
  return typeof method === "string"
    && (ACCEPTED_TOSS_CHECKOUT_METHODS as readonly string[]).includes(method);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalNonNegativeAmount(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

/**
 * Card and easy-pay instruments are optional.
 * A money or point payment may omit card. A card payment may omit easyPay.
 * A present instrument must be an object, and easy-pay amounts must not be negative.
 */
export function tossCheckoutInstrumentShape(payment: {
  card?: unknown;
  easyPay?: unknown;
}): { ok: true } | { ok: false; reason: string } {
  if ("card" in payment && payment.card != null && !isPlainRecord(payment.card)) {
    return { ok: false, reason: "card_shape_invalid" };
  }
  if (!("easyPay" in payment) || payment.easyPay == null) {
    return { ok: true };
  }
  if (!isPlainRecord(payment.easyPay)) {
    return { ok: false, reason: "easypay_shape_invalid" };
  }
  if (!optionalNonNegativeAmount(payment.easyPay.amount) || !optionalNonNegativeAmount(payment.easyPay.discountAmount)) {
    return { ok: false, reason: "easypay_shape_invalid" };
  }
  return { ok: true };
}

/**
 * Host and X-Forwarded-Host are routing observations only.
 * They are not payment authorization. Express `requestHostname` is not used.
 * Authorization is authorizePaymentRequest: verified member, stored order owner,
 * and the server amount. A spoofed host cannot supply any of those.
 */
export const PAYMENT_HOST_SPOOFING_ASSESSMENT = {
  classification: "CONTROLLED",
  gateB: "RESOLVED",
  primaryGateAControl: "PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7",
  summary:
    "Host and X-Forwarded-Host are not payment authorization. A matching host does not authorize a charge, and a spoofed host does not authorize one either. Confirm requires the authenticated member, that member's stored payment intent, and the server-stored amount. Return URLs are server constants.",
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
  card?: unknown;
  easyPay?: unknown;
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

  if (!isAcceptedTossCheckoutMethod(payment.method)) {
    return {
      ok: false,
      reason: typeof payment.method === "string" && payment.method.length > 0
        ? "method_unsupported"
        : "method_missing",
    };
  }

  const instrument = tossCheckoutInstrumentShape(payment);
  if (!instrument.ok) {
    return instrument;
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
