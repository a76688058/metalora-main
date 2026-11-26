import { parseCancellationRecords, type PersistedCancellationRecord } from '../../lib/cancellationInspection';

export const FULL_REFUND_TIMEOUT_MS = 15_000;

const FULFILLED = new Set(['PRODUCTION', 'SHIPPING', 'COMPLETED']);

export type RefundOrderFacts = {
  id: string;
  orderNumber: string;
  status: string;
  totalPrice: number;
  method: string;
};

export type RefundEligibility =
  | { ok: true }
  | { ok: false; reason: 'cancelled' | 'fulfilled' | 'not_paid' | 'not_card' | 'amount' | 'locked' };

export type RefundAttempt =
  | { kind: 'confirmed'; alreadyComplete: boolean }
  | { kind: 'rejected'; retryable: boolean; message: string }
  | { kind: 'uncertain'; message: string }
  | { kind: 'unauthorized'; message: string };

function presentMethod(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Applied cancellation rule: a blank orders.method falls back to
 * shipping_info.payment_method. Disagreeing values are not eligible.
 * Only the exact method 카드 can open a refund.
 */
export function refundMethodFromSources(column: unknown, snapshot: unknown): string {
  const method = presentMethod(column);
  const info = presentMethod(snapshot);
  if (method && info && method !== info) return '';
  return method ?? info ?? '';
}

export function refundEligibility(order: RefundOrderFacts, locked: boolean): RefundEligibility {
  if (locked) return { ok: false, reason: 'locked' };
  if (!Number.isSafeInteger(order.totalPrice) || order.totalPrice <= 0) return { ok: false, reason: 'amount' };
  if (order.status === 'CANCELLED') return { ok: false, reason: 'cancelled' };
  if (FULFILLED.has(order.status)) return { ok: false, reason: 'fulfilled' };
  if (order.status !== 'PAID') return { ok: false, reason: 'not_paid' };
  if (order.method.trim() !== '카드') return { ok: false, reason: 'not_card' };
  return { ok: true };
}

export function refundBlockMessage(reason: Exclude<RefundEligibility, { ok: true }>['reason']): string {
  if (reason === 'cancelled') return '이미 결제가 취소된 주문입니다.';
  if (reason === 'fulfilled') return '제작·배송이 시작된 주문은 이 화면에서 취소할 수 없습니다.';
  if (reason === 'not_card') return '카드 결제만 전액 취소할 수 있습니다.';
  if (reason === 'amount') return '주문 금액을 확인할 수 없어 취소를 열 수 없습니다.';
  if (reason === 'locked') return '이전 취소 결과를 확인할 수 없습니다. 다시 요청하지 않습니다.';
  return '결제확인 상태의 주문만 취소할 수 있습니다.';
}

export function normalizeCancelReason(value: string): string | null {
  const reason = value.trim();
  if (reason.length < 1 || reason.length > 200) return null;
  return reason;
}

export const REFUND_INPUT_BLOCKED_MESSAGE = '취소 요청을 시작하지 않았습니다. 사유와 주문을 다시 확인해 주세요.';
export const REFUND_DUPLICATE_BLOCKED_MESSAGE = '이미 진행 중인 취소 확인이 있어 다시 보내지 않았습니다.';
export const REFUND_SESSION_LOOKUP_FAILED_MESSAGE = '로그인 세션을 확인하지 못했습니다. 취소 요청은 보내지 않았습니다.';
export const REFUND_TOKEN_UNAVAILABLE_MESSAGE = '관리자 인증 정보가 없습니다. 취소 요청은 보내지 않았습니다.';
export const REFUND_REQUEST_SENT_MESSAGE = '취소 요청을 보냈습니다. 응답을 기다리는 중입니다.';
export const REFUND_HTTP_UNAUTHORIZED_MESSAGE = '서버가 관리자 로그인을 거절했습니다. 취소 요청은 전달되었습니다.';

const SESSION_LOOKUP_TIMEOUT_MS = 10_000;

export function createRefundFlight() {
  let activeOrderId: string | null = null;
  return {
    tryBegin(orderId: string) {
      if (activeOrderId) return false;
      activeOrderId = orderId;
      return true;
    },
    end() {
      activeOrderId = null;
    },
  };
}

export function interpretCancelResponse(input: {
  aborted: boolean;
  status: number | null;
  body: unknown;
}): RefundAttempt {
  if (input.aborted || input.status === null) {
    return {
      kind: 'uncertain',
      message: '취소 응답을 확인하지 못했습니다. 다시 요청하지 않습니다. 결제 취소 확인 · 내부 처리 확인 필요.',
    };
  }
  const body = input.body && typeof input.body === 'object' ? input.body as { ok?: unknown; error?: unknown; alreadyComplete?: unknown } : null;
  if (input.status === 200 && body?.ok === true && typeof body.alreadyComplete === 'boolean') {
    return { kind: 'confirmed', alreadyComplete: body.alreadyComplete };
  }
  if (input.status === 401 || input.status === 403) {
    return { kind: 'unauthorized', message: REFUND_HTTP_UNAUTHORIZED_MESSAGE };
  }
  const error = typeof body?.error === 'string' ? body.error : '';
  if (input.status === 400 && error === 'invalid_reason') {
    return { kind: 'rejected', retryable: true, message: '취소 사유는 1자 이상 200자 이하로 입력해 주세요.' };
  }
  if (error === 'provider_rejected') {
    return { kind: 'rejected', retryable: true, message: '결제사에서 취소를 거절했습니다. 주문 상태를 다시 확인한 뒤 진행할 수 있습니다.' };
  }
  if (
    error === 'in_progress'
    || error === 'reconciliation_required'
    || error === 'unavailable'
    || input.status === 503
    || input.status >= 500
  ) {
    return {
      kind: 'uncertain',
      message: '결제 취소 확인 · 내부 처리 확인 필요. 다시 요청하지 않습니다.',
    };
  }
  if (error === 'fulfilled') return { kind: 'rejected', retryable: false, message: refundBlockMessage('fulfilled') };
  if (error === 'method_unsupported') return { kind: 'rejected', retryable: false, message: refundBlockMessage('not_card') };
  if (error === 'not_eligible' || error === 'payment_key_missing' || error === 'payment_key_mismatch' || error === 'not_found') {
    return { kind: 'rejected', retryable: false, message: '이 주문은 현재 전액 취소 조건에 맞지 않습니다. 다시 요청하지 않습니다.' };
  }
  return {
    kind: 'uncertain',
    message: '결제 취소 확인 · 내부 처리 확인 필요. 다시 요청하지 않습니다.',
  };
}

export async function postFullRefund(input: {
  orderId: string;
  cancelReason: string;
  token: string;
  fetchImpl: typeof fetch;
  timeoutMs?: number;
  onInitiate?: () => void;
}): Promise<RefundAttempt> {
  const reason = normalizeCancelReason(input.cancelReason);
  if (!reason) return { kind: 'rejected', retryable: true, message: '취소 사유는 1자 이상 200자 이하로 입력해 주세요.' };
  if (!input.token.trim()) {
    return { kind: 'unauthorized', message: REFUND_TOKEN_UNAVAILABLE_MESSAGE };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? FULL_REFUND_TIMEOUT_MS);
  try {
    try {
      input.onInitiate?.();
    } catch {
      // The diagnostic notice must not change the refund request.
    }
    const response = await input.fetchImpl(`/api/admin/orders/${encodeURIComponent(input.orderId)}/cancel`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.token}`,
      },
      body: JSON.stringify({ cancelReason: reason }),
    });
    const body = await response.json().catch(() => null);
    return interpretCancelResponse({ aborted: false, status: response.status, body });
  } catch {
    return interpretCancelResponse({ aborted: controller.signal.aborted, status: null, body: null });
  } finally {
    clearTimeout(timer);
  }
}

export type CancellationLoadResult =
  | { ok: true; records: PersistedCancellationRecord[] }
  | { ok: false; kind: 'unauthorized' | 'unavailable' };

export async function loadAdminCancellationRecords(input: {
  orderId: string;
  fetchImpl?: typeof fetch;
}): Promise<CancellationLoadResult> {
  const { supabase } = await import('../../lib/supabase');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token?.trim() ?? '';
  if (!token) return { ok: false, kind: 'unauthorized' };
  try {
    const response = await (input.fetchImpl ?? fetch)(
      `/api/admin/orders/${encodeURIComponent(input.orderId)}/cancellation`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const body = await response.json().catch(() => null) as { ok?: unknown; records?: unknown } | null;
    if (response.status === 401 || response.status === 403) return { ok: false, kind: 'unauthorized' };
    if (!response.ok || body?.ok !== true || !Array.isArray(body.records)) return { ok: false, kind: 'unavailable' };
    return { ok: true, records: parseCancellationRecords(body.records) };
  } catch {
    return { ok: false, kind: 'unavailable' };
  }
}

export async function submitAdminFullRefund(input: {
  orderId: string;
  cancelReason: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  sessionTimeoutMs?: number;
  loadAccessToken?: () => Promise<string>;
  onInitiate?: () => void;
}): Promise<RefundAttempt> {
  try {
    const token = (await waitForAccessToken(input)).trim();
    return await postFullRefund({
      orderId: input.orderId,
      cancelReason: input.cancelReason,
      token,
      fetchImpl: input.fetchImpl ?? fetch,
      timeoutMs: input.timeoutMs,
      onInitiate: input.onInitiate,
    });
  } catch {
    return { kind: 'unauthorized', message: REFUND_SESSION_LOOKUP_FAILED_MESSAGE };
  }
}

function waitForAccessToken(input: {
  sessionTimeoutMs?: number;
  loadAccessToken?: () => Promise<string>;
}): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutMs = input.sessionTimeoutMs ?? SESSION_LOOKUP_TIMEOUT_MS;
  return new Promise<string>((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('session_timeout')), timeoutMs);
    const read = input.loadAccessToken ? input.loadAccessToken() : readStoredAccessToken();
    read.then(resolve, reject);
  }).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function readStoredAccessToken(): Promise<string> {
  const { supabase } = await import('../../lib/supabase');
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return typeof token === 'string' ? token.trim() : '';
}
