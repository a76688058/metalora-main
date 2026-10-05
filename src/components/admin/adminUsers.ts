import { supabase } from '../../lib/supabase';
import { ADMIN_ORDER_STATUSES } from './adminOrders';

export const ADMIN_USERS_PAGE_SIZE = 25;

const MASKED_PHONE_FALLBACK = '***-****-****';

/** fingerprint, Auth email, and secrets stay excluded. e164 is selected only to produce a masked display string. */
export const ADMIN_USER_SELECT =
  'id, user_custom_id, full_name, phone_number, verified_phone_e164, phone_verified_at, password_login_enabled, social_login_enabled, zip_code, address, address_detail, is_admin, agreed_to_terms_at, agreed_to_privacy_at, agreed_to_cookie_at, updated_at';

export type RoleFilter = 'all' | 'member' | 'admin';
export type LoginFilter = 'all' | 'password' | 'social' | 'both' | 'none';
export type MemberLoginMethod = 'password' | 'social' | 'both' | 'none';

export type AdminMember = {
  id: string;
  user_custom_id: string;
  full_name: string;
  phone_number: string;
  masked_verified_phone: string;
  phone_verified: boolean;
  phone_verified_at: string;
  password_login_enabled: boolean;
  social_login_enabled: boolean;
  zip_code: string;
  address: string;
  address_detail: string;
  is_admin: boolean;
  agreed_to_terms_at: string;
  agreed_to_privacy_at: string;
  agreed_to_cookie_at: string;
  updated_at: string;
  order_count: number;
  order_spend: number;
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

export function sanitizeMemberSearch(raw: string): string {
  return raw.trim().replace(/[%_,.()*"'\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function memberLoginMethod(member: {
  password_login_enabled: boolean;
  social_login_enabled: boolean;
}): MemberLoginMethod {
  if (member.password_login_enabled && member.social_login_enabled) return 'both';
  if (member.password_login_enabled) return 'password';
  if (member.social_login_enabled) return 'social';
  return 'none';
}

export function memberLoginMethodLabel(method: MemberLoginMethod): string {
  if (method === 'password') return '비밀번호';
  if (method === 'social') return '소셜';
  if (method === 'both') return '비밀번호 · 소셜';
  return '미설정';
}

/** Mask KR E.164 for admin display. Never returns the full number. */
export function maskVerifiedPhoneE164(raw: string): string {
  const digits = raw.trim().replace(/\D/g, '');
  if (!digits) return MASKED_PHONE_FALLBACK;
  if (/^8210\d{8}$/.test(digits)) {
    return `010-****-${digits.slice(-4)}`;
  }
  if (/^821[16789]\d{7,8}$/.test(digits)) {
    return `0${digits.slice(2, 4)}-****-${digits.slice(-4)}`;
  }
  if (digits.length >= 4) {
    return `***-****-${digits.slice(-4)}`;
  }
  return MASKED_PHONE_FALLBACK;
}

export function memberContactDisplay(member: AdminMember): string {
  if (member.phone_verified) {
    return member.masked_verified_phone || member.phone_number || MASKED_PHONE_FALLBACK;
  }
  return member.phone_number || '—';
}

export function mapAdminMember(raw: unknown): AdminMember {
  const row = asRecord(raw);
  const phoneVerifiedAt = asString(row.phone_verified_at);
  const phoneVerified = phoneVerifiedAt.length > 0;
  const maskedVerifiedPhone = phoneVerified
    ? maskVerifiedPhoneE164(asString(row.verified_phone_e164))
    : '';
  return {
    id: asString(row.id),
    user_custom_id: asString(row.user_custom_id),
    full_name: asString(row.full_name),
    phone_number: asString(row.phone_number),
    masked_verified_phone: maskedVerifiedPhone,
    phone_verified: phoneVerified,
    phone_verified_at: phoneVerifiedAt,
    password_login_enabled: asBoolean(row.password_login_enabled),
    social_login_enabled: asBoolean(row.social_login_enabled),
    zip_code: asString(row.zip_code),
    address: asString(row.address),
    address_detail: asString(row.address_detail),
    is_admin: asBoolean(row.is_admin),
    agreed_to_terms_at: asString(row.agreed_to_terms_at),
    agreed_to_privacy_at: asString(row.agreed_to_privacy_at),
    agreed_to_cookie_at: asString(row.agreed_to_cookie_at),
    updated_at: asString(row.updated_at),
    order_count: 0,
    order_spend: 0,
  };
}

function isPaidLifecycleStatus(status: string): boolean {
  return (ADMIN_ORDER_STATUSES as readonly string[]).includes(status);
}

async function fetchMemberOrderSummaries(
  ids: string[],
): Promise<{ byUser: Map<string, { count: number; spend: number }>; error: string | null }> {
  const byUser = new Map<string, { count: number; spend: number }>();
  if (!supabase || ids.length === 0) {
    return { byUser, error: null };
  }

  const { data, error } = await supabase
    .from('orders')
    .select('user_id, total_price, status')
    .in('user_id', ids);

  if (error) {
    return { byUser, error: '회원 주문 요약을 불러오지 못했습니다.' };
  }

  for (const raw of data ?? []) {
    const row = asRecord(raw);
    const userId = asString(row.user_id);
    if (!userId || !isPaidLifecycleStatus(asString(row.status))) continue;
    const current = byUser.get(userId) ?? { count: 0, spend: 0 };
    current.count += 1;
    current.spend += asNumber(row.total_price);
    byUser.set(userId, current);
  }

  return { byUser, error: null };
}

export async function fetchAdminMembers(params: {
  page: number;
  search: string;
  role: RoleFilter;
  login: LoginFilter;
}): Promise<{ data: AdminMember[]; count: number; error: string | null }> {
  if (!supabase) {
    return { data: [], count: 0, error: '회원 목록을 불러오지 못했습니다.' };
  }

  const from = Math.max(0, params.page) * ADMIN_USERS_PAGE_SIZE;
  const to = from + ADMIN_USERS_PAGE_SIZE - 1;
  let query = supabase
    .from('profiles')
    .select(ADMIN_USER_SELECT, { count: 'exact' })
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false });

  if (params.role === 'admin') {
    query = query.eq('is_admin', true);
  } else if (params.role === 'member') {
    query = query.eq('is_admin', false);
  }

  if (params.login === 'password') {
    query = query.eq('password_login_enabled', true).eq('social_login_enabled', false);
  } else if (params.login === 'social') {
    query = query.eq('password_login_enabled', false).eq('social_login_enabled', true);
  } else if (params.login === 'both') {
    query = query.eq('password_login_enabled', true).eq('social_login_enabled', true);
  } else if (params.login === 'none') {
    query = query.eq('password_login_enabled', false).eq('social_login_enabled', false);
  }

  const search = sanitizeMemberSearch(params.search);
  if (search) {
    const term = `%${search}%`;
    query = query.or(
      [
        `user_custom_id.ilike."${term}"`,
        `phone_number.ilike."${term}"`,
        `full_name.ilike."${term}"`,
      ].join(','),
    );
  }

  const { data, error, count } = await query.range(from, to);
  if (error) {
    return { data: [], count: 0, error: '회원 목록을 불러오지 못했습니다.' };
  }

  const members = (data ?? []).map(mapAdminMember);
  const { byUser, error: orderError } = await fetchMemberOrderSummaries(members.map((member) => member.id));
  if (orderError) {
    return { data: [], count: 0, error: orderError };
  }

  return {
    data: members.map((member) => {
      const summary = byUser.get(member.id);
      return {
        ...member,
        order_count: summary?.count ?? 0,
        order_spend: summary?.spend ?? 0,
      };
    }),
    count: typeof count === 'number' ? count : 0,
    error: null,
  };
}
