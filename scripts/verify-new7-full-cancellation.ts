import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { confirmFreezeBlock, PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 } from '../src/lib/publicPaymentFreeze';
import {
  executeFullOrderCancellation,
  readFullCancelProof,
  registerFullOrderCancellationRoute,
  type CancellationPort,
  type CancellationProvider,
  type CancellationRecord,
} from '../src/lib/paymentCancellation';
import { fullCancelRequestBody, postTossFullCancel } from '../src/lib/tossPaymentCancel';

const orderId = '00000000-0000-4000-8000-0000000000c3';
const actorId = '00000000-0000-4000-8000-0000000000d4';
const failures: string[] = [];

function assert(name: string, ok: boolean) {
  if (!ok) failures.push(name);
  else console.log(`PASS ${name}`);
}

function payment(status: string, extra: Record<string, unknown> = {}) {
  return {
    status,
    orderId: 'SYN-CANCEL-1',
    paymentKey: 'pay_test_full',
    totalAmount: 100,
    balanceAmount: status === 'CANCELED' ? 0 : 100,
    cancels: status === 'CANCELED'
      ? [{ cancelStatus: 'DONE', cancelAmount: 100, transactionKey: 'tx_full_1', refundableAmount: 0 }]
      : null,
    ...extra,
  };
}

function memoryPort(seed?: Partial<CancellationRecord> & { eligible?: boolean; fulfilled?: boolean }) {
  const calls = { cancel: 0, lookup: 0, finalize: 0 };
  let row: CancellationRecord | null = seed?.id
    ? {
        id: seed.id,
        orderNumber: 'SYN-CANCEL-1',
        paymentKey: 'pay_test_full',
        idempotencyKey: '00000000-0000-4000-8000-0000000000e5',
        paidAmount: 100,
        status: seed.status ?? 'pending',
        providerAttemptedAt: seed.providerAttemptedAt ?? null,
        transactionKey: seed.transactionKey ?? null,
      }
    : null;
  let claimed = Boolean(seed?.providerAttemptedAt);
  let orderStatus = seed?.fulfilled ? 'COMPLETED' : 'PAID';
  let commerce: string | null = seed?.fulfilled ? 'fulfilled' : null;
  const ledger = new Set<string>();
  const port: CancellationPort = {
    async begin() {
      if (seed?.eligible === false) return { ok: false, error: 'payment_key_missing' };
      if (seed?.fulfilled) return { ok: false, error: 'fulfilled' };
      if (!row) {
        row = {
          id: '00000000-0000-4000-8000-0000000000f6',
          orderNumber: 'SYN-CANCEL-1',
          paymentKey: 'pay_test_full',
          idempotencyKey: '00000000-0000-4000-8000-0000000000e5',
          paidAmount: 100,
          status: 'pending',
          providerAttemptedAt: null,
          transactionKey: null,
        };
      }
      return { ok: true, row: { ...row } };
    },
    async claim(id) {
      if (!row || row.id !== id || claimed || row.status !== 'pending') return false;
      claimed = true;
      row.providerAttemptedAt = '2026-10-19T00:00:00.000Z';
      return true;
    },
    async mark(id, status) {
      if (!row || row.id !== id) throw new Error('missing');
      row.status = status;
    },
    async finalize(id, transactionKey, cancelAmount) {
      if (!row || row.id !== id || cancelAmount !== row.paidAmount) return 'failed';
      if (ledger.size > 0 && !ledger.has(transactionKey)) return 'failed';
      ledger.add(transactionKey);
      row.status = 'confirmed';
      row.transactionKey = transactionKey;
      orderStatus = 'CANCELLED';
      commerce = 'cancelled';
      calls.finalize += 1;
      return 'ok';
    },
  };
  return { port, calls, ledger, state: () => ({ orderStatus, commerce, status: row?.status ?? null }) };
}

function provider(script: {
  cancel: Array<Awaited<ReturnType<CancellationProvider['cancel']>>>;
  lookup: Array<Awaited<ReturnType<CancellationProvider['lookup']>>>;
}): CancellationProvider & { counts: { cancel: number; lookup: number } } {
  const counts = { cancel: 0, lookup: 0 };
  return {
    counts,
    async cancel() {
      const next = script.cancel[counts.cancel];
      counts.cancel += 1;
      if (!next) throw new Error('unexpected cancel');
      return next;
    },
    async lookup() {
      const next = script.lookup[counts.lookup];
      counts.lookup += 1;
      if (!next) throw new Error('unexpected lookup');
      return next;
    },
  };
}

async function main() {
  assert('accepted activation leaves the public freeze off', PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 === false);
  assert('confirm stays open while the accepted freeze is off', confirmFreezeBlock() === null);
  const serverSrc = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../server.ts'), 'utf8');
  const prepareAt = serverSrc.indexOf('app.post("/api/payment/prepare"');
  const confirmAt = serverSrc.indexOf('app.post("/api/payment/confirm"');
  assert('prepare refuses a new charge while frozen', prepareAt > 0 && serverSrc.slice(prepareAt, prepareAt + 500).includes('publicPaymentPrepareGuard()'));
  assert('confirm fails closed while frozen', confirmAt > 0 && serverSrc.slice(confirmAt, confirmAt + 500).includes('confirmFreezeBlock()'));
  assert('full cancel body omits amount', !('cancelAmount' in fullCancelRequestBody('관리자 전액 취소')));

  const recorded: { url?: string; body?: string; key?: string } = {};
  const posted = await postTossFullCancel(
    (async (url, init) => {
      recorded.url = String(url);
      recorded.body = String(init?.body);
      recorded.key = new Headers(init?.headers).get('Idempotency-Key') ?? undefined;
      return new Response(JSON.stringify(payment('CANCELED')), { status: 200 });
    }) as typeof fetch,
    'test_sk_local',
    { paymentKey: 'pay/test', cancelReason: '관리자 전액 취소', idempotencyKey: 'idem-1' },
  );
  assert('adapter posts the official cancel path', posted.ok === true && recorded.url === 'https://api.tosspayments.com/v1/payments/pay%2Ftest/cancel');
  assert('adapter sends the idempotency header and no amount', recorded.key === 'idem-1' && recorded.body === '{"cancelReason":"관리자 전액 취소"}');

  const proof = readFullCancelProof(payment('CANCELED'), {
    orderNumber: 'SYN-CANCEL-1',
    paymentKey: 'pay_test_full',
    paidAmount: 100,
  });
  assert('full proof requires one done cancel', proof.ok === true && proof.transactionKey === 'tx_full_1');
  const partial = readFullCancelProof(payment('PARTIAL_CANCELED', {
    balanceAmount: 40,
    cancels: [{ cancelStatus: 'DONE', cancelAmount: 60, transactionKey: 'tx_part', refundableAmount: 40 }],
  }), { orderNumber: 'SYN-CANCEL-1', paymentKey: 'pay_test_full', paidAmount: 100 });
  assert('partial provider result is not a full cancel', partial.ok === false);

  const success = memoryPort();
  const successProvider = provider({
    cancel: [{ ok: true, payment: payment('CANCELED') }],
    lookup: [{ ok: true, payment: payment('CANCELED') }],
  });
  const successResult = await executeFullOrderCancellation(success.port, successProvider, {
    orderId, actorUserId: actorId, cancelReason: '관리자 전액 취소',
  });
  const successState = success.state();
  assert('successful full cancellation finalizes once', successResult.ok === true && success.calls.finalize === 1 && successState.orderStatus === 'CANCELLED' && successState.commerce === 'cancelled');
  assert('successful cancel calls provider once', successProvider.counts.cancel === 1 && successProvider.counts.lookup === 1);

  const repeat = await executeFullOrderCancellation(success.port, successProvider, {
    orderId, actorUserId: actorId, cancelReason: '관리자 전액 취소',
  });
  assert('confirmed cancellation does not call the provider again', repeat.ok === true && repeat.alreadyComplete === true && successProvider.counts.cancel === 1);

  const rejectedPort = memoryPort();
  const rejectedProvider = provider({
    cancel: [{ ok: false, kind: 'rejected', code: 'NOT_CANCELABLE' }],
    lookup: [{ ok: true, payment: payment('DONE') }],
  });
  const rejected = await executeFullOrderCancellation(rejectedPort.port, rejectedProvider, {
    orderId, actorUserId: actorId, cancelReason: '관리자 전액 취소',
  });
  assert('provider rejection leaves the order paid', rejected.ok === false && rejected.error === 'provider_rejected' && rejectedPort.state().orderStatus === 'PAID' && rejectedPort.state().status === 'provider_rejected');

  const timeoutPort = memoryPort();
  const timeoutProvider = provider({
    cancel: [{ ok: false, kind: 'timeout' }],
    lookup: [{ ok: false, kind: 'timeout' }, { ok: true, payment: payment('CANCELED') }],
  });
  const timedOut = await executeFullOrderCancellation(timeoutPort.port, timeoutProvider, {
    orderId, actorUserId: actorId, cancelReason: '관리자 전액 취소',
  });
  assert('timeout without lookup stays unfinalized', timedOut.ok === false && timedOut.error === 'reconciliation_required' && timeoutPort.state().orderStatus === 'PAID' && timeoutPort.state().status === 'provider_uncertain');
  const recovered = await executeFullOrderCancellation(timeoutPort.port, timeoutProvider, {
    orderId, actorUserId: actorId, cancelReason: '관리자 전액 취소',
  });
  assert('later lookup finalizes a timed-out cancel without a second post', recovered.ok === true && timeoutProvider.counts.cancel === 1 && timeoutPort.calls.finalize === 1 && timeoutPort.state().commerce === 'cancelled');

  const replayPort = memoryPort();
  const replayProvider = provider({
    cancel: [{ ok: false, kind: 'timeout' }],
    lookup: [{ ok: false, kind: 'timeout' }, { ok: true, payment: payment('DONE') }],
  });
  const replayFirst = await executeFullOrderCancellation(replayPort.port, replayProvider, {
    orderId, actorUserId: actorId, cancelReason: '관리자 전액 취소',
  });
  const replaySecond = await executeFullOrderCancellation(replayPort.port, replayProvider, {
    orderId, actorUserId: actorId, cancelReason: '관리자 전액 취소',
  });
  assert('a paid replay after timeout does not post a second cancel', replayFirst.ok === false && replaySecond.ok === false && replaySecond.error === 'reconciliation_required' && replayProvider.counts.cancel === 1 && replayPort.state().orderStatus === 'PAID');

  const partialPort = memoryPort();
  const partialProvider = provider({
    cancel: [{ ok: true, payment: payment('PARTIAL_CANCELED', { balanceAmount: 40, cancels: [{ cancelStatus: 'DONE', cancelAmount: 60, transactionKey: 'tx_part', refundableAmount: 40 }] }) }],
    lookup: [],
  });
  const partialResult = await executeFullOrderCancellation(partialPort.port, partialProvider, {
    orderId, actorUserId: actorId, cancelReason: '관리자 전액 취소',
  });
  assert('partial result does not finalize or free the attempt', partialResult.ok === false && partialResult.error === 'reconciliation_required' && partialPort.state().status === 'local_uncertain' && partialPort.calls.finalize === 0);

  let claims = 0;
  const concurrentRow: CancellationRecord = {
    id: '00000000-0000-4000-8000-0000000000f6',
    orderNumber: 'SYN-CANCEL-1',
    paymentKey: 'pay_test_full',
    idempotencyKey: '00000000-0000-4000-8000-0000000000e5',
    paidAmount: 100,
    status: 'pending',
    providerAttemptedAt: null,
    transactionKey: null,
  };
  const concurrentPort: CancellationPort = {
    async begin() { return { ok: true, row: { ...concurrentRow } }; },
    async claim() {
      claims += 1;
      if (claims > 1) return false;
      concurrentRow.providerAttemptedAt = '2026-10-19T00:00:00.000Z';
      return true;
    },
    async mark() { return undefined; },
    async finalize() { return 'ok'; },
  };
  const concurrentProvider = provider({
    cancel: [{ ok: true, payment: payment('CANCELED') }],
    lookup: [{ ok: true, payment: payment('CANCELED') }],
  });
  const [first, second] = await Promise.all([
    executeFullOrderCancellation(concurrentPort, concurrentProvider, { orderId, actorUserId: actorId, cancelReason: '관리자 전액 취소' }),
    executeFullOrderCancellation(concurrentPort, concurrentProvider, { orderId, actorUserId: actorId, cancelReason: '관리자 전액 취소' }),
  ]);
  const outcomes = [first, second];
  assert('one concurrent attempt is rejected before a second provider call', outcomes.filter((item) => item.ok === false && item.error === 'in_progress').length === 1 && concurrentProvider.counts.cancel === 1);

  const missingKey = memoryPort({ eligible: false });
  const missingProvider = provider({ cancel: [], lookup: [] });
  const missing = await executeFullOrderCancellation(missingKey.port, missingProvider, {
    orderId, actorUserId: actorId, cancelReason: '관리자 전액 취소',
  });
  assert('missing stored payment key is refused', missing.ok === false && missing.error === 'payment_key_missing' && missingProvider.counts.cancel === 0);

  const fulfilled = memoryPort({ fulfilled: true });
  const fulfilledProvider = provider({ cancel: [], lookup: [] });
  const fulfilledResult = await executeFullOrderCancellation(fulfilled.port, fulfilledProvider, {
    orderId, actorUserId: actorId, cancelReason: '관리자 전액 취소',
  });
  assert('fulfilled order is refused', fulfilledResult.ok === false && fulfilledResult.error === 'fulfilled' && fulfilledProvider.counts.cancel === 0);

  const calls: string[] = [];
  const fakeClients = (admin: boolean) => ({
    auth: { getUser: async () => ({ data: { user: { id: actorId } }, error: null }) },
    from(table: string) {
      calls.push(table);
      const self = {
        select() { return self; },
        eq() { return self; },
        maybeSingle: async () => ({
          data: table === 'profiles' ? { id: actorId, is_admin: admin, withdrawn_at: null } : null,
          error: null,
        }),
      };
      return self;
    },
  });
  const post = async (authorization: string | undefined, admin: boolean) => {
    calls.length = 0;
    const app = express();
    const clients = fakeClients(admin);
    registerFullOrderCancellationRoute(app, {
      supabaseAdmin: clients as never,
      supabasePublic: clients as never,
      provider: missingProvider,
      port: missingKey.port,
    });
    const server = await new Promise<import('node:http').Server>((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    const address = server.address();
    const port = address && typeof address === 'object' ? address.port : 0;
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/orders/${orderId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
      body: JSON.stringify({ cancelReason: '관리자 전액 취소' }),
    });
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    return response.status;
  };
  assert('missing caller is unauthorized', (await post(undefined, false)) === 401 && calls.length === 0);
  assert('non-admin is forbidden before cancellation', (await post('Bearer user', false)) === 403 && !calls.includes('orders'));

  let readRpc = 0;
  let readCancel = 0;
  const readProvider: CancellationProvider = {
    async cancel() {
      readCancel += 1;
      throw new Error('read must not cancel');
    },
    async lookup() {
      readCancel += 1;
      throw new Error('read must not lookup');
    },
  };
  const readApp = express();
  const readClient = (admin: boolean, validToken: boolean) => ({
    auth: {
      getUser: async () => validToken
        ? { data: { user: { id: actorId } }, error: null }
        : { data: { user: null }, error: { message: 'expired' } },
    },
    from() {
      const self = {
        select() { return self; },
        eq() { return self; },
        maybeSingle: async () => ({
          data: { id: actorId, is_admin: admin, withdrawn_at: null },
          error: null,
        }),
      };
      return self;
    },
    async rpc(name: string, args: { p_order_id: string }) {
      readRpc += 1;
      if (name !== 'admin_read_order_cancellations') throw new Error('unexpected rpc');
      return {
        data: [
          {
            cancellation_id: '00000000-0000-4000-8000-0000000000aa',
            order_id: args.p_order_id,
            status: 'confirmed',
            paid_amount: '100',
            cancel_amount: 100,
            cancel_reason: '목업 사유',
            created_at: '2026-11-24T02:00:00.000Z',
            provider_attempted_at: '2026-11-24T02:01:00.000Z',
            updated_at: '2026-11-24T02:02:00.000Z',
            ledger_recorded: true,
            payment_key: 'pay_should_not_leak',
            transaction_key: 'tx_should_not_leak',
          },
          {
            cancellation_id: '00000000-0000-4000-8000-0000000000bb',
            order_id: '00000000-0000-4000-8000-000000000099',
            status: 'confirmed',
            paid_amount: 100,
            cancel_amount: 100,
            cancel_reason: '다른 주문',
            created_at: '2026-11-24T02:00:00.000Z',
            provider_attempted_at: null,
            updated_at: null,
            ledger_recorded: true,
          },
        ],
        error: null,
      };
    },
  });
  const read = async (authorization: string | undefined, admin: boolean, validToken: boolean, target = orderId) => {
    readRpc = 0;
    readApp.locals.client = readClient(admin, validToken);
    const server = await new Promise<import('node:http').Server>((resolve) => {
      const listening = readApp.listen(0, '127.0.0.1', () => resolve(listening));
    });
    const address = server.address();
    const port = address && typeof address === 'object' ? address.port : 0;
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/orders/${target}/cancellation`, {
      headers: authorization ? { Authorization: authorization } : {},
    });
    const body = await response.json() as { records?: Array<Record<string, unknown>> };
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    return { status: response.status, body };
  };
  registerFullOrderCancellationRoute(readApp, {
    supabaseAdmin: { rpc: (...args: [string, { p_order_id: string }]) => readApp.locals.client.rpc(...args), from: (...args: []) => readApp.locals.client.from(...args) } as never,
    supabasePublic: { auth: { getUser: (token: string) => readApp.locals.client.auth.getUser(token) } } as never,
    provider: readProvider,
  });
  const missingRead = await read(undefined, false, false);
  assert('cancellation read without a caller is unauthorized', missingRead.status === 401 && readRpc === 0 && readCancel === 0);
  const expiredRead = await read('Bearer expired', true, false);
  assert('expired cancellation read is unauthorized', expiredRead.status === 401 && readRpc === 0);
  const customerRead = await read('Bearer customer', false, true);
  assert('customer cancellation read is forbidden', customerRead.status === 403 && readRpc === 0);
  const invalidRead = await read('Bearer admin', true, true, 'not-a-uuid');
  assert('invalid cancellation order id is rejected', invalidRead.status === 400 && readRpc === 0);
  const adminRead = await read('Bearer admin', true, true);
  const serialized = JSON.stringify(adminRead.body);
  assert('admin cancellation read returns only the requested order', adminRead.status === 200 && adminRead.body.records?.length === 1 && adminRead.body.records[0]?.orderId === orderId);
  assert('admin cancellation read hides payment identifiers', !serialized.includes('payment_key') && !serialized.includes('pay_should_not_leak') && !serialized.includes('transaction_key') && !serialized.includes('tx_should_not_leak') && readCancel === 0);

  if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'failed');
  process.exit(1);
});
