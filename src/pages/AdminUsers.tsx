import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Search, X } from 'lucide-react';
import AdminLayout from '../components/admin/AdminLayout';
import {
  ADMIN_USERS_PAGE_SIZE,
  fetchAdminMembers,
  memberContactDisplay,
  memberLoginMethod,
  memberLoginMethodLabel,
  type AdminMember,
  type LoginFilter,
  type RoleFilter,
} from '../components/admin/adminUsers';
import { cn } from '../lib/cn';

const ROLE_FILTERS: { value: RoleFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'member', label: '일반 회원' },
  { value: 'admin', label: '관리자' },
];

const LOGIN_FILTERS: { value: LoginFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'password', label: '비밀번호' },
  { value: 'social', label: '소셜' },
  { value: 'both', label: '비밀번호 · 소셜' },
  { value: 'none', label: '미설정' },
];

function formatDateTime(iso: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function formatPrice(amount: number): string {
  return `₩${amount.toLocaleString('ko-KR')}`;
}

function memberDisplayName(member: AdminMember): string {
  return member.user_custom_id || '아이디 없음';
}

function RoleBadge({ isAdmin }: { isAdmin: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        isAdmin ? 'bg-zinc-200 text-zinc-900' : 'bg-zinc-800 text-zinc-200',
      )}
    >
      {isAdmin ? '관리자' : '일반 회원'}
    </span>
  );
}

function PhoneVerifiedBadge({ verified }: { verified: boolean }) {
  return (
    <span className="inline-flex items-center rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-300 whitespace-nowrap">
      {verified ? '휴대폰 인증' : '미인증'}
    </span>
  );
}

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <div className="text-sm text-zinc-200">{children}</div>
    </div>
  );
}

export default function AdminUsers() {
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [loginFilter, setLoginFilter] = useState<LoginFilter>('all');
  const [selectedMember, setSelectedMember] = useState<AdminMember | null>(null);
  const lastOpenerRef = useRef<HTMLElement | null>(null);
  const requestGenRef = useRef(0);

  const filtersActive = Boolean(debouncedSearch) || roleFilter !== 'all' || loginFilter !== 'all';
  const pageCount = Math.max(1, Math.ceil(count / ADMIN_USERS_PAGE_SIZE));

  const loadMembers = useCallback(async () => {
    const generation = ++requestGenRef.current;
    setLoadState('loading');
    const { data, count: nextCount, error } = await fetchAdminMembers({
      page,
      search: debouncedSearch,
      role: roleFilter,
      login: loginFilter,
    });
    if (generation !== requestGenRef.current) return;
    if (error) {
      setMembers([]);
      setCount(0);
      setLoadState('error');
      return;
    }
    setMembers(data);
    setCount(nextCount);
    setLoadState('ready');
  }, [page, debouncedSearch, roleFilter, loginFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, roleFilter, loginFilter]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    return () => {
      requestGenRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!selectedMember) return;
    const latest = members.find((member) => member.id === selectedMember.id);
    if (latest) setSelectedMember(latest);
  }, [members, selectedMember?.id]);

  const closeDetail = useCallback(() => {
    setSelectedMember(null);
    lastOpenerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!selectedMember) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDetail();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeDetail, selectedMember]);

  const openDetail = (member: AdminMember, opener?: HTMLElement | null) => {
    lastOpenerRef.current = opener ?? null;
    setSelectedMember(member);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-white">
          회원 관리
          {loadState === 'ready' && (
            <span className="ml-2 text-sm font-normal text-zinc-500">{count}</span>
          )}
        </h2>

        <div className="flex flex-col gap-3 md:flex-row md:items-end bg-zinc-900 p-4 rounded-xl border border-zinc-800">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} aria-hidden="true" />
            <label htmlFor="admin-user-search" className="sr-only">회원 검색</label>
            <input
              id="admin-user-search"
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="아이디, 연락처, 이름"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-10 pr-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 placeholder:text-zinc-600"
            />
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <div>
              <label htmlFor="admin-user-role-filter" className="block text-xs text-zinc-500 mb-1">회원 구분</label>
              <select
                id="admin-user-role-filter"
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}
                className="h-11 min-w-[9.5rem] bg-zinc-800 border border-zinc-700 rounded-lg px-3 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                {ROLE_FILTERS.map((filter) => (
                  <option key={filter.value} value={filter.value}>{filter.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="admin-user-login-filter" className="block text-xs text-zinc-500 mb-1">로그인 방식</label>
              <select
                id="admin-user-login-filter"
                value={loginFilter}
                onChange={(event) => setLoginFilter(event.target.value as LoginFilter)}
                className="h-11 min-w-[9.5rem] bg-zinc-800 border border-zinc-700 rounded-lg px-3 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                {LOGIN_FILTERS.map((filter) => (
                  <option key={filter.value} value={filter.value}>{filter.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {loadState === 'loading' && (
          <div className="py-16 flex flex-col items-center gap-3 text-zinc-500" aria-busy="true">
            <Loader2 className="animate-spin" size={22} aria-hidden="true" />
            <p className="text-sm">회원 목록을 불러오는 중</p>
          </div>
        )}

        {loadState === 'error' && (
          <div className="py-16 text-center bg-zinc-900 rounded-xl border border-zinc-800">
            <p className="text-white font-medium">회원 목록을 불러오지 못했습니다.</p>
            <button type="button" onClick={() => { void loadMembers(); }} className="mt-4 min-h-11 px-4 rounded-lg bg-zinc-800 text-white">
              다시 시도
            </button>
          </div>
        )}

        {loadState === 'ready' && count === 0 && !filtersActive && (
          <div className="py-16 text-center bg-zinc-900 rounded-xl border border-dashed border-white/10">
            <p className="text-white font-medium">등록된 회원이 없습니다.</p>
          </div>
        )}

        {loadState === 'ready' && count === 0 && filtersActive && (
          <div className="py-16 text-center bg-zinc-900 rounded-xl border border-dashed border-white/10">
            <p className="text-white font-medium">검색 결과가 없습니다.</p>
          </div>
        )}

        {loadState === 'ready' && members.length > 0 && (
          <>
            <div className="hidden md:block rounded-xl border border-zinc-800">
              <table className="w-full table-fixed text-left text-sm">
                <colgroup>
                  <col className="w-[22%]" />
                  <col className="w-[16%]" />
                  <col className="w-[16%]" />
                  <col className="w-[14%]" />
                  <col className="w-[20%]" />
                  <col className="w-[12%]" />
                </colgroup>
                <thead className="bg-zinc-900 text-zinc-400">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">회원</th>
                    <th className="px-3 py-2.5 font-medium">연락처</th>
                    <th className="px-3 py-2.5 font-medium">로그인 방식</th>
                    <th className="px-3 py-2.5 font-medium">관리자 여부</th>
                    <th className="px-3 py-2.5 font-medium">주문 요약</th>
                    <th className="px-3 py-2.5 font-medium"><span className="sr-only">상세</span></th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.id} className="border-t border-zinc-800/80 bg-zinc-950 align-middle">
                      <td className="px-3 py-2.5 min-w-0">
                        <p className="text-white font-medium truncate">{memberDisplayName(member)}</p>
                        {member.full_name ? <p className="text-xs text-zinc-500 truncate">{member.full_name}</p> : null}
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-zinc-200 truncate">{memberContactDisplay(member)}</p>
                        <p className="mt-1"><PhoneVerifiedBadge verified={member.phone_verified} /></p>
                      </td>
                      <td className="px-3 py-2.5 text-zinc-300 whitespace-nowrap">
                        {memberLoginMethodLabel(memberLoginMethod(member))}
                      </td>
                      <td className="px-3 py-2.5"><RoleBadge isAdmin={member.is_admin} /></td>
                      <td className="px-3 py-2.5 text-zinc-300">
                        <p className="whitespace-nowrap">{member.order_count}건</p>
                        <p className="text-xs text-zinc-500 tabular-nums">{formatPrice(member.order_spend)}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          className="min-h-11 text-sm text-zinc-400 hover:text-white whitespace-nowrap"
                          onClick={(event) => openDetail(member, event.currentTarget)}
                        >
                          상세 보기
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden space-y-3">
              {members.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={(event) => openDetail(member, event.currentTarget)}
                  className="w-full text-left bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-white truncate">{memberDisplayName(member)}</p>
                      {member.full_name ? <p className="text-xs text-zinc-500 truncate">{member.full_name}</p> : null}
                    </div>
                    <RoleBadge isAdmin={member.is_admin} />
                  </div>
                  <p className="text-sm text-zinc-300">{memberContactDisplay(member)}</p>
                  <p className="mt-1"><PhoneVerifiedBadge verified={member.phone_verified} /></p>
                  <p className="text-xs text-zinc-500">
                    {memberLoginMethodLabel(memberLoginMethod(member))} · {member.order_count}건 · {formatPrice(member.order_spend)}
                  </p>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-zinc-500">
                {count === 0 ? '0' : `${page * ADMIN_USERS_PAGE_SIZE + 1}–${Math.min(count, (page + 1) * ADMIN_USERS_PAGE_SIZE)}`} / {count}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  aria-label="이전 페이지"
                  disabled={page <= 0}
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                  className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg bg-zinc-800 text-white disabled:opacity-40"
                >
                  <ChevronLeft size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="다음 페이지"
                  disabled={page + 1 >= pageCount}
                  onClick={() => setPage((current) => current + 1)}
                  className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg bg-zinc-800 text-white disabled:opacity-40"
                >
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {selectedMember && (
        <div className="fixed inset-0 z-[100] flex items-stretch md:items-center justify-end md:justify-center bg-black/80">
          <button type="button" className="absolute inset-0" aria-label="회원 상세 닫기" onClick={closeDetail} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-user-detail-title"
            className="relative z-10 w-full md:max-w-xl h-full md:h-auto md:max-h-[92vh] bg-[#1C1C1E] border-l md:border border-white/10 md:rounded-2xl overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-3 p-5 border-b border-white/5">
              <div>
                <h3 id="admin-user-detail-title" className="text-lg font-bold text-white">회원 상세</h3>
                <p className="text-sm text-zinc-400 mt-1">{memberDisplayName(selectedMember)}</p>
              </div>
              <button type="button" onClick={closeDetail} aria-label="닫기" className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg bg-white/5 text-zinc-300">
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="p-5 space-y-6">
              <section className="grid grid-cols-2 gap-3">
                <DetailField label="아이디">{selectedMember.user_custom_id || '—'}</DetailField>
                <DetailField label="이름">{selectedMember.full_name || '—'}</DetailField>
                <DetailField label="관리자 여부"><RoleBadge isAdmin={selectedMember.is_admin} /></DetailField>
                <DetailField label="로그인 방식">{memberLoginMethodLabel(memberLoginMethod(selectedMember))}</DetailField>
              </section>

              <section className="space-y-3">
                <h4 className="text-sm font-medium text-white">연락처</h4>
                <DetailField label="전화번호">{memberContactDisplay(selectedMember)}</DetailField>
                <DetailField label="휴대폰 인증">
                  {selectedMember.phone_verified
                    ? `인증됨${selectedMember.phone_verified_at ? ` · ${formatDateTime(selectedMember.phone_verified_at)}` : ''}`
                    : '미인증'}
                </DetailField>
              </section>

              <section className="space-y-3">
                <h4 className="text-sm font-medium text-white">주소</h4>
                <DetailField label="우편번호">{selectedMember.zip_code || '—'}</DetailField>
                <DetailField label="주소">
                  {[selectedMember.address, selectedMember.address_detail].filter(Boolean).join(' ') || '—'}
                </DetailField>
              </section>

              <section className="space-y-3">
                <h4 className="text-sm font-medium text-white">주문 요약</h4>
                <p className="text-sm text-zinc-200">{selectedMember.order_count}건 · {formatPrice(selectedMember.order_spend)}</p>
                <p className="text-xs text-zinc-500">결제확인 이후 주문만 합산합니다. 프로필 누적금액은 사용하지 않습니다.</p>
              </section>

              <section className="grid grid-cols-2 gap-3">
                <DetailField label="최근 수정">{formatDateTime(selectedMember.updated_at)}</DetailField>
                <DetailField label="약관 동의">{formatDateTime(selectedMember.agreed_to_terms_at)}</DetailField>
                <DetailField label="개인정보 동의">{formatDateTime(selectedMember.agreed_to_privacy_at)}</DetailField>
                <DetailField label="쿠키 동의">{formatDateTime(selectedMember.agreed_to_cookie_at)}</DetailField>
              </section>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
