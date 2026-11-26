import { useEffect, useRef, useState } from 'react';
import {
  cancellationStatusLabel,
  presentCancellation,
  type PersistedCancellationRecord,
} from '../../lib/cancellationInspection';
import {
  createRefundFlight,
  loadAdminCancellationRecords,
  normalizeCancelReason,
  REFUND_DUPLICATE_BLOCKED_MESSAGE,
  REFUND_INPUT_BLOCKED_MESSAGE,
  REFUND_REQUEST_SENT_MESSAGE,
  refundBlockMessage,
  refundEligibility,
  submitAdminFullRefund,
  type CancellationLoadResult,
  type RefundAttempt,
  type RefundOrderFacts,
} from './adminRefundContract';
import { orderStatusLabel } from './adminOrders';

function formatWon(amount: number): string {
  return `₩${amount.toLocaleString('ko-KR')}`;
}

function CancellationHistory({
  orderStatus,
  loading,
  result,
}: {
  orderStatus: string;
  loading: boolean;
  result: CancellationLoadResult | null;
}) {
  const records = result?.ok === true ? result.records : [];
  const visible = result?.ok === false || records.length > 0 || orderStatus === 'CANCELLED';
  if (!visible) return null;
  return (
    <div className="mb-3 rounded-lg border border-white/10 bg-zinc-900 p-3">
      <h5 className="text-sm text-white">결제 취소 기록</h5>
      {loading && <p className="mt-2 text-sm text-zinc-400">취소 기록을 확인하고 있습니다.</p>}
      {!loading && result?.ok === false && result.kind === 'unauthorized' && (
        <p className="mt-2 text-sm text-amber-200">관리자 로그인 상태를 확인한 뒤 다시 열 수 있습니다.</p>
      )}
      {!loading && result?.ok === false && result.kind === 'unavailable' && (
        <p className="mt-2 text-sm text-amber-200">취소 기록을 불러오지 못했습니다.</p>
      )}
      {!loading && result?.ok === true && records.length === 0 && (
        <p className="mt-2 text-sm text-zinc-400">저장된 취소 기록이 없습니다.</p>
      )}
      {!loading && records.map((record) => {
        const presentation = presentCancellation(record);
        const created = formatStamp(record.createdAt);
        const attempted = formatStamp(record.attemptedAt);
        const updated = formatStamp(record.updatedAt);
        return (
          <div key={record.cancellationId} className="mt-3 border-t border-white/10 pt-3 text-sm">
            <p className="text-zinc-500">처리 상태</p>
            <p className="mt-1 text-zinc-100">{cancellationStatusLabel(presentation)}</p>
            <p className="mt-3 text-zinc-500">취소 금액</p>
            <p className="mt-1 text-zinc-100">
              {record.cancelAmount === null ? '이 기록에는 취소 금액이 없습니다.' : formatWon(record.cancelAmount)}
            </p>
            <p className="mt-3 text-zinc-500">취소 사유</p>
            <p className="mt-1 text-zinc-100 break-words">{record.cancelReason ?? '이 기록에는 취소 사유가 없습니다.'}</p>
            {created && (
              <>
                <p className="mt-3 text-zinc-500">기록 생성 시각</p>
                <p className="mt-1 text-zinc-100">{created}</p>
                <p className="mt-1 text-xs text-zinc-500">취소 기록이 만들어진 시각입니다.</p>
              </>
            )}
            {attempted && (
              <>
                <p className="mt-3 text-zinc-500">결제사 요청 시각</p>
                <p className="mt-1 text-zinc-100">{attempted}</p>
                <p className="mt-1 text-xs text-zinc-500">취소 요청을 보낸 시각입니다. 결제사 완료 시각이 아닙니다.</p>
              </>
            )}
            {updated && (
              <>
                <p className="mt-3 text-zinc-500">기록 갱신 시각</p>
                <p className="mt-1 text-zinc-100">{updated}</p>
                <p className="mt-1 text-xs text-zinc-500">이 기록이 마지막으로 갱신된 시각입니다. 결제사 완료 시각이 아닙니다.</p>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

type Props = {
  order: RefundOrderFacts;
  locked: boolean;
  onLock: (orderId: string) => void;
  onBusyChange: (busy: boolean) => void;
  onFinished: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submit?: typeof submitAdminFullRefund;
  loadRecords?: typeof loadAdminCancellationRecords;
  records?: PersistedCancellationRecord[];
  recordState?: 'ready' | 'unauthorized' | 'error';
  initialStep?: 'edit' | 'confirm';
  initialReason?: string;
};

function persistedRefundBlock(records: PersistedCancellationRecord[]): string | null {
  const presentations = records.map(presentCancellation);
  if (presentations.some((item) => item === 'provider_uncertain' || item === 'reconciliation_required' || item === 'in_progress')) {
    return '결제 취소 결과 확인이 필요합니다. 다시 요청하지 않습니다.';
  }
  if (presentations.includes('confirmed')) return '이미 저장된 전액 취소 기록이 있습니다.';
  return null;
}

function formatStamp(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Seoul',
  }).format(date);
}

export function AdminOrderRefund({
  order,
  locked,
  onLock,
  onBusyChange,
  onFinished,
  open,
  onOpenChange,
  submit = submitAdminFullRefund,
  loadRecords = loadAdminCancellationRecords,
  records,
  recordState = 'ready',
  initialStep = 'edit',
  initialReason = '',
}: Props) {
  const eligibility = refundEligibility(order, locked);
  let blockReason: 'cancelled' | 'fulfilled' | 'not_paid' | 'not_card' | 'amount' | 'locked' | null = null;
  if (eligibility.ok === false) blockReason = eligibility.reason;
  const [step, setStep] = useState<'edit' | 'confirm'>(initialStep);
  const [reason, setReason] = useState(initialReason);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmedAmount, setConfirmedAmount] = useState<number | null>(null);
  const flight = useRef(createRefundFlight());
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState<RefundOrderFacts | null>(open ? order : null);
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState<CancellationLoadResult | null>(
    recordState !== 'ready'
      ? { ok: false, kind: recordState === 'unauthorized' ? 'unauthorized' : 'unavailable' }
      : records
        ? { ok: true, records }
        : null,
  );
  const [loadingRecords, setLoadingRecords] = useState(records === undefined && recordState === 'ready');

  useEffect(() => {
    if (recordState !== 'ready') {
      setLoaded({ ok: false, kind: recordState === 'unauthorized' ? 'unauthorized' : 'unavailable' });
      setLoadingRecords(false);
      return;
    }
    if (records) {
      setLoaded({ ok: true, records });
      setLoadingRecords(false);
      return;
    }
    let active = true;
    setLoadingRecords(true);
    void loadRecords({ orderId: order.id }).then((result) => {
      if (!active) return;
      setLoaded(result);
      setLoadingRecords(false);
    });
    return () => {
      active = false;
    };
  }, [loadRecords, order.id, recordState, records]);

  useEffect(() => {
    if (!open) setStep('edit');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (step === 'edit') reasonRef.current?.focus();
    else backRef.current?.focus();
  }, [open, step]);

  useEffect(() => {
    if (order.status === 'CANCELLED') {
      setNotice(null);
      setConfirmedAmount(null);
    }
  }, [order.id, order.status]);

  const close = () => {
    if (sending) return;
    onOpenChange(false);
    setStep('edit');
  };

  const applyResult = (result: RefundAttempt, amount: number) => {
    if (result.kind === 'confirmed') {
      setConfirmedAmount(amount);
      setNotice(result.alreadyComplete
        ? '서버가 이미 확정된 전액 취소를 확인했습니다. 새로 취소하지 않았습니다.'
        : '서버가 전액 취소를 확인했습니다. 취소 사유와 완료 시각은 이 응답에 저장되어 표시되지 않습니다.');
      onOpenChange(false);
      setStep('edit');
      onFinished();
      if (records === undefined && recordState === 'ready') {
        setLoadingRecords(true);
        void loadRecords({ orderId: order.id }).then((result) => {
          setLoaded(result);
          setLoadingRecords(false);
        });
      }
      return;
    }
    if (result.kind === 'uncertain' || (result.kind === 'rejected' && !result.retryable)) {
      onLock(order.id);
    }
    setNotice(result.kind === 'unauthorized' || result.kind === 'rejected' || result.kind === 'uncertain' ? result.message : null);
    if (result.kind === 'uncertain' || (result.kind === 'rejected' && !result.retryable)) onOpenChange(false);
  };

  const confirm = async () => {
    const current = draft;
    const cancelReason = normalizeCancelReason(reason);
    if (!current || current.id !== order.id || !cancelReason) {
      setNotice(REFUND_INPUT_BLOCKED_MESSAGE);
      return;
    }
    if (!flight.current.tryBegin(current.id)) {
      setNotice(REFUND_DUPLICATE_BLOCKED_MESSAGE);
      return;
    }
    setSending(true);
    onBusyChange(true);
    try {
      const result = await submit({
        orderId: current.id,
        cancelReason,
        onInitiate: () => {
          if (draft?.id === current.id) setNotice(REFUND_REQUEST_SENT_MESSAGE);
        },
      });
      if (draft?.id === current.id) applyResult(result, current.totalPrice);
    } finally {
      flight.current.end();
      setSending(false);
      onBusyChange(false);
    }
  };

  return (
    <section className="border-t border-white/10 pt-6">
      <h4 className="text-sm font-medium text-white mb-2">결제 취소 / 환불</h4>
      <p className="text-xs text-zinc-500 mb-3">제작 단계 변경과 별도입니다. 실제 결제 취소는 확인 후에만 요청합니다.</p>
      <CancellationHistory
        orderStatus={order.status}
        loading={loadingRecords}
        result={loaded}
      />
      {confirmedAmount !== null && order.status !== 'CANCELLED' && (
        <div className="mb-3 rounded-lg border border-white/10 bg-zinc-900 p-3 text-sm text-zinc-200">
          <p>{notice}</p>
          <p className="mt-2 text-xs text-zinc-500">방금 받은 서버 응답입니다. 새로고침 뒤에도 남는 기록은 주문 상태뿐입니다.</p>
        </div>
      )}
      {confirmedAmount === null && notice && <p className="mb-3 text-sm text-amber-200">{notice}</p>}
      {blockReason === null && loaded?.ok === true && !loadingRecords && !persistedRefundBlock(loaded.records) ? (
        <button
          type="button"
          onClick={() => {
            setDraft(order);
            setReason('');
            setNotice(null);
            setConfirmedAmount(null);
            setStep('edit');
            onOpenChange(true);
          }}
          className="min-h-11 px-4 rounded-lg border border-white/15 bg-transparent text-sm text-zinc-200"
        >
          결제 취소 / 환불
        </button>
      ) : (
        <p className="text-sm text-zinc-400">{(loaded?.ok === true ? persistedRefundBlock(loaded.records) : null) ?? (blockReason ? refundBlockMessage(blockReason) : '취소 기록을 확인한 뒤 진행할 수 있습니다.')}</p>
      )}

      {open && draft?.id === order.id && (
        <div className="fixed inset-0 z-[120] flex items-end md:items-center justify-center p-0 md:p-4 bg-black/80">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="admin-refund-title"
            aria-describedby="admin-refund-amount"
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              event.preventDefault();
              close();
            }}
            className="w-full md:max-w-md max-h-[92vh] overflow-y-auto bg-[#1C1C1E] border border-white/10 rounded-t-2xl md:rounded-2xl p-5"
          >
            <p className="text-xs text-amber-200 mb-2">실제 카드 결제 취소</p>
            <h3 id="admin-refund-title" className="text-lg font-bold text-white">전액 환불 확인</h3>
            <p className="mt-2 text-sm text-zinc-400 break-all">주문번호 {draft.orderNumber}</p>
            {step === 'confirm' ? (
              <div className="mt-5">
                <p className="text-xs text-zinc-500">최종 환불 금액</p>
                <p id="admin-refund-amount" className="mt-1 text-3xl font-semibold tabular-nums text-white whitespace-nowrap">{formatWon(draft.totalPrice)}</p>
                <p className="mt-2 text-sm text-zinc-200">카드 결제 잔액 전체를 취소합니다.</p>
              </div>
            ) : (
              <p id="admin-refund-amount" className="mt-3 text-sm text-zinc-300">주문 금액 {formatWon(draft.totalPrice)}</p>
            )}
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-zinc-500">결제 수단</dt><dd className="text-zinc-100">{draft.method}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-zinc-500">현재 상태</dt><dd className="text-zinc-100">{orderStatusLabel(draft.status)}</dd></div>
            </dl>
            {step === 'edit' ? (
              <label className="block mt-4 text-sm text-zinc-300" htmlFor="admin-refund-reason">
                취소 사유
                <textarea
                  id="admin-refund-reason"
                  ref={reasonRef}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={200}
                  rows={3}
                  className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-white"
                />
              </label>
            ) : (
              <p className="mt-4 text-sm text-zinc-300 break-words">사유: {normalizeCancelReason(reason)}</p>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button
                ref={backRef}
                type="button"
                disabled={sending}
                onClick={() => {
                  if (step === 'confirm') setStep('edit');
                  else close();
                }}
                className="min-h-11 px-4 text-sm text-zinc-300 disabled:opacity-40"
              >
                돌아가기
              </button>
              {step === 'edit' ? (
                <button
                  type="button"
                  disabled={!normalizeCancelReason(reason) || sending}
                  onClick={() => setStep('confirm')}
                  className="min-h-11 px-4 rounded-lg bg-zinc-800 text-sm text-white disabled:opacity-40"
                >
                  환불 내용 확인
                </button>
              ) : (
                <button type="button" disabled={sending} onClick={() => { void confirm(); }} className="min-h-11 px-4 rounded-lg border border-amber-200/70 bg-amber-200/10 text-sm font-medium text-amber-50 disabled:opacity-40">
                  {sending ? '취소 확인 중' : '전액 환불 확정'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
