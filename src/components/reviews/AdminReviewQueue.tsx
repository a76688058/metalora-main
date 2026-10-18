import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { cn } from '../../lib/cn';
import {
  REVIEW_BACKEND_UNAVAILABLE,
  REVIEW_STATUS_LABEL,
  fetchAdminReviewEvents,
  fetchAdminReviews,
  moderateReview,
  readReviewAvailability,
  reviewErrorMessage,
  reviewReadsEnabled,
  reviewWritesEnabled,
  type ReviewReadState,
  type ReviewStatus,
} from './reviewCopy';
import {
  reviewUiPreviewEnabled,
  type ReviewModerationAction,
  type ReviewModerationEvent,
  type ReviewModerationStatus,
  type ReviewReport,
  type ReviewReportReason,
} from '../../types/reviews';

type ReviewPreviewImage = {
  src: string;
  alt: string;
};

type ModerationReview = {
  id: string;
  productTitle: string;
  rating: number;
  body: string;
  status: ReviewStatus;
  createdAt: string;
  images?: ReviewPreviewImage[];
};

export type AdminReviewPreviewScene = 'filled' | 'loading' | 'empty' | 'error';

export type AdminReviewPreview = {
  scene: AdminReviewPreviewScene;
  items: ModerationReview[];
  reports: ReviewReport[];
  events: ReviewModerationEvent[];
};

type AdminReviewQueueProps = {
  onBack: () => void;
  /** Ignored unless the dev-only preview gate is on. Never writes. */
  preview?: AdminReviewPreview;
};

function Readout({ state, loading, empty, error, unavailable }: {
  state: ReviewReadState;
  loading: string;
  empty: string;
  error: string;
  unavailable: string;
}) {
  if (state === 'loading') return <p className="text-sm text-zinc-400" aria-busy="true">{loading}</p>;
  if (state === 'empty') return <p className="text-sm text-zinc-400">{empty}</p>;
  if (state === 'error') return <p className="text-sm text-zinc-300">{error}</p>;
  return <p className="text-sm text-zinc-400">{unavailable}</p>;
}

type QueueFilter = 'pending' | 'all' | 'approved' | 'rejected' | 'hidden';

const FILTERS: { id: QueueFilter; label: string }[] = [
  { id: 'pending', label: '대기' },
  { id: 'all', label: '전체' },
  { id: 'approved', label: '공개' },
  { id: 'rejected', label: '반려' },
  { id: 'hidden', label: '숨김' },
];

const REPORT_REASON_LABEL: Record<ReviewReportReason, string> = {
  spam: '스팸',
  abuse: '욕설·괴롭힘',
  other: '기타',
};

const ACTION_LABEL: Record<ReviewModerationAction, string> = {
  created: '작성',
  edited: '수정',
  deleted: '삭제',
  approved: '승인',
  rejected: '반려',
  hidden: '숨김',
  reported: '신고',
  commerce_cancelled: '주문 취소',
  commerce_refunded: '환불',
  redacted: '기록 정리',
};

const STATUS_LABEL: Record<ReviewModerationStatus, string> = {
  ...REVIEW_STATUS_LABEL,
  deleted: '삭제',
};

function stampLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function countFor(items: ModerationReview[], filter: QueueFilter) {
  if (filter === 'all') return items.length;
  return items.filter((item) => item.status === filter).length;
}

function matchesFilter(item: ModerationReview, filter: QueueFilter) {
  return filter === 'all' || item.status === filter;
}

function AdminAction({ children, emphasis = false, describedBy = 'review-action-unavailable', enabled = false, busy = false, onClick }: {
  children: string;
  emphasis?: boolean;
  describedBy?: string;
  enabled?: boolean;
  busy?: boolean;
  onClick?: () => void;
}) {
  const unavailable = !enabled;
  return (
    <button
      type="button"
      disabled={unavailable || busy}
      aria-describedby={describedBy}
      onClick={onClick}
      className={cn(
        'focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-bold disabled:cursor-not-allowed',
        emphasis
          ? 'bg-white text-black disabled:opacity-80'
          : unavailable
            ? 'border border-dashed border-zinc-700 text-zinc-400 disabled:opacity-70'
            : 'border border-zinc-700 text-white',
      )}
    >
      {children}
      {unavailable ? <span className={cn('text-xs font-medium', emphasis ? 'text-black/60' : 'text-zinc-500')}>사용 불가</span> : null}
    </button>
  );
}

function reviewIdentity(productId: string | null): string {
  return productId === null ? '맞춤 제작' : '카탈로그 상품';
}

export function AdminReviewQueue({ onBack, preview }: AdminReviewQueueProps) {
  const previewOn = reviewUiPreviewEnabled() && preview != null;
  const [queue, setQueue] = useState<ReviewReadState>('loading');
  const [reports, setReports] = useState<ReviewReadState>('loading');
  const [history, setHistory] = useState<ReviewReadState>('loading');
  const [items, setItems] = useState<ModerationReview[]>([]);
  const [reportItems, setReportItems] = useState<ReviewReport[]>([]);
  const [events, setEvents] = useState<ReviewModerationEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<QueueFilter>('pending');
  const [reportsOpen, setReportsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [moderating, setModerating] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const filterRefs = useRef<Partial<Record<QueueFilter, HTMLButtonElement | null>>>({});
  const loadGen = useRef(0);
  const eventGen = useRef(0);
  const [eventRefresh, setEventRefresh] = useState(0);

  const load = () => {
    if (previewOn && preview) {
      if (preview.scene !== 'filled') {
        setQueue(preview.scene);
        setReports(preview.scene);
        setHistory(preview.scene);
        setItems([]);
        setReportItems([]);
        setEvents([]);
        setSelectedId(null);
        setSessionReady(false);
        return;
      }
      setQueue('empty');
      setReports('empty');
      setHistory('empty');
      setItems(preview.items);
      setReportItems(preview.reports);
      setEvents(preview.events);
      setSelectedId(preview.items[0]?.id ?? null);
      setSessionReady(false);
      return;
    }
    if (!reviewReadsEnabled()) {
      const availability = readReviewAvailability();
      setQueue(availability);
      setReports(availability);
      setHistory(availability);
      setItems([]);
      setReportItems([]);
      setEvents([]);
      setSelectedId(null);
      setSessionReady(false);
      return;
    }
    const token = ++loadGen.current;
    setQueue('loading');
    void (async () => {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (loadGen.current !== token) return;
      if (sessionError || !sessionData.session) {
        setQueue('unavailable');
        setReports('unavailable');
        setHistory('unavailable');
        setItems([]);
        setReportItems([]);
        setEvents([]);
        setSelectedId(null);
        setSessionReady(false);
        return;
      }
      try {
        const rows = await fetchAdminReviews();
        if (loadGen.current !== token) return;
        const next = rows.map((row) => ({
          id: row.id,
          productTitle: reviewIdentity(row.productId),
          rating: row.rating ?? 0,
          body: row.body ?? '',
          status: row.status,
          createdAt: row.createdAt,
        }));
        setItems(next);
        setQueue('empty');
        setSessionReady(true);
        setSelectedId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id ?? null);
      } catch {
        if (loadGen.current !== token) return;
        setQueue('error');
        setItems([]);
        setSelectedId(null);
        setSessionReady(false);
      }
    })();
  };

  useEffect(() => {
    load();
    if (previewOn || !reviewReadsEnabled()) return;
    const { data } = supabase.auth.onAuthStateChange(() => {
      setItems([]);
      setReportItems([]);
      setEvents([]);
      setSelectedId(null);
      setActionError(null);
      setSessionReady(false);
      load();
    });
    return () => {
      loadGen.current += 1;
      data.subscription.unsubscribe();
    };
  }, [previewOn, preview]);

  useEffect(() => {
    if (previewOn || !reviewReadsEnabled()) return;
    const reviewId = selectedId;
    if (!reviewId) {
      setReportItems([]);
      setEvents([]);
      setReports('empty');
      setHistory('empty');
      return;
    }
    const token = ++eventGen.current;
    setReports('loading');
    setHistory('loading');
    void (async () => {
      try {
        const rows = await fetchAdminReviewEvents(reviewId);
        if (eventGen.current !== token) return;
        const nextEvents = rows.map((row) => ({
          id: row.id,
          reviewId,
          action: row.action,
          reasonCode: row.reasonCode,
          fromStatus: row.fromStatus,
          toStatus: row.toStatus,
          createdAt: row.createdAt,
          actorLabel: null,
        }));
        setEvents(nextEvents);
        setReportItems(nextEvents.flatMap((row) => (
          row.action === 'reported' && row.reasonCode
            ? [{ id: row.id, reviewId, reasonCode: row.reasonCode, createdAt: row.createdAt }]
            : []
        )));
        setReports('empty');
        setHistory('empty');
      } catch {
        if (eventGen.current !== token) return;
        setReports('error');
        setHistory('error');
        setReportItems([]);
        setEvents([]);
      }
    })();
    return () => {
      eventGen.current += 1;
    };
  }, [previewOn, selectedId, eventRefresh]);

  const visible = items.filter((item) => matchesFilter(item, filter));
  const activeId = selectedId && visible.some((item) => item.id === selectedId)
    ? selectedId
    : visible[0]?.id ?? null;
  const selected = items.find((item) => item.id === activeId) ?? null;
  const showCounts = items.length > 0 || queue === 'empty';

  const moveFilter = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = FILTERS.findIndex((item) => item.id === filter);
    const nextIndex = event.key === 'ArrowRight' || event.key === 'ArrowDown'
      ? (current + 1) % FILTERS.length
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
        ? (current - 1 + FILTERS.length) % FILTERS.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? FILTERS.length - 1
            : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const next = FILTERS[nextIndex].id;
    setFilter(next);
    filterRefs.current[next]?.focus();
  };

  const canModerate = !previewOn && reviewWritesEnabled() && sessionReady && selected !== null && !moderating;

  const runModeration = (action: 'approve' | 'reject' | 'hide') => {
    if (!selected || !canModerate) return;
    setModerating(true);
    setActionError(null);
    void moderateReview(selected.id, action)
      .then(() => {
        setEventRefresh((value) => value + 1);
        load();
      })
      .catch((error: unknown) => {
        setActionError(reviewErrorMessage(error));
      })
      .finally(() => {
        setModerating(false);
      });
  };

  return (
    <div className="space-y-8 bg-black pb-20 text-white">
      <div className="flex flex-col justify-between gap-6 px-6 pt-6 md:flex-row md:items-end lg:px-8 lg:pt-8">
        <div className="min-w-0 flex-1">
          <h2 className="mb-2 text-4xl font-black tracking-tighter text-white">리뷰 검토</h2>
          <p className="font-bold tracking-tight text-zinc-500">대기, 신고, 심사 기록</p>
        </div>
        <button type="button" onClick={onBack} className="focus-ring min-h-11 shrink-0 self-start rounded-xl border border-zinc-800 px-4 text-sm font-bold text-white md:self-end">
          대시보드
        </button>
      </div>

      <p className="rounded-2xl border border-zinc-800 bg-zinc-900 px-6 py-5 text-sm text-zinc-300">
        {previewOn || !reviewWritesEnabled() ? REVIEW_BACKEND_UNAVAILABLE : '심사 결과는 서버에 저장됩니다. 사진은 이 화면에서 올리지 않습니다.'}
      </p>

      <div className="grid gap-8 lg:grid-cols-2">
      <section aria-labelledby="review-queue-heading" className="space-y-6 rounded-2xl border border-zinc-800 bg-zinc-950 p-6 lg:p-8">
        <div className="space-y-4">
          <h3 id="review-queue-heading" className="text-lg font-bold">검토 대기</h3>
          <div role="tablist" aria-label="검토 상태" className="flex flex-wrap gap-2" onKeyDown={moveFilter}>
            {FILTERS.map((item) => {
              const active = filter === item.id;
              const count = countFor(items, item.id);
              return (
                <button
                  key={item.id}
                  ref={(node) => { filterRefs.current[item.id] = node; }}
                  type="button"
                  role="tab"
                  id={`review-filter-${item.id}`}
                  aria-selected={active}
                  tabIndex={active ? 0 : -1}
                  onClick={() => setFilter(item.id)}
                  className={cn(
                    'focus-ring min-h-11 rounded-xl px-3 text-sm',
                    active
                      ? 'bg-white font-bold text-black'
                      : 'border border-zinc-800 text-zinc-400 hover:text-white',
                  )}
                >
                  {item.label}
                  {showCounts ? <span className={active ? 'text-black/60' : 'text-zinc-500'}> {count}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
        {items.length === 0 ? (
          <Readout
            state={queue}
            loading="검토 대기를 불러오는 중"
            empty="검토할 리뷰가 없습니다."
            error="검토 대기를 불러오지 못했습니다."
            unavailable="검토 대기 목록은 서버 연결 후 표시됩니다."
          />
        ) : visible.length === 0 ? (
          <p className="text-sm text-zinc-400">이 상태의 리뷰가 없습니다.</p>
        ) : null}
        {queue === 'error' ? (
          <button type="button" onClick={load} className="focus-ring min-h-11 rounded-xl border border-zinc-800 px-4 text-sm font-bold text-white">
            다시 시도
          </button>
        ) : null}
        <ul className="space-y-2">
          {visible.map((item) => {
            const rowSelected = item.id === activeId;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-pressed={rowSelected}
                  onClick={() => setSelectedId(item.id)}
                  className={cn(
                    'focus-ring w-full rounded-xl border px-4 py-3 text-left',
                    rowSelected
                      ? 'border-white bg-white text-black'
                      : item.status === 'pending'
                        ? 'border-zinc-700 bg-zinc-900 text-white'
                        : 'border-zinc-800 text-zinc-300 hover:text-white',
                  )}
                >
                  <span className="block text-sm font-bold">{item.productTitle}</span>
                  <span className={cn('mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm', rowSelected ? 'text-black/70' : 'text-zinc-400')}>
                    <span aria-hidden="true">{'★'.repeat(item.rating)}{'☆'.repeat(Math.max(0, 5 - item.rating))}</span>
                    <span className="sr-only">{item.rating}점</span>
                    <span className={cn('font-bold', rowSelected ? 'text-black' : 'text-white')}>{REVIEW_STATUS_LABEL[item.status]}</span>
                    <span>{stampLabel(item.createdAt)}</span>
                  </span>
                  <span className={cn('mt-2 line-clamp-2 block text-sm leading-6', rowSelected ? 'text-black/80' : 'text-zinc-400')}>{item.body}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="review-detail-heading" className="space-y-6 rounded-2xl border border-zinc-800 bg-zinc-950 p-6 lg:p-8">
        <h3 id="review-detail-heading" className="text-lg font-bold">리뷰 내용</h3>
        {selected ? (
          <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 px-6 py-5 text-sm text-zinc-200">
            <p className="font-bold text-white">{selected.productTitle}</p>
            <p>
              <span aria-hidden="true">{'★'.repeat(selected.rating)}{'☆'.repeat(Math.max(0, 5 - selected.rating))} </span>
              <span>{selected.rating}점</span>
              <span> · {REVIEW_STATUS_LABEL[selected.status]}</span>
            </p>
            <p className="leading-6 text-white">{selected.body}</p>
            {selected.images && selected.images.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {selected.images.map((image) => (
                  <li key={image.src} className="w-16">
                    <img
                      src={image.src}
                      alt={image.alt}
                      referrerPolicy="no-referrer"
                      className="aspect-square w-full rounded-xl object-cover"
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-zinc-500">첨부 이미지 없음</p>
            )}
            <p className="text-zinc-400">{stampLabel(selected.createdAt)}</p>
          </div>
        ) : (
          <p className="text-sm text-zinc-400">선택한 리뷰가 없습니다.</p>
        )}
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <AdminAction emphasis enabled={canModerate} busy={moderating} onClick={() => runModeration('approve')}>승인</AdminAction>
            <AdminAction enabled={canModerate} busy={moderating} onClick={() => runModeration('reject')}>반려</AdminAction>
            <AdminAction enabled={canModerate} busy={moderating} onClick={() => runModeration('hide')}>숨김</AdminAction>
          </div>
          <p id="review-action-unavailable" className="text-sm text-zinc-500">
            {canModerate ? '심사 결과는 서버에 저장됩니다.' : '승인, 반려, 숨김은 아직 실행되지 않습니다.'}
          </p>
          {actionError ? <p role="alert" className="text-sm text-zinc-300">{actionError}</p> : null}
        </div>
      </section>
      </div>

      <div className="space-y-4">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 lg:p-8">
        <h3 className="text-lg font-bold">
          <button
            type="button"
            aria-expanded={reportsOpen}
            aria-controls="review-reports-panel"
            onClick={() => setReportsOpen((open) => !open)}
            className="focus-ring flex min-h-11 w-full items-center justify-between gap-3 rounded-xl text-left"
          >
            <span id="review-reports-heading">
              신고 관리
              {reportItems.length > 0 || reports === 'empty' ? <span className="ml-2 text-sm font-medium text-zinc-500">{reportItems.length}</span> : null}
            </span>
            <span className="text-sm font-medium text-zinc-400">{reportsOpen ? '접기' : '펼치기'}</span>
          </button>
        </h3>
        <div id="review-reports-panel" role="region" aria-labelledby="review-reports-heading" hidden={!reportsOpen} className="space-y-6 pt-6">
          {reportItems.length === 0 ? (
            <Readout
              state={reports}
              loading="신고를 불러오는 중"
              empty="처리할 신고가 없습니다."
              error="신고를 불러오지 못했습니다."
              unavailable="신고 목록은 서버 연결 후 표시됩니다."
            />
          ) : (
            <ul className="space-y-2">
              {reportItems.map((report) => (
                <li key={report.id} className="rounded-xl border border-zinc-800 px-4 py-3 text-sm">
                  <p className="font-bold text-white">{REPORT_REASON_LABEL[report.reasonCode]}</p>
                  <p className="mt-1 text-zinc-400">{previewOn ? 'LOCAL PREVIEW · ' : ''}{stampLabel(report.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
          <div className="space-y-3">
            <AdminAction describedBy="review-report-unavailable">신고 처리</AdminAction>
            <p id="review-report-unavailable" className="text-sm text-zinc-500">신고 처리는 아직 실행되지 않습니다.</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 lg:p-8">
        <h3 className="text-lg font-bold">
          <button
            type="button"
            aria-expanded={historyOpen}
            aria-controls="review-history-panel"
            onClick={() => setHistoryOpen((open) => !open)}
            className="focus-ring flex min-h-11 w-full items-center justify-between gap-3 rounded-xl text-left"
          >
            <span id="review-history-heading">심사 기록</span>
            <span className="text-sm font-medium text-zinc-400">{historyOpen ? '접기' : '펼치기'}</span>
          </button>
        </h3>
        <div id="review-history-panel" role="region" aria-labelledby="review-history-heading" hidden={!historyOpen} className="space-y-6 pt-6">
          {events.length === 0 ? (
            <Readout
              state={history}
              loading="심사 기록을 불러오는 중"
              empty="심사 기록이 없습니다."
              error="심사 기록을 불러오지 못했습니다."
              unavailable="심사 기록은 서버 연결 후 표시됩니다."
            />
          ) : (
            <ul className="space-y-2">
              {events.map((event) => (
                <li key={event.id} className="rounded-xl border border-zinc-800 px-4 py-3 text-sm">
                  <p className="font-bold text-white">{ACTION_LABEL[event.action]}</p>
                  <p className="mt-1 text-zinc-300">
                    {event.fromStatus ? STATUS_LABEL[event.fromStatus] : '이전 상태 없음'}
                    {' → '}
                    {event.toStatus ? STATUS_LABEL[event.toStatus] : '이후 상태 없음'}
                    {event.reasonCode ? ` · ${REPORT_REASON_LABEL[event.reasonCode]}` : ''}
                  </p>
                  <p className="mt-1 text-zinc-500">
                    {previewOn ? 'LOCAL PREVIEW · ' : ''}{event.actorLabel ?? '행위자 없음'} · {stampLabel(event.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      </div>
    </div>
  );
}
