/**
 * Public checkout switch.
 *
 * While this constant is true, Cart does not call prepare or Toss, and
 * production prepare refuses a new charge. Confirm and admin cancellation
 * stay available. Payment-test mode may still prepare.
 *
 * false is the authorized activation value. The server still requires
 * METALORA_PAYMENT_ACCESS=ENABLED before prepare. Screening must not change
 * this flag.
 */
export const PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 = false as boolean;

export const PUBLIC_PAYMENT_FROZEN_MESSAGE = "현재 결제 기능을 준비하고 있습니다.";

/** Confirm fails closed only while the freeze constant is true. */
export function confirmFreezeBlock(): { status: 503; error: typeof PUBLIC_PAYMENT_FROZEN_MESSAGE } | null {
  if (PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 !== true) return null;
  return { status: 503, error: PUBLIC_PAYMENT_FROZEN_MESSAGE };
}
