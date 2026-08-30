import {
  isAnalyticsConsentAccepted,
  track,
  type AnalyticsItem,
} from './analytics';

export type PurchaseAnalyticsMarker = 'dispatched' | 'suppressed_no_consent';

const KEY_PREFIX = 'metalora:purchase-analytics:';

export type AuthoritativePurchasePayload = {
  order_number: string;
  amount: number;
  currency: 'KRW';
  items: AnalyticsItem[];
};

function analyticsDebugLog(message: string, detail?: unknown): void {
  try {
    if (
      import.meta.env.DEV === true ||
      import.meta.env.VITE_ANALYTICS_DEBUG === 'true'
    ) {
      if (detail !== undefined) {
        console.info(`[ANALYTICS_DEBUG] ${message}`, detail);
      } else {
        console.info(`[ANALYTICS_DEBUG] ${message}`);
      }
    }
  } catch {
    // ignore
  }
}

export function getPurchaseAnalyticsMarker(
  orderNumber: string,
): PurchaseAnalyticsMarker | null {
  try {
    const value = localStorage.getItem(`${KEY_PREFIX}${orderNumber}`);
    if (value === 'dispatched' || value === 'suppressed_no_consent') {
      return value;
    }
    return null;
  } catch {
    return null;
  }
}

export function setPurchaseAnalyticsMarker(
  orderNumber: string,
  marker: PurchaseAnalyticsMarker,
): void {
  try {
    localStorage.setItem(`${KEY_PREFIX}${orderNumber}`, marker);
  } catch {
    // Storage failure must not affect payment success.
  }
}

export function isPurchaseAnalyticsResolved(
  marker: PurchaseAnalyticsMarker | null,
): boolean {
  return marker === 'dispatched' || marker === 'suppressed_no_consent';
}

export function parseAuthoritativePurchasePayload(
  result: unknown,
): AuthoritativePurchasePayload | null {
  if (!result || typeof result !== 'object') {
    return null;
  }

  const response = result as Record<string, unknown>;
  if (response.success !== true) {
    return null;
  }

  const order_number =
    typeof response.order_number === 'string'
      ? response.order_number.trim()
      : '';
  if (!order_number) {
    return null;
  }

  const amount =
    typeof response.amount === 'number'
      ? response.amount
      : Number(response.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  if (response.currency !== 'KRW') {
    return null;
  }

  if (!Array.isArray(response.items)) {
    return null;
  }

  const items: AnalyticsItem[] = [];
  for (const rawItem of response.items) {
    if (!rawItem || typeof rawItem !== 'object') {
      continue;
    }

    const item = rawItem as Record<string, unknown>;
    const item_id =
      typeof item.item_id === 'string' ? item.item_id.trim() : '';
    if (!item_id) {
      continue;
    }

    const item_name =
      typeof item.item_name === 'string' ? item.item_name.trim() : '';
    if (!item_name) {
      continue;
    }

    const quantity =
      typeof item.quantity === 'number'
        ? item.quantity
        : Number(item.quantity);
    if (
      !Number.isFinite(quantity) ||
      !Number.isInteger(quantity) ||
      quantity < 1
    ) {
      continue;
    }

    const price =
      typeof item.price === 'number' ? item.price : Number(item.price);
    if (!Number.isFinite(price) || price < 0) {
      continue;
    }

    const analyticsItem: AnalyticsItem = {
      item_id,
      item_name,
      price,
      quantity,
    };

    const item_variant =
      typeof item.item_variant === 'string' ? item.item_variant.trim() : '';
    if (item_variant) {
      analyticsItem.item_variant = item_variant;
    }

    items.push(analyticsItem);
  }

  if (items.length === 0) {
    return null;
  }

  return {
    order_number,
    amount,
    currency: 'KRW',
    items,
  };
}

/**
 * Best-effort purchase analytics after authoritative confirm success.
 * Marker "dispatched" means client dispatch was attempted — not GA receipt proof.
 */
export function resolvePurchaseAnalyticsAfterConfirm(result: unknown): void {
  try {
    const payload = parseAuthoritativePurchasePayload(result);
    if (!payload) {
      analyticsDebugLog('purchase skipped: malformed confirm analytics payload');
      return;
    }

    const existingMarker = getPurchaseAnalyticsMarker(payload.order_number);
    if (isPurchaseAnalyticsResolved(existingMarker)) {
      return;
    }

    if (!isAnalyticsConsentAccepted()) {
      setPurchaseAnalyticsMarker(payload.order_number, 'suppressed_no_consent');
      return;
    }

    track('purchase', {
      transaction_id: payload.order_number,
      currency: 'KRW',
      value: payload.amount,
      items: payload.items,
    });

    setPurchaseAnalyticsMarker(payload.order_number, 'dispatched');
  } catch {
    // Analytics must never affect payment success.
  }
}
