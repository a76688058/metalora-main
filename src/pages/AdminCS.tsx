import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Search, X } from 'lucide-react';
import AdminLayout from '../components/admin/AdminLayout';
import {
  ADMIN_CS_PAGE_SIZE,
  CS_ANSWERED_STATUS,
  classifyCsStatus,
  csStatusLabel,
  fetchAdminInquiries,
  shortUserId,
  type AdminInquiry,
  type CsStatusFilter,
} from '../components/admin/adminCs';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/cn';

const STATUS_FILTERS: { value: CsStatusFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'pending', label: '미답변' },
  { value: 'answered', label: '답변완료' },
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

function formatDateCompact(iso: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('ko-KR', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function authorDisplay(inquiry: AdminInquiry): string {
  return inquiry.author_label || shortUserId(inquiry.user_id);
}

function StatusBadge({ status }: { status: string }) {
  const kind = classifyCsStatus(status);
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        kind === 'answered' ? 'bg-zinc-200 text-zinc-900' : 'bg-zinc-800 text-zinc-200',
      )}
    >
      {csStatusLabel(status)}
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

export default function AdminCS() {
  const { showToast } = useToast();
  const [inquiries, setInquiries] = useState<AdminInquiry[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CsStatusFilter>('all');
  const [selectedInquiry, setSelectedInquiry] = useState<AdminInquiry | null>(null);
  const [answerDraft, setAnswerDraft] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const lastOpenerRef = useRef<HTMLElement | null>(null);
  const requestGenRef = useRef(0);
  const mountedRef = useRef(true);

  const filtersActive = Boolean(debouncedSearch) || statusFilter !== 'all';
  const pageCount = Math.max(1, Math.ceil(count / ADMIN_CS_PAGE_SIZE));
  const selectedClass = selectedInquiry ? classifyCsStatus(selectedInquiry.status) : null;
  const canMutateAnswer = selectedClass === 'pending' || selectedClass === 'answered';

  const loadInquiries = useCallback(async () => {
    const generation = ++requestGenRef.current;
    setLoadState('loading');
    const { data, count: nextCount, error } = await fetchAdminInquiries({
      page,
      search: debouncedSearch,
      status: statusFilter,
    });
    if (generation !== requestGenRef.current) return;
    if (error) {
      setInquiries([]);
      setCount(0);
      setLoadState('error');
      return;
    }
    setInquiries(data);
    setCount(nextCount);
    setLoadState('ready');
  }, [page, debouncedSearch, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, statusFilter]);

  useEffect(() => {
    void loadInquiries();
  }, [loadInquiries]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestGenRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!selectedInquiry) return;
    const latest = inquiries.find((inquiry) => inquiry.id === selectedInquiry.id);
    if (latest) setSelectedInquiry(latest);
  }, [inquiries, selectedInquiry?.id]);

  const closeDetail = useCallback(() => {
    if (isSubmitting) return;
    setSelectedInquiry(null);
    setAnswerDraft('');
    setSaveError(null);
    lastOpenerRef.current?.focus();
  }, [isSubmitting]);

  useEffect(() => {
    if (!selectedInquiry) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDetail();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeDetail, selectedInquiry]);

  const openDetail = (inquiry: AdminInquiry, opener?: HTMLElement | null) => {
    lastOpenerRef.current = opener ?? null;
    setSelectedInquiry(inquiry);
    setAnswerDraft(inquiry.answer);
    setSaveError(null);
  };

  const applyLocalInquiry = (inquiryId: string, patch: Partial<AdminInquiry>) => {
    setInquiries((current) => current.map((inquiry) => (
      inquiry.id === inquiryId ? { ...inquiry, ...patch } : inquiry
    )));
    setSelectedInquiry((current) => (
      current?.id === inquiryId ? { ...current, ...patch } : current
    ));
  };

  const saveAnswer = async () => {
    if (!selectedInquiry || isSubmitting || !canMutateAnswer) return;
    const answer = answerDraft.trim();
    if (!answer) {
      setSaveError('답변을 입력해 주세요.');
      return;
    }
    setIsSubmitting(true);
    setSaveError(null);
    const { error } = await supabase
      .from('cs_inquiries')
      .update({ answer, status: CS_ANSWERED_STATUS })
      .eq('id', selectedInquiry.id);
    if (!mountedRef.current) return;
    setIsSubmitting(false);
    if (error) {
      setSaveError('답변을 저장하지 못했습니다.');
      showToast('답변을 저장하지 못했습니다.', 'error');
      return;
    }
    applyLocalInquiry(selectedInquiry.id, { answer, status: CS_ANSWERED_STATUS });
    showToast('답변이 저장되었습니다.', 'success');
    void loadInquiries();
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-white">
          고객 문의
          {loadState === 'ready' && (
            <span className="ml-2 text-sm font-normal text-zinc-500">{count}</span>
          )}
        </h2>

        <div className="flex flex-col gap-3 md:flex-row md:items-end bg-zinc-900 p-4 rounded-xl border border-zinc-800">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} aria-hidden="true" />
            <label htmlFor="admin-cs-search" className="sr-only">문의 검색</label>
            <input
              id="admin-cs-search"
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="제목, 내용"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-10 pr-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 placeholder:text-zinc-600"
            />
          </div>
          <div>
            <label htmlFor="admin-cs-status-filter" className="block text-xs text-zinc-500 mb-1">상태</label>
            <select
              id="admin-cs-status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as CsStatusFilter)}
              className="h-11 min-w-[9.5rem] bg-zinc-800 border border-zinc-700 rounded-lg px-3 text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              {STATUS_FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>{filter.label}</option>
              ))}
            </select>
          </div>
        </div>

        {loadState === 'loading' && (
          <div className="py-16 flex flex-col items-center gap-3 text-zinc-500" aria-busy="true">
            <Loader2 className="animate-spin" size={22} aria-hidden="true" />
            <p className="text-sm">문의 목록을 불러오는 중</p>
          </div>
        )}

        {loadState === 'error' && (
          <div className="py-16 text-center bg-zinc-900 rounded-xl border border-zinc-800">
            <p className="text-white font-medium">문의 목록을 불러오지 못했습니다.</p>
            <button type="button" onClick={() => { void loadInquiries(); }} className="mt-4 min-h-11 px-4 rounded-lg bg-zinc-800 text-white">
              다시 시도
            </button>
          </div>
        )}

        {loadState === 'ready' && count === 0 && !filtersActive && (
          <div className="py-16 text-center bg-zinc-900 rounded-xl border border-dashed border-white/10">
            <p className="text-white font-medium">문의가 없습니다.</p>
          </div>
        )}

        {loadState === 'ready' && count === 0 && filtersActive && (
          <div className="py-16 text-center bg-zinc-900 rounded-xl border border-dashed border-white/10">
            <p className="text-white font-medium">검색 결과가 없습니다.</p>
          </div>
        )}

        {loadState === 'ready' && inquiries.length > 0 && (
          <>
            <div className="hidden md:block rounded-xl border border-zinc-800">
              <table className="w-full table-fixed text-left text-sm">
                <colgroup>
                  <col className="w-[12%]" />
                  <col className="w-[32%]" />
                  <col className="w-[16%]" />
                  <col className="w-[14%]" />
                  <col className="w-[12%]" />
                  <col className="w-[14%]" />
                </colgroup>
                <thead className="bg-zinc-900 text-zinc-400">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">상태</th>
                    <th className="px-3 py-2.5 font-medium">문의</th>
                    <th className="px-3 py-2.5 font-medium">회원/작성자</th>
                    <th className="px-3 py-2.5 font-medium">접수일</th>
                    <th className="px-3 py-2.5 font-medium">답변 여부</th>
                    <th className="px-3 py-2.5 font-medium"><span className="sr-only">상세</span></th>
                  </tr>
                </thead>
                <tbody>
                  {inquiries.map((inquiry) => (
                    <tr key={inquiry.id} className="border-t border-zinc-800/80 bg-zinc-950 align-middle">
                      <td className="px-3 py-2.5"><StatusBadge status={inquiry.status} /></td>
                      <td className="px-3 py-2.5 min-w-0">
                        <p className="text-white font-medium truncate">{inquiry.title || '—'}</p>
                        <p className="text-xs text-zinc-500 truncate">{inquiry.content || '—'}</p>
                      </td>
                      <td className="px-3 py-2.5 text-zinc-300 truncate">{authorDisplay(inquiry)}</td>
                      <td className="px-3 py-2.5 text-zinc-400 whitespace-nowrap">{formatDateCompact(inquiry.created_at)}</td>
                      <td className="px-3 py-2.5 text-zinc-300 whitespace-nowrap">{inquiry.answer.trim() ? '있음' : '없음'}</td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          className="min-h-11 text-sm text-zinc-400 hover:text-white whitespace-nowrap"
                          onClick={(event) => openDetail(inquiry, event.currentTarget)}
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
              {inquiries.map((inquiry) => (
                <button
                  key={inquiry.id}
                  type="button"
                  onClick={(event) => openDetail(inquiry, event.currentTarget)}
                  className="w-full text-left bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-white truncate">{inquiry.title || '—'}</p>
                    <StatusBadge status={inquiry.status} />
                  </div>
                  <p className="text-sm text-zinc-400">{formatDateTime(inquiry.created_at)}</p>
                  <p className="text-sm text-zinc-400">상세 보기</p>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-zinc-500">
                {count === 0 ? '0' : `${page * ADMIN_CS_PAGE_SIZE + 1}–${Math.min(count, (page + 1) * ADMIN_CS_PAGE_SIZE)}`} / {count}
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

      {selectedInquiry && (
        <div className="fixed inset-0 z-[100] flex h-[100dvh] items-stretch md:items-center justify-end md:justify-center bg-black/80">
          <button type="button" className="absolute inset-0" aria-label="문의 상세 닫기" onClick={closeDetail} disabled={isSubmitting} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-cs-detail-title"
            className="relative z-10 flex h-full max-h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-[#1C1C1E] border-l md:h-auto md:max-h-[calc(100dvh-2rem)] md:max-w-xl md:border md:rounded-2xl"
          >
            <div className="shrink-0 flex items-start justify-between gap-3 p-5 border-b border-white/5">
              <div>
                <h3 id="admin-cs-detail-title" className="text-lg font-bold text-white">문의 상세</h3>
                <p className="text-sm text-zinc-400 mt-1">{selectedInquiry.title || '—'}</p>
              </div>
              <button
                type="button"
                onClick={closeDetail}
                disabled={isSubmitting}
                aria-label="닫기"
                className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg bg-white/5 text-zinc-300 disabled:opacity-40"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-6 md:flex-none md:max-h-[calc(100dvh-8rem)]">
              <section className="grid grid-cols-2 gap-3">
                <DetailField label="상태"><StatusBadge status={selectedInquiry.status} /></DetailField>
                <DetailField label="접수일">{formatDateTime(selectedInquiry.created_at)}</DetailField>
                <DetailField label="문의 ID">{selectedInquiry.id || '—'}</DetailField>
                <DetailField label="회원/작성자">{authorDisplay(selectedInquiry)}</DetailField>
              </section>

              {selectedClass === 'unknown' && (
                <p className="text-xs text-zinc-500">
                  저장값: {selectedInquiry.status || '없음'}. 이 문의는 답변/상태를 변경할 수 없습니다.
                </p>
              )}

              <section>
                <h4 className="text-sm font-medium text-white mb-2">문의 제목</h4>
                <p className="text-sm text-zinc-200 whitespace-pre-wrap">{selectedInquiry.title || '—'}</p>
              </section>

              <section>
                <h4 className="text-sm font-medium text-white mb-2">문의 내용</h4>
                <p className="text-sm text-zinc-200 whitespace-pre-wrap">{selectedInquiry.content || '—'}</p>
              </section>

              {selectedClass === 'unknown' ? (
                <section>
                  <h4 className="text-sm font-medium text-white mb-2">답변</h4>
                  <p className="text-sm text-zinc-200 whitespace-pre-wrap">{selectedInquiry.answer.trim() || '—'}</p>
                </section>
              ) : (
                <section>
                  <label htmlFor="admin-cs-answer" className="block text-sm font-medium text-white mb-2">답변</label>
                  <textarea
                    id="admin-cs-answer"
                    value={answerDraft}
                    onChange={(event) => setAnswerDraft(event.target.value)}
                    rows={8}
                    disabled={isSubmitting}
                    className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-xs text-zinc-500 mt-2">답변은 문의 레코드에만 저장됩니다. 별도 알림은 보내지 않습니다.</p>
                  {saveError && <p className="text-sm text-red-400 mt-2">{saveError}</p>}
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => { void saveAnswer(); }}
                    className="mt-3 min-h-11 px-4 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50"
                  >
                    {isSubmitting ? '저장 중...' : selectedClass === 'answered' ? '답변 수정 저장' : '답변 저장'}
                  </button>
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
