import { readFileSync } from 'node:fs';
import express from 'express';
import { completionSyncFeedback } from '../src/lib/reviewEligibilityFeedback';
import {
  REVIEW_COMMERCE_RPC,
  applyReviewCommerceTransition,
  registerReviewEligibilityRoute,
  syncCompletedOrderReviewEligibility,
  type ReviewCommerceSnapshot,
  type ReviewCommerceState,
} from '../src/lib/reviewCommerceEligibility';

const itemA = '00000000-0000-4000-8000-0000000000a1';
const itemB = '00000000-0000-4000-8000-0000000000b2';
const orderId = '00000000-0000-4000-8000-0000000000c3';

const eligible: ReviewCommerceSnapshot = {
  status: 'COMPLETED',
  completedAt: '2026-10-18T00:00:00.000Z',
  paymentFinalizedAt: '2026-10-17T00:00:00.000Z',
  itemIds: [itemA, itemB],
};

type Store = Map<string, ReviewCommerceState>;

function contractRpc(store: Store, writes: { count: number }, review: { status: string }, events: string[]) {
  return async (orderItemId: string, state: ReviewCommerceState) => {
    const previous = store.get(orderItemId) ?? null;
    if ((previous === 'cancelled' || previous === 'refunded') && state === 'fulfilled') {
      throw new Error('commerce_state_resurrection_forbidden');
    }
    if (previous !== state) {
      store.set(orderItemId, state);
      writes.count += 1;
    }
    if ((state === 'cancelled' || state === 'refunded') && review.status !== 'deleted' && review.status !== 'hidden') {
      events.push(state === 'cancelled' ? 'commerce_cancelled' : 'commerce_refunded');
      review.status = 'hidden';
    }
  };
}

function assert(name: string, condition: boolean): void {
  if (!condition) throw new Error(name);
}

async function main(): Promise<void> {
  const store: Store = new Map();
  const writes = { count: 0 };
  const review = { status: 'approved' };
  const events: string[] = [];
  const rpc = contractRpc(store, writes, review, events);

  const first = await applyReviewCommerceTransition(eligible, 'fulfilled', rpc);
  const second = await applyReviewCommerceTransition(eligible, 'fulfilled', rpc);
  assert('fulfilled applies', first.ok === true && first.itemCount === 2);
  assert('second call stays one row per item', second.ok === true && store.size === 2 && writes.count === 2);
  assert('no review entitlement inserted', review.status === 'approved' && events.length === 0);

  let calls = 0;
  const unpaid = await applyReviewCommerceTransition(
    { ...eligible, paymentFinalizedAt: null },
    'fulfilled',
    async () => { calls += 1; },
  );
  const incomplete = await applyReviewCommerceTransition(
    { ...eligible, status: 'PAID' },
    'fulfilled',
    async () => { calls += 1; },
  );
  const missingClock = await applyReviewCommerceTransition(
    { ...eligible, completedAt: null },
    'fulfilled',
    async () => { calls += 1; },
  );
  assert('unpaid rejected', unpaid.ok === false && unpaid.reason === 'unpaid_or_incomplete');
  assert('incomplete rejected', incomplete.ok === false && missingClock.ok === false && calls === 0);

  const cancelled = await applyReviewCommerceTransition(
    { ...eligible, status: 'PAID', completedAt: null },
    'cancelled',
    rpc,
  );
  assert('cancel hides review once', cancelled.ok === true && review.status === 'hidden' && events.length === 1);
  await applyReviewCommerceTransition(eligible, 'cancelled', rpc);
  assert('repeat cancel does not add another event', events.length === 1 && store.get(itemA) === 'cancelled');

  let resurrected = false;
  try {
    await applyReviewCommerceTransition(eligible, 'fulfilled', rpc);
  } catch (error) {
    resurrected = error instanceof Error && error.message === 'commerce_state_resurrection_forbidden';
  }
  assert('cancelled line cannot become fulfilled', resurrected && store.get(itemA) === 'cancelled');

  const refundStore: Store = new Map([[itemA, 'fulfilled']]);
  const refundReview = { status: 'approved' };
  const refundEvents: string[] = [];
  const refunded = await applyReviewCommerceTransition(
    { ...eligible, itemIds: [itemA] },
    'refunded',
    contractRpc(refundStore, { count: 0 }, refundReview, refundEvents),
  );
  assert('refund hides review', refunded.ok === true && refundReview.status === 'hidden' && refundEvents[0] === 'commerce_refunded');

  const rpcArgs: Array<{ fn: string; item: string; state: string }> = [];
  const admin = {
    from(table: string) {
      const builder = {
        select() { return builder; },
        eq() { return builder; },
        maybeSingle: async () => ({
          data: table === 'orders'
            ? { status: 'COMPLETED', completed_at: eligible.completedAt, payment_finalized_at: eligible.paymentFinalizedAt }
            : null,
          error: null,
        }),
        then(resolve: (value: { data: unknown; error: null }) => unknown) {
          return Promise.resolve({
            data: table === 'order_items' ? [{ id: itemA }, { id: itemB }] : null,
            error: null,
          }).then(resolve);
        },
      };
      return builder;
    },
    rpc: async (fn: string, args: { p_order_item_id: string; p_state: string }) => {
      rpcArgs.push({ fn, item: args.p_order_item_id, state: args.p_state });
      return { error: null };
    },
  };
  const synced = await syncCompletedOrderReviewEligibility(admin as never, orderId);
  assert('sync uses the actual rpc signature', synced.ok === true && rpcArgs.length === 2 && rpcArgs.every((call) => call.fn === REVIEW_COMMERCE_RPC && call.state === 'fulfilled'));

  const unpaidAdmin = {
    from(table: string) {
      const self = {
        select() { return self; },
        eq() { return self; },
        maybeSingle: async () => ({
          data: table === 'orders'
            ? { status: 'PAID', completed_at: null, payment_finalized_at: eligible.paymentFinalizedAt }
            : null,
          error: null,
        }),
        then(resolve: (value: { data: unknown; error: null }) => unknown) {
          return Promise.resolve({
            data: table === 'order_items' ? [{ id: itemA }] : null,
            error: null,
          }).then(resolve);
        },
      };
      return self;
    },
    rpc: async () => {
      throw new Error('rpc must not run');
    },
  };
  const blocked = await syncCompletedOrderReviewEligibility(unpaidAdmin as never, orderId);
  assert('sync refuses an unpaid order before the rpc', blocked.ok === false && blocked.reason === 'unpaid_or_incomplete');

  const failedFeedback = completionSyncFeedback(false);
  const okFeedback = completionSyncFeedback(true);
  assert('sync failure is not complete success', failedFeedback.showCompletionSuccess === false && failedFeedback.offerRetry === true && failedFeedback.message !== null);
  assert('sync success does not offer retry', okFeedback.showCompletionSuccess === true && okFeedback.offerRetry === false);
  const page = readFileSync('src/pages/AdminOrders.tsx', 'utf8');
  const retryStart = page.indexOf('const retryReviewEligibility');
  const retryEnd = page.indexOf('const persistTracking');
  const retryBody = page.slice(retryStart, retryEnd);
  assert('retry does not repeat order completion', !retryBody.includes(".from('orders')") && !retryBody.includes('update('));

  const commerceCalls: string[] = [];
  const fakeClients = (admin: boolean) => {
    const client = {
      auth: {
        getUser: async () => ({ data: { user: { id: '00000000-0000-4000-8000-0000000000d4' } }, error: null }),
      },
      from(table: string) {
        commerceCalls.push(table);
        const self = {
          select() { return self; },
          eq() { return self; },
          maybeSingle: async () => ({
            data: table === 'profiles' ? { id: '00000000-0000-4000-8000-0000000000d4', is_admin: admin, withdrawn_at: null } : null,
            error: null,
          }),
        };
        return self;
      },
      rpc: async () => {
        commerceCalls.push('rpc');
        return { error: null };
      },
    };
    return client;
  };

  const post = async (authorization: string | undefined, admin: boolean) => {
    commerceCalls.length = 0;
    const app = express();
    const clients = fakeClients(admin);
    registerReviewEligibilityRoute(app, { supabaseAdmin: clients as never, supabasePublic: clients as never });
    const server = await new Promise<import('node:http').Server>((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    const address = server.address();
    const port = address && typeof address === 'object' ? address.port : 0;
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/orders/${orderId}/review-eligibility`, {
      method: 'POST',
      headers: authorization ? { Authorization: authorization } : {},
    });
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    return { status: response.status, calls: [...commerceCalls] };
  };

  const missing = await post(undefined, false);
  const stranger = await post('Bearer not-an-admin', false);
  assert('missing caller is rejected before commerce access', missing.status === 401 && missing.calls.length === 0);
  assert('non-admin is rejected before order access', stranger.status === 403 && !stranger.calls.includes('orders') && !stranger.calls.includes('rpc'));

  console.log(JSON.stringify({ ok: true, fulfilled: store.size, cancelled: events[0], refunded: refundEvents[0], unauthorized: missing.status }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'failed');
  process.exit(1);
});
