/**
 * Reversible Toss card-company screening window.
 * PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 stays true.
 * Set CARD_SCREENING_TEST_ENABLED to false to remove the test CTA
 * without opening live checkout.
 * This mode never calls production prepare, confirm, or order finalization.
 */
export const CARD_SCREENING_TEST_ENABLED = true;

const SCREENING_ORDER_PATTERN = /^MLSCRN-[A-Za-z0-9-]{6,56}$/;

export function createCardScreeningOrderId(now = Date.now(), entropy = Math.random().toString(36).slice(2, 10)): string {
  const stamp = now.toString(36);
  const noise = entropy.replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
  const orderId = `MLSCRN-${stamp}-${noise}`;
  if (!SCREENING_ORDER_PATTERN.test(orderId) || orderId.length > 64) {
    throw new Error('screening order id is invalid');
  }
  return orderId;
}

export function assertTossTestClientKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed.startsWith('test_ck_')) {
    throw new Error('screening requires the Toss test client key');
  }
  if (/live_(ck|sk|gsk)/.test(trimmed)) {
    throw new Error('screening refused a live Toss key');
  }
  return trimmed;
}
