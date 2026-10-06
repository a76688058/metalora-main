/**
 * NEW4-0C — Public storefront payment freeze.
 *
 * Production payment is not activated. Public checkout must not call
 * /api/payment/prepare, load Toss, or requestPayment until NEW7.
 *
 * NEW7 production payment activation: remove this gate (set false / delete).
 * Do not use METALORA_ENV to unfreeze.
 */
export const PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 = true;
