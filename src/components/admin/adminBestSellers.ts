import { supabase } from '../../lib/supabase';
import { ADMIN_ORDER_STATUSES } from './adminOrders';
import { workshopOrderItemThumbRef } from '../../lib/workshopMediaDisplay';
import { workshopDisplayApi } from '../../hooks/useWorkshopMediaDisplay';

/** Canonical paid-commerce statuses. Same contract as NEW3-2 / NEW3-6. No KR/lowercase aliases. */
export const BEST_SELLER_PAID_STATUSES = ADMIN_ORDER_STATUSES;

export const BEST_SELLER_PAGE_SIZE = 1000;
const BEST_SELLER_MAX_PAGES = 100;

export const BEST_SELLER_ERROR_MESSAGE = '판매 순위를 불러오지 못했습니다.';

export type BestSellerPeriod = 'today' | 'week' | 'month' | 'year' | 'all' | 'custom';

export type BestSellerCustomRange = {
  start: string;
  end: string;
};

export type BestSellerItem = {
  name: string;
  count: number;
  revenue: number;
  isWorkshop: boolean;
  /** Catalog: stored image path/URL. Workshop: durable ref (canonical path or legacy URL) for the resolver. */
  image: string | null;
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const PAID_STATUS_LIST = [...BEST_SELLER_PAID_STATUSES];
const ORDER_SELECT = 'id, created_at, ordered_items';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function kstNowParts(now = new Date()): { year: number; month: number; day: number; weekday: number } {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth(),
    day: kst.getUTCDate(),
    weekday: kst.getUTCDay(),
  };
}

function kstWallToUtcIso(wallUtc: Date): string {
  return new Date(wallUtc.getTime() - KST_OFFSET_MS).toISOString();
}

function parseDateKey(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}

export function bestSellerQueryKey(period: BestSellerPeriod, custom: BestSellerCustomRange | null): string {
  if (period === 'custom' && custom) return `custom:${custom.start}:${custom.end}`;
  return period;
}

export function validateCustomRange(start: string, end: string): string | null {
  if (!start.trim() || !end.trim()) return '시작일과 종료일을 모두 선택해 주세요.';
  const startParts = parseDateKey(start);
  const endParts = parseDateKey(end);
  if (!startParts || !endParts) return '날짜 형식이 올바르지 않습니다.';
  if (start > end) return '종료일은 시작일 이후여야 합니다.';
  return null;
}

export function periodWindowUtc(
  period: BestSellerPeriod,
  custom: BestSellerCustomRange | null,
  now = new Date(),
): { startIso: string | null; endIso: string | null } | null {
  if (period === 'all') return { startIso: null, endIso: null };
  if (period === 'custom') {
    if (!custom) return null;
    const startParts = parseDateKey(custom.start);
    const endParts = parseDateKey(custom.end);
    if (!startParts || !endParts || custom.start > custom.end) return null;
    const startKst = new Date(Date.UTC(startParts.year, startParts.month - 1, startParts.day, 0, 0, 0, 0));
    const endKst = new Date(Date.UTC(endParts.year, endParts.month - 1, endParts.day, 23, 59, 59, 999));
    return { startIso: kstWallToUtcIso(startKst), endIso: kstWallToUtcIso(endKst) };
  }

  const { year, month, day, weekday } = kstNowParts(now);
  let startKst: Date;
  let endKst: Date;
  if (period === 'today') {
    startKst = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    endKst = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
  } else if (period === 'week') {
    startKst = new Date(Date.UTC(year, month, day - weekday, 0, 0, 0, 0));
    endKst = new Date(Date.UTC(year, month, day + (6 - weekday), 23, 59, 59, 999));
  } else if (period === 'month') {
    startKst = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    endKst = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
  } else {
    startKst = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
    endKst = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  }
  return { startIso: kstWallToUtcIso(startKst), endIso: kstWallToUtcIso(endKst) };
}

async function fetchAllPaidOrderRows(params: {
  startIso: string | null;
  endIso: string | null;
}): Promise<{ rows: Record<string, unknown>[]; error: string | null }> {
  if (!supabase) {
    return { rows: [], error: BEST_SELLER_ERROR_MESSAGE };
  }

  const rows: Record<string, unknown>[] = [];
  for (let page = 0; page < BEST_SELLER_MAX_PAGES; page += 1) {
    const from = page * BEST_SELLER_PAGE_SIZE;
    const to = from + BEST_SELLER_PAGE_SIZE - 1;
    let query = supabase
      .from('orders')
      .select(ORDER_SELECT)
      .in('status', PAID_STATUS_LIST);
    if (params.startIso) query = query.gte('created_at', params.startIso);
    if (params.endIso) query = query.lte('created_at', params.endIso);
    const { data, error } = await query
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to);
    if (error) {
      return { rows: [], error: BEST_SELLER_ERROR_MESSAGE };
    }

    const batch = Array.isArray(data) ? data : [];
    for (const row of batch) {
      rows.push(asRecord(row));
    }
    if (batch.length < BEST_SELLER_PAGE_SIZE) {
      return { rows, error: null };
    }
  }

  return { rows: [], error: BEST_SELLER_ERROR_MESSAGE };
}

function isWorkshopItem(item: Record<string, unknown>, name: string): boolean {
  const productId = asString(item.product_id);
  return (
    productId === 'workshop-single' ||
    item.product_id == null ||
    productId === '' ||
    name.includes('커스텀') ||
    name.includes('Workshop') ||
    name.includes('Atelier') ||
    Boolean(asString(item.user_image_url))
  );
}

function itemImagePath(item: Record<string, unknown>, isWorkshop: boolean): string | null {
  if (isWorkshop) return workshopOrderItemThumbRef(item, workshopDisplayApi);
  const path =
    asString(item.user_image_url) ||
    asString(item.front_image) ||
    asString(item.image) ||
    asString(item.custom_image) ||
    '';
  return path || null;
}

export function aggregateBestSellers(rows: Record<string, unknown>[]): BestSellerItem[] {
  const aggregation: Record<string, BestSellerItem> = {};

  for (const row of rows) {
    const items = Array.isArray(row.ordered_items) ? row.ordered_items : [];
    for (const raw of items) {
      if (!raw || typeof raw !== 'object') continue;
      const item = asRecord(raw);
      const name = asString(item.title) || asString(item.product_title) || asString(item.name);
      const quantity = asFiniteNumber(item.quantity);
      const price = asFiniteNumber(item.price);
      if (!name || quantity == null || quantity <= 0 || price == null || price < 0) continue;

      if (!aggregation[name]) {
        const isWorkshop = isWorkshopItem(item, name);
        aggregation[name] = {
          name,
          count: 0,
          revenue: 0,
          isWorkshop,
          image: itemImagePath(item, isWorkshop),
        };
      }
      aggregation[name].count += quantity;
      aggregation[name].revenue += quantity * price;
      if (!aggregation[name].image) aggregation[name].image = itemImagePath(item, aggregation[name].isWorkshop);
    }
  }

  return Object.values(aggregation).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (b.revenue !== a.revenue) return b.revenue - a.revenue;
    return a.name.localeCompare(b.name, 'ko');
  });
}

export async function fetchBestSellerReport(params: {
  period: BestSellerPeriod;
  custom: BestSellerCustomRange | null;
}): Promise<{ data: BestSellerItem[] | null; error: string | null }> {
  const window = periodWindowUtc(params.period, params.custom);
  if (!window) {
    return { data: null, error: BEST_SELLER_ERROR_MESSAGE };
  }
  const result = await fetchAllPaidOrderRows(window);
  if (result.error) return { data: null, error: result.error };
  return { data: aggregateBestSellers(result.rows), error: null };
}
