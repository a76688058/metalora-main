import { supabase } from '../../lib/supabase';
import type { Product } from '../../data/products';

export const ADMIN_CATALOG_SELECT =
  'id, title, subtitle, front_image, back_image, landscape_image, landscape_back_image, supported_orientations, description, is_limited, is_visible, options, created_at, display_order';

export type AdminCatalogProduct = Product & {
  display_order: number;
  created_at?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function mapAdminCatalogProduct(raw: unknown): AdminCatalogProduct {
  const item = asRecord(raw);
  const options = Array.isArray(item.options) ? item.options : [];
  const first = options[0];
  const firstPrice =
    first && typeof first === 'object' && typeof (first as { price?: unknown }).price === 'number'
      ? (first as { price: number }).price
      : 0;
  const title = typeof item.title === 'string' ? item.title : '';
  const subtitle = typeof item.subtitle === 'string' ? item.subtitle : '';
  const front = typeof item.front_image === 'string' ? item.front_image : '';
  return {
    ...(item as unknown as Product),
    id: typeof item.id === 'string' ? item.id : '',
    title,
    subtitle,
    artist: subtitle,
    description: typeof item.description === 'string' ? item.description : '',
    front_image: front,
    image: front,
    limited: item.is_limited === true,
    is_visible: item.is_visible !== false,
    options: options as Product['options'],
    price: firstPrice,
    display_order: typeof item.display_order === 'number' ? item.display_order : 0,
    created_at: typeof item.created_at === 'string' ? item.created_at : undefined,
  };
}

export function sortAdminCatalog(products: AdminCatalogProduct[]): AdminCatalogProduct[] {
  return [...products].sort((a, b) => {
    const orderA = a.display_order ?? 0;
    const orderB = b.display_order ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    const createdA = a.created_at ?? '';
    const createdB = b.created_at ?? '';
    if (createdA !== createdB) return createdA.localeCompare(createdB);
    return a.id.localeCompare(b.id);
  });
}

export async function fetchAdminCatalog(): Promise<{ data: AdminCatalogProduct[]; error: string | null }> {
  if (!supabase) {
    return { data: [], error: '상품 목록을 불러오지 못했습니다.' };
  }

  const { data, error } = await supabase
    .from('products')
    .select(ADMIN_CATALOG_SELECT)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (error) {
    return { data: [], error: '상품 목록을 불러오지 못했습니다.' };
  }

  return {
    data: sortAdminCatalog((data ?? []).map(mapAdminCatalogProduct)),
    error: null,
  };
}

export function catalogListPrice(product: AdminCatalogProduct): number {
  const prices = (product.options ?? [])
    .map((option) => option.price)
    .filter((price): price is number => typeof price === 'number');
  if (prices.length === 0) return typeof product.price === 'number' ? product.price : 0;
  return Math.min(...prices);
}
