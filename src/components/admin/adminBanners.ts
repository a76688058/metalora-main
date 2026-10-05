import { supabase } from '../../lib/supabase';

export const ADMIN_BANNER_SELECT = 'id, content, is_active, display_order, created_at';

export const ADMIN_BANNERS_ERROR = '배너 목록을 불러오지 못했습니다.';
export const ADMIN_BANNER_SAVE_ERROR = '순서 저장 중 오류가 발생했습니다.';
export const ADMIN_BANNER_CREATE_ERROR = '배너 추가 중 오류가 발생했습니다.';
export const ADMIN_BANNER_DELETE_ERROR = '배너 삭제 중 오류가 발생했습니다.';
export const ADMIN_BANNER_TOGGLE_ERROR = '상태 변경 중 오류가 발생했습니다.';

export type AdminBanner = {
  id: string;
  content: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function mapAdminBanner(raw: unknown): AdminBanner {
  const row = asRecord(raw);
  return {
    id: asString(row.id),
    content: asString(row.content),
    is_active: asBoolean(row.is_active),
    display_order: asNumber(row.display_order),
    created_at: asString(row.created_at),
  };
}

export function nextBannerDisplayOrder(banners: AdminBanner[]): number {
  if (banners.length === 0) return 0;
  return Math.max(...banners.map((banner) => banner.display_order)) + 1;
}

export async function fetchAdminBanners(): Promise<{ data: AdminBanner[]; error: string | null }> {
  if (!supabase) {
    return { data: [], error: ADMIN_BANNERS_ERROR };
  }

  const { data, error } = await supabase
    .from('banners')
    .select(ADMIN_BANNER_SELECT)
    .order('display_order', { ascending: true });

  if (error) {
    return { data: [], error: ADMIN_BANNERS_ERROR };
  }

  return { data: (data ?? []).map(mapAdminBanner), error: null };
}

export async function createAdminBanner(params: {
  content: string;
  displayOrder: number;
}): Promise<{ data: AdminBanner | null; error: string | null }> {
  if (!supabase) {
    return { data: null, error: ADMIN_BANNER_CREATE_ERROR };
  }

  const { data, error } = await supabase
    .from('banners')
    .insert({
      content: params.content,
      is_active: true,
      display_order: params.displayOrder,
    })
    .select(ADMIN_BANNER_SELECT)
    .maybeSingle();

  if (error || !data) {
    return { data: null, error: ADMIN_BANNER_CREATE_ERROR };
  }

  return { data: mapAdminBanner(data), error: null };
}

export async function deleteAdminBanner(id: string): Promise<{ ok: boolean; error: string | null }> {
  if (!supabase) {
    return { ok: false, error: ADMIN_BANNER_DELETE_ERROR };
  }

  const { data, error } = await supabase.from('banners').delete().eq('id', id).select('id');
  if (error || !data || data.length === 0) {
    return { ok: false, error: ADMIN_BANNER_DELETE_ERROR };
  }
  return { ok: true, error: null };
}

export async function updateBannerActive(
  id: string,
  isActive: boolean,
): Promise<{ ok: boolean; error: string | null }> {
  if (!supabase) {
    return { ok: false, error: ADMIN_BANNER_TOGGLE_ERROR };
  }

  const { data, error } = await supabase
    .from('banners')
    .update({ is_active: isActive })
    .eq('id', id)
    .select('id');

  if (error || !data || data.length === 0) {
    return { ok: false, error: ADMIN_BANNER_TOGGLE_ERROR };
  }
  return { ok: true, error: null };
}

export async function saveBannerDisplayOrder(
  items: Array<{ id: string; display_order: number }>,
): Promise<{ ok: boolean; error: string | null }> {
  if (!supabase) {
    return { ok: false, error: ADMIN_BANNER_SAVE_ERROR };
  }

  const client = supabase;
  const results = await Promise.all(
    items.map((item) =>
      client
        .from('banners')
        .update({ display_order: item.display_order })
        .eq('id', item.id),
    ),
  );

  if (results.some((result) => result.error)) {
    return { ok: false, error: ADMIN_BANNER_SAVE_ERROR };
  }
  return { ok: true, error: null };
}
