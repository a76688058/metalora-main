/**
 * Public checkout switch.
 *
 * false is the authorized activation value. While the constant is true,
 * prepare refuses a new production charge and confirm fails closed before
 * host checks, logging, bearer verification, database access, and Toss calls.
 * Payment-test mode and request headers cannot open confirm.
 * The server still requires METALORA_PAYMENT_ACCESS=ENABLED before prepare.
 * Screening must not change this flag.
 */
export const PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 = false as boolean;

export const PUBLIC_PAYMENT_FROZEN_MESSAGE = "현재 결제 기능을 준비하고 있습니다.";

/** Confirm fails closed only while the freeze constant is true. Inputs cannot open it. */
export function confirmFreezeBlock(
  _context?: { paymentTestMode?: boolean; headers?: unknown },
): { status: 503; error: typeof PUBLIC_PAYMENT_FROZEN_MESSAGE } | null {
  if (PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 !== true) return null;
  return { status: 503, error: PUBLIC_PAYMENT_FROZEN_MESSAGE };
}
