export type CartLineBlock =
  | 'missing'
  | 'hidden'
  | 'option_missing'
  | 'inactive'
  | 'sold_out'
  | 'price_unknown';

export interface CartNoticeProduct {
  is_visible?: boolean;
  options?: Array<{
    id?: string;
    price?: unknown;
    stock?: unknown;
    isActive?: unknown;
  }>;
}

export interface CartNoticeInput {
  kind: 'catalog' | 'workshop';
  product: CartNoticeProduct | null;
  optionId: string;
  workshopUnit: number;
  seenUnit: number | null;
}

export interface CartLineNotice {
  block: CartLineBlock | null;
  currentUnit: number;
  previousUnit: number | null;
  priceChanged: boolean;
  statusMessage: string | null;
  priceMessage: string | null;
}

const SEEN_PREFIX = 'metalora-cart-seen-price:';

function wholeKrw(value: unknown, minimum: number): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= minimum) {
    const rounded = Math.round(value);
    return Number.isSafeInteger(rounded) && rounded >= minimum ? rounded : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const parsed = Number(trimmed);
    if (!Number.isSafeInteger(parsed) || parsed < minimum) return null;
    return parsed;
  }
  return null;
}

function positiveInteger(value: unknown): number | null {
  return wholeKrw(value, 1);
}

function unitAmount(value: unknown): number | null {
  return wholeKrw(value, 0);
}

function formatKrw(value: number): string {
  return `₩${value.toLocaleString('ko-KR')}`;
}

function priceSentence(previous: number, current: number): string {
  return `가격이 변경되었습니다. 이전 ${formatKrw(previous)} · 현재 ${formatKrw(current)}`;
}

function matchedOption(product: CartNoticeProduct | null, optionId: string) {
  const options = Array.isArray(product?.options) ? product.options : [];
  return options.find((option) => option && String(option.id) === optionId) ?? null;
}

function withPriceChange(
  notice: Omit<CartLineNotice, 'previousUnit' | 'priceChanged' | 'priceMessage'>,
  seenUnit: number | null,
): CartLineNotice {
  const seen = seenUnit != null && seenUnit >= 1 ? Math.round(seenUnit) : null;
  const priceChanged = notice.currentUnit >= 1 && seen != null && seen !== notice.currentUnit;
  return {
    ...notice,
    previousUnit: priceChanged ? seen : null,
    priceChanged,
    priceMessage: priceChanged && seen != null ? priceSentence(seen, notice.currentUnit) : null,
  };
}

export function classifyCartLine(input: CartNoticeInput): CartLineNotice {
  if (input.kind === 'workshop') {
    const currentUnit = unitAmount(input.workshopUnit) ?? 0;
    return withPriceChange(
      {
        block: null,
        currentUnit,
        statusMessage: currentUnit < 1 ? '가격을 확인할 수 없습니다.' : null,
      },
      input.seenUnit,
    );
  }

  if (!input.product) {
    return withPriceChange(
      {
        block: 'missing',
        currentUnit: 0,
        statusMessage: '상품 정보를 찾을 수 없습니다.',
      },
      null,
    );
  }

  const option = matchedOption(input.product, input.optionId);
  const parsedUnit = option ? unitAmount(option.price) : null;
  const currentUnit = parsedUnit ?? 0;

  if (input.product.is_visible === false) {
    return withPriceChange(
      {
        block: 'hidden',
        currentUnit,
        statusMessage: '현재 판매하지 않는 상품입니다.',
      },
      input.seenUnit,
    );
  }

  if (!option) {
    return withPriceChange(
      {
        block: 'option_missing',
        currentUnit: 0,
        statusMessage: '선택한 옵션을 찾을 수 없습니다.',
      },
      null,
    );
  }

  let block: CartLineBlock | null = null;
  if (option.isActive === false) block = 'inactive';
  else if (typeof option.stock === 'number' && Number.isFinite(option.stock) && option.stock <= 0) {
    block = 'sold_out';
  } else if (parsedUnit == null) block = 'price_unknown';

  const statusMessage =
    block === 'inactive' || block === 'sold_out'
      ? '품절'
      : block === 'price_unknown'
        ? '가격을 확인할 수 없습니다.'
        : null;

  return withPriceChange(
    { block, currentUnit, statusMessage },
    block === 'price_unknown' ? null : input.seenUnit,
  );
}

function defaultStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function readSeenUnit(
  userId: string,
  itemId: string,
  storage: Storage | null = defaultStorage(),
): number | null {
  if (!userId || !itemId || !storage) return null;
  try {
    const raw = storage.getItem(SEEN_PREFIX + userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return positiveInteger((parsed as Record<string, unknown>)[itemId]);
  } catch {
    return null;
  }
}

export function writeSeenUnit(
  userId: string,
  itemId: string,
  unit: number,
  storage: Storage | null = defaultStorage(),
): void {
  const amount = positiveInteger(unit);
  if (!userId || !itemId || amount == null || !storage) return;
  try {
    const key = SEEN_PREFIX + userId;
    const raw = storage.getItem(key);
    const next: Record<string, number> = {};
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [id, value] of Object.entries(parsed)) {
          const stored = positiveInteger(value);
          if (stored != null) next[id] = stored;
        }
      }
    }
    next[itemId] = amount;
    storage.setItem(key, JSON.stringify(next));
  } catch {
    // Preference storage can be unavailable. The row still shows the current price.
  }
}
