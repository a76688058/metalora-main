import {
  isAnalyticsConsentAccepted,
  track,
  type AnalyticsEventMap,
} from './analytics';

export type PaymentFailStage = AnalyticsEventMap['payment_fail']['failure_stage'];

type PaymentFailMarker = 'reported' | 'suppressed_no_consent';

const TOSS_CODE_RE = /^[A-Z0-9_]{1,64}$/;
const DEDUPE_KEY_PREFIX = 'metalora:payment-fail:';
const TOSS_CLIENT_ORD_SUFFIX = '__toss_client__';
const REPORTED_MARKER: PaymentFailMarker = 'reported';
const SUPPRESSED_NO_CONSENT_MARKER: PaymentFailMarker = 'suppressed_no_consent';

const TOSS_CLIENT_FAILURE_STAGES: PaymentFailStage[] = [
  'toss_request',
  'toss_redirect_fail',
];

/** Toss failure codes allowed in analytics payloads. */
export function sanitizeTossFailureCode(raw: unknown, fallback: string): string {
  if (typeof raw === 'string' && TOSS_CODE_RE.test(raw)) {
    return raw;
  }
  return fallback;
}

export function httpFailureCode(status: number): string {
  if (Number.isInteger(status) && status >= 100 && status <= 599) {
    return `http_${status}`;
  }
  return 'http_unknown';
}

export function extractTossCodeFromError(error: unknown): unknown {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const code = (error as Record<string, unknown>).code;
  return typeof code === 'string' ? code : undefined;
}

function isOrdOrderNumber(orderNumber: string): boolean {
  const trimmed = orderNumber.trim();
  return trimmed.length > 0 && trimmed.startsWith('ORD-');
}

function buildDedupeKey(
  orderNumberForDedupe: string | undefined,
  failureStage: PaymentFailStage,
  failureCode: string,
): string | null {
  if (!orderNumberForDedupe || !isOrdOrderNumber(orderNumberForDedupe)) {
    return null;
  }
  return `${DEDUPE_KEY_PREFIX}${orderNumberForDedupe.trim()}:${failureStage}:${failureCode}`;
}

function buildTossClientOrdKey(orderNumberForDedupe: string): string {
  return `${DEDUPE_KEY_PREFIX}${orderNumberForDedupe.trim()}:${TOSS_CLIENT_ORD_SUFFIX}`;
}

function getPaymentFailMarker(key: string): PaymentFailMarker | null {
  try {
    const value = sessionStorage.getItem(key);
    if (value === REPORTED_MARKER || value === SUPPRESSED_NO_CONSENT_MARKER) {
      return value;
    }
    return null;
  } catch {
    return null;
  }
}

function isPaymentFailResolved(key: string): boolean {
  return getPaymentFailMarker(key) !== null;
}

function markPaymentFail(key: string, marker: PaymentFailMarker): void {
  try {
    sessionStorage.setItem(key, marker);
  } catch {
    // Storage failure must not affect payment behavior.
  }
}

function resolveMarkerKeys(input: {
  failure_stage: PaymentFailStage;
  failure_code: string;
  orderNumberForDedupe?: string;
}): { dedupeKey: string | null; tossClientOrdKey: string | null } {
  const dedupeKey = buildDedupeKey(
    input.orderNumberForDedupe,
    input.failure_stage,
    input.failure_code,
  );

  const tossClientOrdKey =
    input.orderNumberForDedupe &&
    isOrdOrderNumber(input.orderNumberForDedupe) &&
    TOSS_CLIENT_FAILURE_STAGES.includes(input.failure_stage)
      ? buildTossClientOrdKey(input.orderNumberForDedupe)
      : null;

  return { dedupeKey, tossClientOrdKey };
}

/**
 * Consent-gated payment_fail with optional ORD-scoped session dedupe.
 * ORD is used only as a local dedupe discriminator — never sent to analytics.
 */
export function reportPaymentFail(input: {
  failure_stage: PaymentFailStage;
  failure_code: string;
  orderNumberForDedupe?: string;
}): void {
  try {
    const { dedupeKey, tossClientOrdKey } = resolveMarkerKeys(input);

    if (dedupeKey && isPaymentFailResolved(dedupeKey)) {
      return;
    }
    if (tossClientOrdKey && isPaymentFailResolved(tossClientOrdKey)) {
      return;
    }

    if (!isAnalyticsConsentAccepted()) {
      if (dedupeKey) {
        markPaymentFail(dedupeKey, SUPPRESSED_NO_CONSENT_MARKER);
      }
      if (tossClientOrdKey) {
        markPaymentFail(tossClientOrdKey, SUPPRESSED_NO_CONSENT_MARKER);
      }
      return;
    }

    track('payment_fail', {
      failure_stage: input.failure_stage,
      failure_code: input.failure_code,
      payment_provider: 'toss',
    });

    if (dedupeKey) {
      markPaymentFail(dedupeKey, REPORTED_MARKER);
    }
    if (tossClientOrdKey) {
      markPaymentFail(tossClientOrdKey, REPORTED_MARKER);
    }
  } catch {
    // Analytics must never affect payment behavior.
  }
}
