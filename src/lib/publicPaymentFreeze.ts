/**
 * NEW4-0C — Public storefront payment freeze.
 *
 * Production payment is not activated. While this constant is true:
 * - Cart does not call prepare, load Toss, or requestPayment.
 * - Production POST /api/payment/prepare refuses a new charge.
 *   Payment-test mode may still prepare. That mode is startup state only.
 * - POST /api/payment/confirm returns HTTP 503 before host checks, logging,
 *   bearer verification, database access, Toss authorization POST, and Toss lookup GET.
 *   Payment-test mode and request headers do not bypass that confirm return.
 * - Admin cancellation stays available for an already accepted payment.
 * METALORA_ENV does not unfreeze production.
 *
 * NEW7 production payment activation is a dedicated change of this constant
 * together with the live Toss client key. Do not unfreeze in an unrelated deploy.
 * Card screening uses CARD_SCREENING_TEST_ENABLED and must not change this flag.
 */
export const PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 = true;

export const PUBLIC_PAYMENT_FROZEN_MESSAGE = "현재 결제 기능을 준비하고 있습니다.";

/** Confirm fails closed whenever the freeze constant is true. Inputs cannot open it. */
export function confirmFreezeBlock(
  _context?: { paymentTestMode?: boolean; headers?: unknown },
): { status: 503; error: typeof PUBLIC_PAYMENT_FROZEN_MESSAGE } | null {
  if (PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 !== true) return null;
  return { status: 503, error: PUBLIC_PAYMENT_FROZEN_MESSAGE };
}
