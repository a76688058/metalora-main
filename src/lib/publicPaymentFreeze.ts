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
