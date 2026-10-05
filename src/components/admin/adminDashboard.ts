import { supabase } from '../../lib/supabase';
import { ADMIN_ORDER_STATUSES } from './adminOrders';

/** Canonical paid-commerce statuses. Same contract as NEW3-2 / NEW3-3. No KR/lowercase aliases. */
export const DASHBOARD_PAID_STATUSES = ADMIN_ORDER_STATUSES;

export const DASHBOARD_PAGE_SIZE = 1000;
const DASHBOARD_MAX_PAGES = 100;

export const DASHBOARD_ERROR_MESSAGE = '데이터를 불러오지 못했습니다.';

export type DashboardRangeType = 'daily' | 'monthly' | 'yearly';

export type DashboardComparison =
  | { kind: 'flat' }
  | { kind: 'new' }
  | { kind: 'up'; percent: number }
  | { kind: 'down'; percent: number };

export type DashboardStats = {
  revenue: number;
  ordersCount: number;
  comparison: DashboardComparison;
};

export type DashboardCalendarDay = {
  revenue: number;
  orders: number;
};

export type DashboardTrendPoint = {
  date: string;
  revenue: number;
  orders: number;
};

export type DashboardDayReport = {
  date: string;
  totalRevenue: number;
  orderCount: number;
  topItem: {
    name: string;
    count: number;
    revenue: number;
    isWorkshop: boolean;
  } | null;
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const PAID_STATUS_LIST = [...DASHBOARD_PAID_STATUSES];

const STATS_SELECT = 'id, total_price';
const SERIES_SELECT = 'id, total_price, created_at';
const DAY_DETAIL_SELECT = 'id, total_price, ordered_items';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function kstNowParts(now = new Date()): { year: number; month: number; day: number } {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth(),
    day: kst.getUTCDate(),
  };
}

function kstWallToUtcIso(wallUtc: Date): string {
  return new Date(wallUtc.getTime() - KST_OFFSET_MS).toISOString();
}

export function kstDateKeyFromIso(iso: string): string {
  const dateKst = new Date(new Date(iso).getTime() + KST_OFFSET_MS);
  return `${dateKst.getUTCFullYear()}-${String(dateKst.getUTCMonth() + 1).padStart(2, '0')}-${String(dateKst.getUTCDate()).padStart(2, '0')}`;
}

export function kstMonthKey(month: Date): string {
  const kst = new Date(month.getTime() + KST_OFFSET_MS);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function rangeWindowUtc(range: DashboardRangeType, now = new Date()): {
  startIso: string;
  endIso: string;
  prevStartIso: string;
  prevEndIso: string;
} {
  const { year, month, day } = kstNowParts(now);
  let startKst: Date;
  let endKst: Date;
  let prevStartKst: Date;
  let prevEndKst: Date;

  if (range === 'daily') {
    startKst = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    endKst = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
    prevStartKst = new Date(startKst.getTime() - 24 * 60 * 60 * 1000);
    prevEndKst = new Date(endKst.getTime() - 24 * 60 * 60 * 1000);
  } else if (range === 'monthly') {
    startKst = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    endKst = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
    prevStartKst = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    prevEndKst = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  } else {
    startKst = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
    endKst = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
    prevStartKst = new Date(Date.UTC(year - 1, 0, 1, 0, 0, 0, 0));
    prevEndKst = new Date(Date.UTC(year - 1, 11, 31, 23, 59, 59, 999));
  }

  return {
    startIso: kstWallToUtcIso(startKst),
    endIso: kstWallToUtcIso(endKst),
    prevStartIso: kstWallToUtcIso(prevStartKst),
    prevEndIso: kstWallToUtcIso(prevEndKst),
  };
}

export function calendarMonthWindowUtc(month: Date): { startIso: string; endIso: string } {
  const kst = new Date(month.getTime() + KST_OFFSET_MS);
  const year = kst.getUTCFullYear();
  const monthNum = kst.getUTCMonth();
  const startKst = new Date(Date.UTC(year, monthNum, 1, 0, 0, 0, 0));
  const endKst = new Date(Date.UTC(year, monthNum + 1, 0, 23, 59, 59, 999));
  return {
    startIso: kstWallToUtcIso(startKst),
    endIso: kstWallToUtcIso(endKst),
  };
}

export function dayWindowUtc(dateKey: string): { startIso: string; endIso: string } | null {
  const parts = dateKey.split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  const [year, month, day] = parts;
  const startKst = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const endKst = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  return {
    startIso: kstWallToUtcIso(startKst),
    endIso: kstWallToUtcIso(endKst),
  };
}

async function fetchAllPaidOrderRows(params: {
  select: string;
  startIso: string;
  endIso: string;
}): Promise<{ rows: Record<string, unknown>[]; error: string | null }> {
  if (!supabase) {
    return { rows: [], error: DASHBOARD_ERROR_MESSAGE };
  }

  const rows: Record<string, unknown>[] = [];
  for (let page = 0; page < DASHBOARD_MAX_PAGES; page += 1) {
    const from = page * DASHBOARD_PAGE_SIZE;
    const to = from + DASHBOARD_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('orders')
      .select(params.select)
      .gte('created_at', params.startIso)
      .lte('created_at', params.endIso)
      .in('status', PAID_STATUS_LIST)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to);

    if (error) {
      return { rows: [], error: DASHBOARD_ERROR_MESSAGE };
    }

    const batch = Array.isArray(data) ? data : [];
    for (const row of batch) {
      rows.push(asRecord(row));
    }
    if (batch.length < DASHBOARD_PAGE_SIZE) {
      return { rows, error: null };
    }
  }

  return { rows: [], error: DASHBOARD_ERROR_MESSAGE };
}

function sumRevenue(rows: Record<string, unknown>[]): number {
  return rows.reduce((sum, row) => sum + asNumber(row.total_price), 0);
}

export function dashboardComparePeriodLabel(range: DashboardRangeType): string {
  if (range === 'daily') return '전일 대비';
  if (range === 'monthly') return '전월 대비';
  return '전년 대비';
}

export function comparisonFromTotals(currentTotal: number, prevTotal: number): DashboardComparison {
  if (prevTotal === 0) {
    return currentTotal > 0 ? { kind: 'new' } : { kind: 'flat' };
  }
  const rounded = Math.round(((currentTotal - prevTotal) / prevTotal) * 100);
  if (rounded === 0) return { kind: 'flat' };
  if (rounded > 0) return { kind: 'up', percent: rounded };
  return { kind: 'down', percent: Math.abs(rounded) };
}

export async function fetchDashboardRangeStats(
  range: DashboardRangeType,
): Promise<{ data: DashboardStats | null; error: string | null }> {
  const window = rangeWindowUtc(range);
  const current = await fetchAllPaidOrderRows({
    select: STATS_SELECT,
    startIso: window.startIso,
    endIso: window.endIso,
  });
  if (current.error) return { data: null, error: current.error };

  const previous = await fetchAllPaidOrderRows({
    select: STATS_SELECT,
    startIso: window.prevStartIso,
    endIso: window.prevEndIso,
  });
  if (previous.error) return { data: null, error: previous.error };

  const revenue = sumRevenue(current.rows);
  return {
    data: {
      revenue,
      ordersCount: current.rows.length,
      comparison: comparisonFromTotals(revenue, sumRevenue(previous.rows)),
    },
    error: null,
  };
}

export async function fetchDashboardCalendar(
  month: Date,
): Promise<{ data: Record<string, DashboardCalendarDay> | null; error: string | null }> {
  const window = calendarMonthWindowUtc(month);
  const result = await fetchAllPaidOrderRows({
    select: SERIES_SELECT,
    startIso: window.startIso,
    endIso: window.endIso,
  });
  if (result.error) return { data: null, error: result.error };

  const aggregated: Record<string, DashboardCalendarDay> = {};
  for (const row of result.rows) {
    const key = kstDateKeyFromIso(asString(row.created_at));
    if (!aggregated[key]) aggregated[key] = { revenue: 0, orders: 0 };
    aggregated[key].revenue += asNumber(row.total_price);
    aggregated[key].orders += 1;
  }
  return { data: aggregated, error: null };
}

export async function fetchDashboardTrend(
  now = new Date(),
): Promise<{ data: DashboardTrendPoint[] | null; error: string | null }> {
  const last14Days = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const result = await fetchAllPaidOrderRows({
    select: SERIES_SELECT,
    startIso: last14Days.toISOString(),
    endIso: now.toISOString(),
  });
  if (result.error) return { data: null, error: result.error };

  const aggregated: Record<string, { revenue: number; orders: number }> = {};
  for (let i = 0; i < 14; i += 1) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const kstD = new Date(d.getTime() + KST_OFFSET_MS);
    const key = `${kstD.getUTCMonth() + 1}/${kstD.getUTCDate()}`;
    aggregated[key] = { revenue: 0, orders: 0 };
  }

  for (const row of result.rows) {
    const dateKst = new Date(new Date(asString(row.created_at)).getTime() + KST_OFFSET_MS);
    const key = `${dateKst.getUTCMonth() + 1}/${dateKst.getUTCDate()}`;
    if (aggregated[key]) {
      aggregated[key].revenue += asNumber(row.total_price);
      aggregated[key].orders += 1;
    }
  }

  return {
    data: Object.entries(aggregated)
      .map(([date, stats]) => ({ date, ...stats }))
      .reverse(),
    error: null,
  };
}

function isWorkshopItem(item: Record<string, unknown>, name: string): boolean {
  const productId = asString(item.product_id);
  return (
    productId === 'workshop-single' ||
    name.includes('커스텀') ||
    name.includes('Workshop') ||
    name.includes('Atelier') ||
    name === '커스텀 작품(Workshop)' ||
    Boolean(asString(item.user_image_url))
  );
}

export async function fetchDashboardDayReport(
  dateKey: string,
): Promise<{ data: DashboardDayReport | null; error: string | null }> {
  const window = dayWindowUtc(dateKey);
  if (!window) return { data: null, error: DASHBOARD_ERROR_MESSAGE };

  const result = await fetchAllPaidOrderRows({
    select: DAY_DETAIL_SELECT,
    startIso: window.startIso,
    endIso: window.endIso,
  });
  if (result.error) return { data: null, error: result.error };

  let totalRevenue = 0;
  const productStats: Record<string, { count: number; revenue: number; isWorkshop: boolean }> = {};

  for (const row of result.rows) {
    totalRevenue += asNumber(row.total_price);
    const items = Array.isArray(row.ordered_items) ? row.ordered_items : [];
    for (const raw of items) {
      const item = asRecord(raw);
      const name = asString(item.title) || '커스텀 작품(Workshop)';
      const quantity = asNumber(item.quantity) || 1;
      const revenue = quantity * asNumber(item.price);
      if (!productStats[name]) {
        productStats[name] = { count: 0, revenue: 0, isWorkshop: isWorkshopItem(item, name) };
      }
      productStats[name].count += quantity;
      productStats[name].revenue += revenue;
    }
  }

  const sortedItems = Object.entries(productStats)
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.revenue - a.revenue;
    });

  return {
    data: {
      date: dateKey,
      totalRevenue,
      orderCount: result.rows.length,
      topItem: sortedItems[0] ?? null,
    },
    error: null,
  };
}

export async function fetchDashboardProductCount(): Promise<{ count: number | null; error: string | null }> {
  if (!supabase) {
    return { count: null, error: DASHBOARD_ERROR_MESSAGE };
  }

  const { count, error } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true });

  if (error || count === null) {
    return { count: null, error: DASHBOARD_ERROR_MESSAGE };
  }

  return { count, error: null };
}
