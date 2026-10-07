import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Search, X } from 'lucide-react';
import AdminLayout from '../components/admin/AdminLayout';
import {
  ADMIN_ORDER_STATUSES,
  ADMIN_ORDER_STATUS_LABEL,
  ADMIN_ORDERS_PAGE_SIZE,
  fetchAdminOrders,
  isAllowedOrderTransition,
  isCanonicalOrderStatus,
  itemSummary,
  nextOrderActionLabel,
  nextOrderStatus,
  orderStatusLabel,
  type AdminOrder,
  type AdminOrderItem,
  type AdminOrderStatus,
  type DateFilter,
  type StatusFilter,
} from '../components/admin/adminOrders';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/cn';
import { useWorkshopMediaDisplay } from '../hooks/useWorkshopMediaDisplay';
import type { WorkshopMediaDisplay } from '../lib/workshopMediaDisplay';

function visibleWorkshopRefs(orders: AdminOrder[], selected: AdminOrder | null): (string | null)[] {
  const listed = orders.map((order) => order.items[0]).filter((item) => item?.isWorkshop);
  const detail = selected ? selected.items.filter((item) => item.isWorkshop) : [];
  return [...listed, ...detail].map((item) => item?.imageUrl ?? null);
}

const DATE_FILTERS: { value: DateFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'today', label: '오늘' },
  { value: '7d', label: '최근 7일' },
  { value: '30d', label: '최근 30일' },
];

function formatOrderDate(iso: string): string {
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

function formatOrderDateCompact(iso: string): string {
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

function formatPrice(amount: number): string {
  return `₩${amount.toLocaleString('ko-KR')}`;
}

function listOrderNumber(order: AdminOrder): string {
  const raw = order.order_number || order.id;
  if (raw.length <= 18) return raw;
  return `${raw.slice(0, 8)}…${raw.slice(-6)}`;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-200 whitespace-nowrap">
      {orderStatusLabel(status)}
    </span>
  );
}

function ShippingCell({ order }: { order: AdminOrder }) {
  if (!order.courier && !order.tracking_number) {
    return <span className="text-zinc-500">—</span>;
  }
  return (
    <div className="max-w-[8.5rem]">
      {order.courier ? <p className="truncate text-zinc-300 leading-5">{order.courier}</p> : null}
      {order.tracking_number ? <p className="truncate text-xs text-zinc-500 leading-5">{order.tracking_number}</p> : null}
    </div>
  );
}

function OrderThumb({
  item,
  workshopMedia,
  compact = false,
}: {
  item: AdminOrderItem | undefined;
  workshopMedia: WorkshopMediaDisplay;
  compact?: boolean;
}) {
  const value = item?.imageUrl ?? null;
  const isWorkshop = Boolean(item?.isWorkshop);
  const workshop = isWorkshop ? workshopMedia.get(value) : null;
  const src = workshop ? workshop.src : value;
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);
  const empty = !src || failed;
  return (
    <div className={cn('overflow-hidden bg-zinc-800 border border-white/5 flex items-center justify-center', compact ? 'w-12 h-12 rounded-md' : 'w-16 h-16 rounded-lg')}>
      {empty ? (
        workshop?.status === 'loading' ? null : (
          <span className="text-[10px] text-zinc-500 text-center px-1">이미지 없음</span>
        )
      ) : isWorkshop ? (
        <img
          src={src}
          alt=""
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => void workshopMedia.onLoadError(value, src)}
        />
      ) : (
        <img src={src} alt="" className="w-full h-full object-cover" onError={() => setFailed(true)} />
      )}
    </div>
  );
}

export default function AdminOrders() {
  const { showToast } = useToast();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);
  const [pendingStatus, setPendingStatus] = useState<AdminOrderStatus | null>(null);
  const [trackingDraft, setTrackingDraft] = useState({ courier: '', tracking_number: '' });
  const [confirmTrackingSave, setConfirmTrackingSave] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const lastOpenerRef = useRef<HTMLElement | null>(null);
  const workshopMedia = useWorkshopMediaDisplay(visibleWorkshopRefs(orders, selectedOrder), 'admin');

  const filtersActive = Boolean(debouncedSearch) || statusFilter !== 'all' || dateFilter !== 'all';
  const pageCount = Math.max(1, Math.ceil(count / ADMIN_ORDERS_PAGE_SIZE));

  const loadOrders = useCallback(async () => {
    setLoadState('loading');
    const { data, count: nextCount, error } = await fetchAdminOrders({
      page,
      search: debouncedSearch,
      status: statusFilter,
      date: dateFilter,
    });
    if (error) {
      setOrders([]);
      setCount(0);
      setLoadState('error');
      return;
    }
    setOrders(data);
    setCount(nextCount);
    setLoadState('ready');
  }, [page, debouncedSearch, statusFilter, dateFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, statusFilter, dateFilter]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    if (!selectedOrder) return;
    const latest = orders.find((order) => order.id === selectedOrder.id);
    if (latest) setSelectedOrder(latest);
  }, [orders, selectedOrder?.id]);

  const closeOverlays = useCallback(() => {
    if (isSubmitting) return;
    if (confirmTrackingSave) {
      setConfirmTrackingSave(false);
      return;
    }
    if (pendingStatus) {
      setPendingStatus(null);
      setMutationError(null);
      return;
    }
    setSelectedOrder(null);
    lastOpenerRef.current?.focus();
  }, [confirmTrackingSave, isSubmitting, pendingStatus]);

  useEffect(() => {
    if (!selectedOrder && !pendingStatus && !confirmTrackingSave) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeOverlays();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeOverlays, confirmTrackingSave, pendingStatus, selectedOrder]);

  const openDetail = (order: AdminOrder, opener?: HTMLElement | null) => {
    lastOpenerRef.current = opener ?? null;
    setSelectedOrder(order);
    setTrackingDraft({ courier: order.courier, tracking_number: order.tracking_number });
    setPendingStatus(null);
    setConfirmTrackingSave(false);
    setMutationError(null);
  };

  const applyLocalOrder = (orderId: string, patch: Partial<AdminOrder>) => {
    setOrders((current) => current.map((order) => (order.id === orderId ? { ...order, ...patch } : order)));
    setSelectedOrder((current) => (current?.id === orderId ? { ...current, ...patch } : current));
  };

  const persistStatus = async (order: AdminOrder, status: AdminOrderStatus, tracking?: { courier: string; tracking_number: string }) => {
    if (isSubmitting) return;
    if (!isAllowedOrderTransition(order.status, status)) {
      setMutationError('허용되지 않은 상태 변경입니다.');
      setPendingStatus(null);
      return;
    }
    if (status === 'SHIPPING') {
      const courier = tracking?.courier.trim() ?? '';
      const trackingNumber = tracking?.tracking_number.trim() ?? '';
      if (!courier || !trackingNumber) {
        setMutationError('배송 중으로 변경하려면 택배사와 운송장 번호가 필요합니다.');
        return;
      }
    }
    setIsSubmitting(true);
    setMutationError(null);
    const updateData: { status: string; courier?: string; tracking_number?: string } = { status };
    if (tracking) {
      updateData.courier = tracking.courier.trim();
      updateData.tracking_number = tracking.tracking_number.trim();
    }
    const { error } = await supabase.from('orders').update(updateData).eq('id', order.id);
    setIsSubmitting(false);
    if (error) {
      setMutationError('상태 변경에 실패했습니다.');
      showToast('상태 변경에 실패했습니다.', 'error');
      return;
    }
    applyLocalOrder(order.id, updateData);
    setPendingStatus(null);
    showToast(`상태가 ${orderStatusLabel(status)}(으)로 변경되었습니다.`, 'success');
  };

  const persistTracking = async (order: AdminOrder) => {
    if (isSubmitting) return;
    const courier = trackingDraft.courier.trim();
    const tracking_number = trackingDraft.tracking_number.trim();
    if (!courier || !tracking_number) {
      setMutationError('택배사와 운송장 번호를 입력해 주세요.');
      return;
    }
    setIsSubmitting(true);
    setMutationError(null);
    const { error } = await supabase
      .from('orders')
      .update({ courier, tracking_number })
      .eq('id', order.id);
    setIsSubmitting(false);
    if (error) {
      setMutationError('배송 정보 저장에 실패했습니다.');
      showToast('배송 정보 저장에 실패했습니다.', 'error');
      return;
    }
    applyLocalOrder(order.id, { courier, tracking_number });
    setConfirmTrackingSave(false);
    showToast('배송 정보가 저장되었습니다.', 'success');
  };

  const requestNextStatus = () => {
    if (!selectedOrder || isSubmitting) return;
    const next = nextOrderStatus(selectedOrder.status);
    if (!next) return;
    setMutationError(null);
    setPendingStatus(next);
  };

  const confirmStatusChange = () => {
    if (!selectedOrder || !pendingStatus) return;
    if (!isAllowedOrderTransition(selectedOrder.status, pendingStatus)) {
      setMutationError('허용되지 않은 상태 변경입니다.');
      setPendingStatus(null);
      return;
    }
    if (pendingStatus === 'SHIPPING') {
      const courier = trackingDraft.courier.trim();
      const tracking_number = trackingDraft.tracking_number.trim();
      if (!courier || !tracking_number) {
        setMutationError('배송 중으로 변경하려면 택배사와 운송장 번호가 필요합니다.');
        return;
      }
      void persistStatus(selectedOrder, pendingStatus, { courier, tracking_number });
      return;
    }
    void persistStatus(selectedOrder, pendingStatus);
  };

  const dialogOpen = Boolean(selectedOrder);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-white">
          주문 관리
          {loadState === 'ready' && (
            <span className="ml-2 text-sm font-normal text-zinc-500">{count}</span>
          )}
        </h2>

        <div className="flex flex-col gap-3 md:flex-row md:items-end bg-zinc-900 p-4 rounded-xl border border-zinc-800">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} aria-hidden="true" />
            <label htmlFor="admin-order-search" className="sr-only">주문 검색</label>
            <input
              id="admin-order-search"
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="주문번호, 수령인, 전화, 운송장"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-10 pr-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 placeholder:text-zinc-600"
            />
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <div>
              <label htmlFor="admin-order-status-filter" className="block text-xs text-zinc-500 mb-1">상태</label>
              <select
                id="admin-order-status-filter"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                className="h-11 min-w-[9.5rem] bg-zinc-800 border border-zinc-700 rounded-lg px-3 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="all">전체</option>
                {ADMIN_ORDER_STATUSES.map((status) => (
                  <option key={status} value={status}>{ADMIN_ORDER_STATUS_LABEL[status]}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="admin-order-date-filter" className="block text-xs text-zinc-500 mb-1">기간</label>
              <select
                id="admin-order-date-filter"
                value={dateFilter}
                onChange={(event) => setDateFilter(event.target.value as DateFilter)}
                className="h-11 min-w-[8rem] bg-zinc-800 border border-zinc-700 rounded-lg px-3 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                {DATE_FILTERS.map((filter) => (
                  <option key={filter.value} value={filter.value}>{filter.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {loadState === 'loading' && (
          <div className="py-16 flex flex-col items-center gap-3 text-zinc-500" aria-busy="true">
            <Loader2 className="animate-spin" size={22} aria-hidden="true" />
            <p className="text-sm">주문 목록을 불러오는 중</p>
          </div>
        )}

        {loadState === 'error' && (
          <div className="py-16 text-center bg-zinc-900 rounded-xl border border-zinc-800">
            <p className="text-white font-medium">주문 목록을 불러오지 못했습니다.</p>
            <button type="button" onClick={() => { void loadOrders(); }} className="mt-4 min-h-11 px-4 rounded-lg bg-zinc-800 text-white">
              다시 시도
            </button>
          </div>
        )}

        {loadState === 'ready' && count === 0 && !filtersActive && (
          <div className="py-16 text-center bg-zinc-900 rounded-xl border border-dashed border-white/10">
            <p className="text-white font-medium">주문이 없습니다.</p>
          </div>
        )}

        {loadState === 'ready' && count === 0 && filtersActive && (
          <div className="py-16 text-center bg-zinc-900 rounded-xl border border-dashed border-white/10">
            <p className="text-white font-medium">검색 결과가 없습니다.</p>
          </div>
        )}

        {loadState === 'ready' && orders.length > 0 && (
          <>
            <div className="hidden md:block rounded-xl border border-zinc-800">
              <table className="w-full table-fixed text-left text-sm">
                <colgroup>
                  <col className="w-[16%]" />
                  <col className="w-[11%]" />
                  <col className="w-[13%]" />
                  <col className="w-[16%]" />
                  <col className="w-[10%]" />
                  <col className="w-[13%]" />
                  <col className="w-[11%]" />
                  <col className="w-[10%]" />
                </colgroup>
                <thead className="bg-zinc-900 text-zinc-400">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">주문</th>
                    <th className="px-3 py-2.5 font-medium">주문일</th>
                    <th className="px-3 py-2.5 font-medium">고객/수령인</th>
                    <th className="px-3 py-2.5 font-medium">상품 요약</th>
                    <th className="px-3 py-2.5 font-medium text-right">금액</th>
                    <th className="px-3 py-2.5 font-medium">상태</th>
                    <th className="px-3 py-2.5 font-medium">배송</th>
                    <th className="px-3 py-2.5 font-medium"><span className="sr-only">상세</span></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="border-t border-zinc-800/80 bg-zinc-950 align-middle">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <OrderThumb item={order.items[0]} workshopMedia={workshopMedia} compact />
                          <span className="text-white font-medium truncate" title={order.order_number || order.id}>
                            {listOrderNumber(order)}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-zinc-400 whitespace-nowrap">{formatOrderDateCompact(order.created_at)}</td>
                      <td className="px-3 py-2.5">
                        <p className="text-zinc-200 truncate">{order.shipping_name || '—'}</p>
                        {order.shipping_phone ? <p className="text-xs text-zinc-500 truncate">{order.shipping_phone}</p> : null}
                      </td>
                      <td className="px-3 py-2.5 text-zinc-300 truncate">{itemSummary(order)}</td>
                      <td className="px-3 py-2.5 text-zinc-200 tabular-nums text-right whitespace-nowrap">{formatPrice(order.total_price)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap"><StatusBadge status={order.status} /></td>
                      <td className="px-3 py-2.5"><ShippingCell order={order} /></td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          className="min-h-11 text-sm text-zinc-400 hover:text-white whitespace-nowrap"
                          onClick={(event) => openDetail(order, event.currentTarget)}
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
              {orders.map((order) => (
                <button
                  key={order.id}
                  type="button"
                  onClick={(event) => openDetail(order, event.currentTarget)}
                  className="w-full text-left bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-white truncate" title={order.order_number || order.id}>{listOrderNumber(order)}</p>
                    <StatusBadge status={order.status} />
                  </div>
                  <p className="text-sm text-zinc-400">{formatOrderDate(order.created_at)}</p>
                  <p className="text-sm text-zinc-300">{formatPrice(order.total_price)}</p>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-zinc-500">
                {count === 0 ? '0' : `${page * ADMIN_ORDERS_PAGE_SIZE + 1}–${Math.min(count, (page + 1) * ADMIN_ORDERS_PAGE_SIZE)}`} / {count}
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

      {dialogOpen && selectedOrder && (
        <div className="fixed inset-0 z-[100] flex items-stretch md:items-center justify-end md:justify-center bg-black/80">
          <button type="button" className="absolute inset-0" aria-label="주문 상세 닫기" onClick={closeOverlays} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-order-detail-title"
            className="relative z-10 w-full md:max-w-xl h-full md:h-auto md:max-h-[92vh] bg-[#1C1C1E] border-l md:border border-white/10 md:rounded-2xl overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-3 p-5 border-b border-white/5">
              <div>
                <h3 id="admin-order-detail-title" className="text-lg font-bold text-white">주문 상세</h3>
                <p className="text-sm text-zinc-400 mt-1">{selectedOrder.order_number || selectedOrder.id}</p>
              </div>
              <button type="button" onClick={closeOverlays} aria-label="닫기" className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg bg-white/5 text-zinc-300">
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="p-5 space-y-6">
              <section className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-zinc-500 mb-1">주문일</p>
                  <p className="text-zinc-200">{formatOrderDate(selectedOrder.created_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-1">상태</p>
                  <p className="text-zinc-200">{orderStatusLabel(selectedOrder.status)}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-1">금액</p>
                  <p className="text-zinc-200">{formatPrice(selectedOrder.total_price)}</p>
                </div>
                {selectedOrder.method ? (
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">결제 수단</p>
                    <p className="text-zinc-200">{selectedOrder.method}</p>
                  </div>
                ) : null}
              </section>

              <section>
                <h4 className="text-sm font-medium text-white mb-2">수령인</h4>
                <p className="text-sm text-zinc-200">{selectedOrder.shipping_name || '—'}</p>
                <p className="text-sm text-zinc-400 mt-1">{selectedOrder.shipping_phone || '—'}</p>
                <p className="text-sm text-zinc-400 mt-2">
                  {selectedOrder.address} {selectedOrder.address_detail}
                  {selectedOrder.zip_code ? ` (${selectedOrder.zip_code})` : ''}
                </p>
              </section>

              <section>
                <h4 className="text-sm font-medium text-white mb-3">상품</h4>
                <ul className="space-y-3">
                  {selectedOrder.items.length === 0 ? (
                    <li className="text-sm text-zinc-500">상품 정보가 없습니다.</li>
                  ) : selectedOrder.items.map((item: AdminOrderItem, index) => (
                    <li key={`${item.title}-${index}`} className="flex gap-3">
                      <OrderThumb item={item} workshopMedia={workshopMedia} />
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">{item.title}</p>
                        <p className="text-xs text-zinc-400 mt-1">
                          {[item.option, item.quantity ? `${item.quantity}개` : '', item.orientation === 'landscape' ? '가로형' : item.orientation === 'portrait' ? '세로형' : '', item.isWorkshop ? '커스텀' : '']
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h4 className="text-sm font-medium text-white mb-3">상태</h4>
                {!isCanonicalOrderStatus(selectedOrder.status) ? (
                  <div>
                    <p className="text-sm text-zinc-200">알 수 없는 상태</p>
                    <p className="text-xs text-zinc-500 mt-1">저장값: {selectedOrder.status || '없음'}</p>
                    <p className="text-xs text-zinc-500 mt-2">이 주문은 상태를 변경할 수 없습니다.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-zinc-500 mb-1">현재 상태</p>
                      <p className="text-sm text-zinc-200">{orderStatusLabel(selectedOrder.status)}</p>
                    </div>
                    {nextOrderStatus(selectedOrder.status) ? (
                      <div>
                        <p className="text-xs text-zinc-500 mb-1">다음 단계</p>
                        <p className="text-sm text-zinc-200">{orderStatusLabel(nextOrderStatus(selectedOrder.status) || '')}</p>
                      </div>
                    ) : (
                      <p className="text-sm text-zinc-400">이 주문은 배송완료 상태입니다. 더 이상 상태를 변경할 수 없습니다.</p>
                    )}
                    {selectedOrder.status === 'PAID' && (
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={requestNextStatus}
                        className="min-h-11 px-4 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50"
                      >
                        {nextOrderActionLabel(selectedOrder.status)}
                      </button>
                    )}
                  </div>
                )}
              </section>

              {selectedOrder.status === 'PRODUCTION' && (
                <section>
                  <h4 className="text-sm font-medium text-white mb-3">배송 정보</h4>
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="admin-order-courier" className="block text-xs text-zinc-500 mb-1">택배사</label>
                      <input
                        id="admin-order-courier"
                        type="text"
                        value={trackingDraft.courier}
                        onChange={(event) => setTrackingDraft((current) => ({ ...current, courier: event.target.value }))}
                        className="w-full h-11 bg-zinc-900 border border-white/10 rounded-lg px-3 text-white"
                        placeholder="예: CJ대한통운"
                      />
                    </div>
                    <div>
                      <label htmlFor="admin-order-tracking" className="block text-xs text-zinc-500 mb-1">운송장 번호</label>
                      <input
                        id="admin-order-tracking"
                        type="text"
                        value={trackingDraft.tracking_number}
                        onChange={(event) => setTrackingDraft((current) => ({ ...current, tracking_number: event.target.value }))}
                        className="w-full h-11 bg-zinc-900 border border-white/10 rounded-lg px-3 text-white"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={requestNextStatus}
                      className="min-h-11 px-4 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50"
                    >
                      배송 시작
                    </button>
                  </div>
                </section>
              )}

              {(selectedOrder.status === 'SHIPPING' || selectedOrder.status === 'COMPLETED') && (
                <section>
                  <h4 className="text-sm font-medium text-white mb-3">배송 정보</h4>
                  <div className="space-y-3">
                    <p className="text-sm text-zinc-300">
                      {selectedOrder.courier || '—'}
                      <span className="block text-xs text-zinc-500 mt-1">{selectedOrder.tracking_number || '—'}</span>
                    </p>
                    <div>
                      <label htmlFor="admin-order-courier" className="block text-xs text-zinc-500 mb-1">택배사</label>
                      <input
                        id="admin-order-courier"
                        type="text"
                        value={trackingDraft.courier}
                        onChange={(event) => setTrackingDraft((current) => ({ ...current, courier: event.target.value }))}
                        className="w-full h-11 bg-zinc-900 border border-white/10 rounded-lg px-3 text-white"
                        placeholder="예: CJ대한통운"
                      />
                    </div>
                    <div>
                      <label htmlFor="admin-order-tracking" className="block text-xs text-zinc-500 mb-1">운송장 번호</label>
                      <input
                        id="admin-order-tracking"
                        type="text"
                        value={trackingDraft.tracking_number}
                        onChange={(event) => setTrackingDraft((current) => ({ ...current, tracking_number: event.target.value }))}
                        className="w-full h-11 bg-zinc-900 border border-white/10 rounded-lg px-3 text-white"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => {
                        setMutationError(null);
                        setConfirmTrackingSave(true);
                      }}
                      className="min-h-11 px-4 rounded-lg bg-zinc-800 text-white text-sm font-medium disabled:opacity-50"
                    >
                      배송 정보 저장
                    </button>
                    <p className="text-xs text-zinc-500">저장 시 주문 레코드의 택배사/운송장만 갱신됩니다. 별도 발송 알림은 보내지 않습니다.</p>
                    {selectedOrder.status === 'SHIPPING' && (
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={requestNextStatus}
                        className="min-h-11 px-4 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50"
                      >
                        배송완료 처리
                      </button>
                    )}
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      )}

      {pendingStatus && selectedOrder && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="admin-order-status-title"
            aria-describedby="admin-order-status-desc"
            className="bg-[#1C1C1E] border border-white/10 rounded-2xl p-6 max-w-sm w-full"
          >
            <h3 id="admin-order-status-title" className="text-lg font-bold text-white mb-2">상태 변경 확인</h3>
            <p id="admin-order-status-desc" className="text-sm text-zinc-400 mb-4">
              현재 {orderStatusLabel(selectedOrder.status)} → {orderStatusLabel(pendingStatus)}
            </p>
            {pendingStatus === 'SHIPPING' && (
              <div className="space-y-3 mb-4">
                <div>
                  <label htmlFor="admin-order-confirm-courier" className="block text-xs text-zinc-500 mb-1">택배사</label>
                  <input
                    id="admin-order-confirm-courier"
                    type="text"
                    value={trackingDraft.courier}
                    onChange={(event) => setTrackingDraft((current) => ({ ...current, courier: event.target.value }))}
                    className="w-full h-11 bg-zinc-900 border border-white/10 rounded-lg px-3 text-white"
                  />
                </div>
                <div>
                  <label htmlFor="admin-order-confirm-tracking" className="block text-xs text-zinc-500 mb-1">운송장 번호</label>
                  <input
                    id="admin-order-confirm-tracking"
                    type="text"
                    value={trackingDraft.tracking_number}
                    onChange={(event) => setTrackingDraft((current) => ({ ...current, tracking_number: event.target.value }))}
                    className="w-full h-11 bg-zinc-900 border border-white/10 rounded-lg px-3 text-white"
                  />
                </div>
              </div>
            )}
            {mutationError && <p className="text-sm text-red-400 mb-3">{mutationError}</p>}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                autoFocus
                disabled={isSubmitting}
                onClick={() => { setPendingStatus(null); setMutationError(null); }}
                className="min-h-11 px-4 rounded-lg text-zinc-400"
              >
                취소
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={confirmStatusChange}
                className="min-h-11 px-4 rounded-lg bg-indigo-600 text-white disabled:opacity-50"
              >
                {isSubmitting ? '변경 중...' : '변경'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmTrackingSave && selectedOrder && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="admin-order-tracking-title"
            aria-describedby="admin-order-tracking-desc"
            className="bg-[#1C1C1E] border border-white/10 rounded-2xl p-6 max-w-sm w-full"
          >
            <h3 id="admin-order-tracking-title" className="text-lg font-bold text-white mb-2">배송 정보 저장</h3>
            <p id="admin-order-tracking-desc" className="text-sm text-zinc-400 mb-4">
              택배사 {trackingDraft.courier.trim() || '—'} / 운송장 {trackingDraft.tracking_number.trim() || '—'} 정보를 저장할까요?
            </p>
            {mutationError && <p className="text-sm text-red-400 mb-3">{mutationError}</p>}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                autoFocus
                disabled={isSubmitting}
                onClick={() => { setConfirmTrackingSave(false); setMutationError(null); }}
                className="min-h-11 px-4 rounded-lg text-zinc-400"
              >
                취소
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => { void persistTracking(selectedOrder); }}
                className="min-h-11 px-4 rounded-lg bg-indigo-600 text-white disabled:opacity-50"
              >
                {isSubmitting ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
