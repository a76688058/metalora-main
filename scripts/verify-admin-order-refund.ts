import { readFileSync } from 'node:fs';
import {
  createRefundFlight,
  interpretCancelResponse,
  postFullRefund,
  refundEligibility,
  refundMethodFromSources,
  type RefundOrderFacts,
} from '../src/components/admin/adminRefundContract.ts';
import {
  normalizeCancellationRows,
  parseCancellationRecords,
  presentCancellation,
} from '../src/lib/cancellationInspection.ts';

let failed = 0;

function assert(label: string, condition: boolean) {
  if (!condition) {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

const paid: RefundOrderFacts = {
  id: '11111111-1111-4111-8111-111111111111',
  orderNumber: 'MOCK-ORDER',
  status: 'PAID',
  totalPrice: 100,
  method: '카드',
};

assert('paid card can open refund', refundEligibility(paid, false).ok);
assert('production cannot refund', refundEligibility({ ...paid, status: 'PRODUCTION' }, false).ok === false);
assert('shipping cannot refund', refundEligibility({ ...paid, status: 'SHIPPING' }, false).ok === false);
assert('completed cannot refund', refundEligibility({ ...paid, status: 'COMPLETED' }, false).ok === false);
assert('non-card cannot refund', refundEligibility({ ...paid, method: '간편결제' }, false).ok === false);
assert('english card alias stays blocked', refundEligibility({ ...paid, method: refundMethodFromSources('CARD', null) }, false).ok === false);
assert('easy pay snapshot stays blocked', refundEligibility({ ...paid, method: refundMethodFromSources(null, 'EASY_PAY') }, false).ok === false);
assert('easy pay korean stays blocked', refundEligibility({ ...paid, method: refundMethodFromSources(null, '간편결제') }, false).ok === false);
assert('disagreeing methods stay blocked', refundMethodFromSources('카드', '간편결제') === '');
const snapshotCardMethod = refundMethodFromSources(null, '카드');
assert('blank method column uses the card snapshot', snapshotCardMethod === '카드');
assert('blank method column can open refund', refundEligibility({ ...paid, method: snapshotCardMethod }, false).ok === true);
assert('cancelled cannot refund', refundEligibility({ ...paid, status: 'CANCELLED' }, false).ok === false);
assert('locked order cannot refund', refundEligibility(paid, true).ok === false);
assert('zero amount cannot refund', refundEligibility({ ...paid, totalPrice: 0 }, false).ok === false);
const orderSource = readFileSync(new URL('../src/components/admin/adminOrders.ts', import.meta.url), 'utf8');
assert('order select reads only the payment method key', orderSource.includes('refund_payment_method:shipping_info->>payment_method') && !orderSource.includes(', shipping_info,'));
assert('order mapping uses the cancellation method rule', orderSource.includes('refundMethodFromSources(row.method, row.refund_payment_method)'));
assert('cancelled label is mapped', orderSource.includes("if (status === CANCELLED_ORDER_STATUS) return '결제 취소';"));
assert('paid label stays in the fulfillment map', orderSource.includes("PAID: '결제확인'"));
assert('cancelled is outside fulfillment transitions', !orderSource.includes("CANCELLED: 'PRODUCTION'"));
const dialogSource = readFileSync(new URL('../src/components/admin/AdminOrderRefund.tsx', import.meta.url), 'utf8');
assert('final amount label is present', dialogSource.includes('최종 환불 금액'));
assert('amount comes from the order snapshot', dialogSource.includes('formatWon(draft.totalPrice)'));
assert('final action stays a button', dialogSource.includes("type=\"button\"") && dialogSource.includes('전액 환불 확정'));
assert('session notice is not a stored reason', !dialogSource.includes('입력한 취소 사유'));
assert('history title is present', dialogSource.includes('결제 취소 기록'));

const leaked = normalizeCancellationRows([{
  cancellation_id: '00000000-0000-4000-8000-0000000000aa',
  order_id: '00000000-0000-4000-8000-0000000000bb',
  status: 'confirmed',
  paid_amount: 100,
  cancel_amount: 100,
  cancel_reason: '사유',
  created_at: '2026-11-24T02:00:00.000Z',
  provider_attempted_at: null,
  updated_at: '2026-11-24T02:02:00.000Z',
  ledger_recorded: true,
  payment_key: 'pay_should_not_leak',
  transaction_key: 'tx_should_not_leak',
}]);
assert('normalization drops secret fields', leaked.length === 1 && !JSON.stringify(leaked).includes('pay_should_not_leak'));
assert('confirmed ledger is a completed cancellation', leaked[0] !== undefined && presentCancellation(leaked[0]) === 'confirmed');
assert('confirmed without a ledger needs reconciliation', presentCancellation({ ...leaked[0]!, ledgerRecorded: false }) === 'reconciliation_required');
assert('provider uncertainty stays uncertain', presentCancellation({ ...leaked[0]!, status: 'provider_uncertain', ledgerRecorded: false, cancelAmount: null }) === 'provider_uncertain');
assert('local uncertainty needs reconciliation', presentCancellation({ ...leaked[0]!, status: 'local_uncertain', ledgerRecorded: false }) === 'reconciliation_required');
assert('provider rejection stays rejected', presentCancellation({ ...leaked[0]!, status: 'provider_rejected', ledgerRecorded: false, cancelAmount: null }) === 'provider_rejected');
const missing = parseCancellationRecords([{
  cancellationId: '00000000-0000-4000-8000-0000000000cc',
  orderId: '00000000-0000-4000-8000-0000000000bb',
  status: 'pending',
  paidAmount: 100,
  cancelAmount: null,
  cancelReason: null,
  createdAt: null,
  attemptedAt: null,
  updatedAt: null,
  ledgerRecorded: false,
}]);
assert('missing optional metadata stays null', missing.length === 1 && missing[0]?.cancelReason === null && missing[0]?.createdAt === null && presentCancellation(missing[0]!) === 'in_progress');

const migration = readFileSync(new URL('../supabase/migrations/20261124210000_admin_read_order_cancellations.sql', import.meta.url), 'utf8');
assert('read function is security definer', migration.includes('SECURITY DEFINER'));
assert('read function pins search_path', migration.includes('SET search_path = pg_catalog, pg_temp'));
assert('read function revokes public execution', migration.includes('REVOKE ALL ON FUNCTION public.admin_read_order_cancellations(uuid) FROM PUBLIC, anon, authenticated;'));
assert('read function grants only service_role', migration.includes('GRANT EXECUTE ON FUNCTION public.admin_read_order_cancellations(uuid) TO service_role;'));
assert('read function does not grant table select', !migration.includes('GRANT SELECT'));
assert('read function does not return payment_key', !migration.includes('payment_key'));
assert('read function has no dynamic sql', !migration.includes('EXECUTE format') && !migration.includes('EXECUTE('));
assert('read function does not write', !/\b(INSERT|UPDATE|DELETE)\b/.test(migration));
assert('read function selects one order', migration.includes('WHERE attempt.order_id = p_order_id'));

const flight = createRefundFlight();
assert('first submission starts', flight.tryBegin(paid.id));
assert('second submission is blocked', flight.tryBegin(paid.id) === false);
flight.end();
assert('submission can start after the first ends', flight.tryBegin(paid.id));

assert('success is confirmed', interpretCancelResponse({
  aborted: false,
  status: 200,
  body: { ok: true, alreadyComplete: false },
}).kind === 'confirmed');
assert('missing proof is not success', interpretCancelResponse({
  aborted: false,
  status: 200,
  body: { ok: true },
}).kind === 'uncertain');
assert('unauthorized is separate', interpretCancelResponse({
  aborted: false,
  status: 401,
  body: { ok: false, error: 'unauthorized' },
}).kind === 'unauthorized');
assert('timeout is uncertain', interpretCancelResponse({ aborted: true, status: null, body: null }).kind === 'uncertain');
assert('provider uncertainty locks retry', interpretCancelResponse({
  aborted: false,
  status: 503,
  body: { ok: false, error: 'reconciliation_required' },
}).kind === 'uncertain');
assert('rejected provider can be reviewed again', (() => {
  const result = interpretCancelResponse({ aborted: false, status: 409, body: { ok: false, error: 'provider_rejected' } });
  return result.kind === 'rejected' && result.retryable;
})());

let calls = 0;
const result = await postFullRefund({
  orderId: paid.id,
  cancelReason: '목업 사유',
  token: 'session-token',
  timeoutMs: 1000,
  fetchImpl: async (url, init) => {
    calls += 1;
    const body = JSON.parse(String(init?.body));
    assert('posts the order id', String(url).includes(paid.id));
    assert('sends only the reason', body.cancelReason === '목업 사유' && body.cancelAmount === undefined);
    const authorization = String((init?.headers as { Authorization?: string })?.Authorization ?? '');
    assert('uses a bearer header', authorization.startsWith('Bearer ') && authorization.length > 'Bearer '.length);
    return new Response(JSON.stringify({ ok: true, alreadyComplete: false }), { status: 200 });
  },
});
assert('one request was sent', calls === 1 && result.kind === 'confirmed');

const hung = await postFullRefund({
  orderId: paid.id,
  cancelReason: '목업 사유',
  token: 'session-token',
  timeoutMs: 20,
  fetchImpl: (_url, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  }),
});
assert('timeout does not become success', hung.kind === 'uncertain');

if (failed > 0) {
  console.error(`ADMIN_ORDER_REFUND failures=${failed}`);
  process.exit(1);
}
console.log('ADMIN_ORDER_REFUND=PASS');
