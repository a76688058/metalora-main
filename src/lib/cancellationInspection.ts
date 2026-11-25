export const CANCELLATION_STATUSES = [
  'pending',
  'provider_uncertain',
  'provider_rejected',
  'confirmed',
  'local_uncertain',
] as const;

export type CancellationRowStatus = (typeof CANCELLATION_STATUSES)[number];

export type PersistedCancellationRecord = {
  cancellationId: string;
  orderId: string;
  status: CancellationRowStatus;
  paidAmount: number;
  cancelAmount: number | null;
  cancelReason: string | null;
  createdAt: string | null;
  attemptedAt: string | null;
  updatedAt: string | null;
  ledgerRecorded: boolean;
};

export type CancellationPresentation =
  | 'confirmed'
  | 'in_progress'
  | 'provider_uncertain'
  | 'reconciliation_required'
  | 'provider_rejected';

const STATUS_SET = new Set<string>(CANCELLATION_STATUSES);

function wholeAmount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function presentCancellation(record: PersistedCancellationRecord): CancellationPresentation {
  if (record.status === 'confirmed') {
    return record.ledgerRecorded ? 'confirmed' : 'reconciliation_required';
  }
  if (record.status === 'pending') return 'in_progress';
  if (record.status === 'provider_uncertain') return 'provider_uncertain';
  if (record.status === 'local_uncertain') return 'reconciliation_required';
  return 'provider_rejected';
}

export function cancellationStatusLabel(presentation: CancellationPresentation): string {
  if (presentation === 'confirmed') return '결제 취소 완료';
  if (presentation === 'in_progress') return '결제 취소 진행 중';
  if (presentation === 'provider_rejected') return '결제사 취소 거절';
  if (presentation === 'reconciliation_required') return '결제 취소 확인 · 내부 처리 확인 필요';
  return '결제 취소 결과 확인이 필요합니다.';
}

export function parseCancellationRecords(data: unknown): PersistedCancellationRecord[] {
  if (!Array.isArray(data)) return [];
  const records: PersistedCancellationRecord[] = [];
  for (const row of data) {
    if (!row || typeof row !== 'object') continue;
    const item = row as Record<string, unknown>;
    const status = item.status;
    const cancellationId = textOrNull(item.cancellationId);
    const orderId = textOrNull(item.orderId);
    const paidAmount = wholeAmount(item.paidAmount);
    if (!cancellationId || !orderId || paidAmount === null || typeof status !== 'string' || !STATUS_SET.has(status)) continue;
    records.push({
      cancellationId,
      orderId,
      status: status as CancellationRowStatus,
      paidAmount,
      cancelAmount: wholeAmount(item.cancelAmount),
      cancelReason: textOrNull(item.cancelReason),
      createdAt: textOrNull(item.createdAt),
      attemptedAt: textOrNull(item.attemptedAt),
      updatedAt: textOrNull(item.updatedAt),
      ledgerRecorded: item.ledgerRecorded === true,
    });
  }
  return records;
}

export function normalizeCancellationRows(data: unknown): PersistedCancellationRecord[] {
  if (!Array.isArray(data)) return [];
  const records: PersistedCancellationRecord[] = [];
  for (const row of data) {
    if (!row || typeof row !== 'object') continue;
    const item = row as Record<string, unknown>;
    const status = item.status;
    const cancellationId = textOrNull(item.cancellation_id);
    const orderId = textOrNull(item.order_id);
    const paidAmount = wholeAmount(item.paid_amount);
    if (!cancellationId || !orderId || !paidAmount || typeof status !== 'string' || !STATUS_SET.has(status)) continue;
    records.push({
      cancellationId,
      orderId,
      status: status as CancellationRowStatus,
      paidAmount,
      cancelAmount: wholeAmount(item.cancel_amount),
      cancelReason: textOrNull(item.cancel_reason),
      createdAt: textOrNull(item.created_at),
      attemptedAt: textOrNull(item.provider_attempted_at),
      updatedAt: textOrNull(item.updated_at),
      ledgerRecorded: item.ledger_recorded === true,
    });
  }
  return records;
}
