import { supabase } from '../../lib/supabase';

export const ADMIN_CS_PAGE_SIZE = 25;

export const ADMIN_CS_SELECT = 'id, user_id, title, content, answer, status, created_at';

export const CS_PENDING_STATUSES = ['pending', '답변대기'] as const;
export const CS_ANSWERED_STATUS = '답변완료';

export type CsStatusClass = 'pending' | 'answered' | 'unknown';
export type CsStatusFilter = 'all' | 'pending' | 'answered';

export type AdminInquiry = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  answer: string;
  status: string;
  created_at: string;
  author_label: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

export function sanitizeCsSearch(raw: string): string {
  return raw.trim().replace(/[%_,.()*"'\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function classifyCsStatus(status: string): CsStatusClass {
  if (status === CS_ANSWERED_STATUS) return 'answered';
  if ((CS_PENDING_STATUSES as readonly string[]).includes(status)) return 'pending';
  return 'unknown';
}

export function csStatusLabel(status: string): string {
  const kind = classifyCsStatus(status);
  if (kind === 'answered') return '답변완료';
  if (kind === 'pending') return '미답변';
  return '알 수 없는 상태';
}

export function shortUserId(userId: string): string {
  if (!userId) return '—';
  if (userId.length <= 10) return userId;
  return `${userId.slice(0, 8)}…`;
}

export function mapAdminInquiry(raw: unknown): AdminInquiry {
  const row = asRecord(raw);
  return {
    id: asString(row.id),
    user_id: asString(row.user_id),
    title: asString(row.title),
    content: asString(row.content),
    answer: asString(row.answer),
    status: asString(row.status),
    created_at: asString(row.created_at),
    author_label: '',
  };
}

async function fetchAuthorLabels(ids: string[]): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  if (!supabase || ids.length === 0) return labels;
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) return labels;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, user_custom_id')
    .in('id', uniqueIds);
  if (error || !data) return labels;
  for (const raw of data) {
    const row = asRecord(raw);
    const id = asString(row.id);
    const username = asString(row.user_custom_id).trim();
    if (id && username) labels.set(id, username);
  }
  return labels;
}

export async function fetchAdminInquiries(params: {
  page: number;
  search: string;
  status: CsStatusFilter;
}): Promise<{ data: AdminInquiry[]; count: number; error: string | null }> {
  if (!supabase) {
    return { data: [], count: 0, error: '문의 목록을 불러오지 못했습니다.' };
  }

  const from = Math.max(0, params.page) * ADMIN_CS_PAGE_SIZE;
  const to = from + ADMIN_CS_PAGE_SIZE - 1;
  let query = supabase
    .from('cs_inquiries')
    .select(ADMIN_CS_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (params.status === 'pending') {
    query = query.in('status', [...CS_PENDING_STATUSES]);
  } else if (params.status === 'answered') {
    query = query.eq('status', CS_ANSWERED_STATUS);
  }

  const search = sanitizeCsSearch(params.search);
  if (search) {
    const term = `%${search}%`;
    query = query.or(
      [
        `title.ilike."${term}"`,
        `content.ilike."${term}"`,
      ].join(','),
    );
  }

  const { data, error, count } = await query.range(from, to);
  if (error) {
    return { data: [], count: 0, error: '문의 목록을 불러오지 못했습니다.' };
  }

  const inquiries = (data ?? []).map(mapAdminInquiry);
  const labels = await fetchAuthorLabels(inquiries.map((inquiry) => inquiry.user_id));

  return {
    data: inquiries.map((inquiry) => ({
      ...inquiry,
      author_label: labels.get(inquiry.user_id) || '',
    })),
    count: typeof count === 'number' ? count : 0,
    error: null,
  };
}
