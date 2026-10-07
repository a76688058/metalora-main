import { supabase } from '../../lib/supabase';
import { getFullImageUrl } from '../../lib/utils';
import { workshopOrderItemThumbRef } from '../../lib/workshopMediaDisplay';
import { workshopDisplayApi } from '../../hooks/useWorkshopMediaDisplay';

export const ADMIN_ORDER_STATUSES = ['PAID', 'PRODUCTION', 'SHIPPING', 'COMPLETED'] as const;
export type AdminOrderStatus = (typeof ADMIN_ORDER_STATUSES)[number];

export const ADMIN_ORDER_STATUS_LABEL: Record<AdminOrderStatus, string> = {
  PAID: '결제확인',
  PRODUCTION: '제작/검수 중',
  SHIPPING: '배송 중',
  COMPLETED: '배송완료',
};

export const ADMIN_ORDER_NEXT_STATUS: Record<AdminOrderStatus, AdminOrderStatus | null> = {
  PAID: 'PRODUCTION',
  PRODUCTION: 'SHIPPING',
  SHIPPING: 'COMPLETED',
  COMPLETED: null,
};

export const ADMIN_ORDER_NEXT_ACTION_LABEL: Record<AdminOrderStatus, string | null> = {
  PAID: '제작/검수 시작',
  PRODUCTION: '배송 시작',
  SHIPPING: '배송완료 처리',
  COMPLETED: null,
};

export function isCanonicalOrderStatus(status: string): status is AdminOrderStatus {
  return (ADMIN_ORDER_STATUSES as readonly string[]).includes(status);
}

export function nextOrderStatus(status: string): AdminOrderStatus | null {
  if (!isCanonicalOrderStatus(status)) return null;
  return ADMIN_ORDER_NEXT_STATUS[status];
}

export function nextOrderActionLabel(status: string): string | null {
  if (!isCanonicalOrderStatus(status)) return null;
  return ADMIN_ORDER_NEXT_ACTION_LABEL[status];
}

export function isAllowedOrderTransition(from: string, to: string): boolean {
  const next = nextOrderStatus(from);
  return next !== null && next === to;
}

export function orderStatusLabel(status: string): string {
  if (isCanonicalOrderStatus(status)) return ADMIN_ORDER_STATUS_LABEL[status];
  return '알 수 없는 상태';
}

export const ADMIN_ORDERS_PAGE_SIZE = 25;

export const ADMIN_ORDER_SELECT =
  'id, order_number, created_at, status, total_price, shipping_name, shipping_phone, address, address_detail, zip_code, courier, tracking_number, ordered_items, method';

export type DateFilter = 'all' | 'today' | '7d' | '30d';
export type StatusFilter = 'all' | AdminOrderStatus;

export type AdminOrderItem = {
  title: string;
  option: string;
  quantity: number;
  price: number | null;
  /** Catalog: public image URL. Workshop: durable ref (canonical path or legacy URL) for the resolver. */
  imageUrl: string | null;
  orientation: string | null;
  isWorkshop: boolean;
};

export type AdminOrder = {
  id: string;
  order_number: string;
  created_at: string;
  status: string;
  total_price: number;
  shipping_name: string;
  shipping_phone: string;
  address: string;
  address_detail: string;
  zip_code: string;
  courier: string;
  tracking_number: string;
  method: string;
  items: AdminOrderItem[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function mapAdminOrderItem(raw: unknown): AdminOrderItem {
  const item = asRecord(raw);
  const productId = asString(item.product_id);
  const isWorkshop = productId === 'workshop-single' || productId === '' || item.product_id == null;
  const imagePath = isWorkshop
    ? workshopOrderItemThumbRef(item, workshopDisplayApi)
    : asString(item.image) ||
      asString(item.user_image_url) ||
      asString(item.front_image) ||
      asString(item.custom_image) ||
      asString(item.preview_url) ||
      '';
  return {
    title: asString(item.title) || asString(item.product_title) || asString(item.name) || '제품',
    option: asString(item.option) || asString(item.selected_option) || '',
    quantity: asNumber(item.quantity) ?? 0,
    price: asNumber(item.price),
    imageUrl: isWorkshop ? imagePath || null : imagePath ? getFullImageUrl(imagePath) : null,
    orientation: asString(item.orientation) || null,
    isWorkshop,
  };
}

export function mapAdminOrder(raw: unknown): AdminOrder {
  const row = asRecord(raw);
  const items = Array.isArray(row.ordered_items) ? row.ordered_items.map(mapAdminOrderItem) : [];
  return {
    id: asString(row.id),
    order_number: asString(row.order_number),
    created_at: asString(row.created_at),
    status: asString(row.status),
    total_price: asNumber(row.total_price) ?? 0,
    shipping_name: asString(row.shipping_name),
    shipping_phone: asString(row.shipping_phone),
    address: asString(row.address),
    address_detail: asString(row.address_detail),
    zip_code: asString(row.zip_code),
    courier: asString(row.courier),
    tracking_number: asString(row.tracking_number),
    method: asString(row.method),
    items,
  };
}

export function sanitizeOrderSearch(raw: string): string {
  return raw.trim().replace(/[%_,.()*"'\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function dateFilterStartIso(filter: DateFilter): string | null {
  if (filter === 'all') return null;
  const now = new Date();
  if (filter === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  }
  const days = filter === '7d' ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function itemSummary(order: AdminOrder): string {
  const first = order.items[0];
  if (!first) return '상품 없음';
  if (order.items.length === 1) return `${first.title}${first.quantity > 1 ? ` ×${first.quantity}` : ''}`;
  return `${first.title} 외 ${order.items.length - 1}건`;
}

export async function fetchAdminOrders(params: {
  page: number;
  search: string;
  status: StatusFilter;
  date: DateFilter;
}): Promise<{ data: AdminOrder[]; count: number; error: string | null }> {
  if (!supabase) {
    return { data: [], count: 0, error: '주문 목록을 불러오지 못했습니다.' };
  }

  const from = Math.max(0, params.page) * ADMIN_ORDERS_PAGE_SIZE;
  const to = from + ADMIN_ORDERS_PAGE_SIZE - 1;
  let query = supabase
    .from('orders')
    .select(ADMIN_ORDER_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (params.status !== 'all') {
    query = query.eq('status', params.status);
  }

  const since = dateFilterStartIso(params.date);
  if (since) {
    query = query.gte('created_at', since);
  }

  const search = sanitizeOrderSearch(params.search);
  if (search) {
    const term = `%${search}%`;
    query = query.or(
      [
        `order_number.ilike."${term}"`,
        `shipping_name.ilike."${term}"`,
        `shipping_phone.ilike."${term}"`,
        `tracking_number.ilike."${term}"`,
      ].join(','),
    );
  }

  const { data, error, count } = await query.range(from, to);
  if (error) {
    return { data: [], count: 0, error: '주문 목록을 불러오지 못했습니다.' };
  }

  return {
    data: (data ?? []).map(mapAdminOrder),
    count: typeof count === 'number' ? count : 0,
    error: null,
  };
}
