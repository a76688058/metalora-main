/**
 * NEW4-0C — Public storefront payment freeze.
 *
 * Production payment is not activated. While this constant is true:
 * - Cart does not call prepare, load Toss, or requestPayment.
 * - Production POST /api/payment/prepare refuses a new charge.
 * - POST /api/payment/confirm and admin cancellation stay available
 *   so an already accepted payment can be recovered.
 * Payment-test mode may still prepare. METALORA_ENV does not unfreeze production.
 *
 * NEW7 production payment activation is a dedicated change of this constant
 * together with the live Toss client key. Do not unfreeze in an unrelated deploy.
 */
export const PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 = true;
