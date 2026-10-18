import type { Express } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isUuid, verifyAdminCaller } from './accountWithdrawal';

/** Actual NEW27 signature: set_order_item_commerce_state(p_order_item_id uuid, p_state text). */
export const REVIEW_COMMERCE_RPC = 'set_order_item_commerce_state';

export const REVIEW_ELIGIBILITY_SYNC_PATH = '/api/admin/orders/:orderId/review-eligibility';

export type ReviewCommerceState = 'fulfilled' | 'cancelled' | 'refunded';

export type ReviewCommerceSnapshot = {
  status: string | null;
  completedAt: string | null;
  paymentFinalizedAt: string | null;
  itemIds: string[];
};

export type ReviewCommerceBlock = 'unpaid_or_incomplete' | 'no_items';

function present(value: string | null): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Fulfilled eligibility is the completed-order contract. Cancel and refund do not use this gate. */
export function reviewFulfillmentBlock(snapshot: ReviewCommerceSnapshot): ReviewCommerceBlock | null {
  const completed =
    snapshot.status === 'COMPLETED'
    && present(snapshot.completedAt)
    && present(snapshot.paymentFinalizedAt);
  if (!completed) return 'unpaid_or_incomplete';
  if (snapshot.itemIds.length === 0) return 'no_items';
  return null;
}

export async function applyReviewCommerceTransition(
  snapshot: ReviewCommerceSnapshot,
  state: ReviewCommerceState,
  rpc: (orderItemId: string, state: ReviewCommerceState) => Promise<void>,
): Promise<{ ok: true; itemCount: number } | { ok: false; reason: ReviewCommerceBlock }> {
  if (state === 'fulfilled') {
    const block = reviewFulfillmentBlock(snapshot);
    if (block) return { ok: false, reason: block };
  } else if (snapshot.itemIds.length === 0) {
    return { ok: false, reason: 'no_items' };
  }
  for (const orderItemId of snapshot.itemIds) {
    await rpc(orderItemId, state);
  }
  return { ok: true, itemCount: snapshot.itemIds.length };
}

type OrderRow = {
  status: string | null;
  completed_at: string | null;
  payment_finalized_at: string | null;
};

function readOrder(data: unknown): OrderRow | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  return {
    status: typeof row.status === 'string' ? row.status : null,
    completed_at: typeof row.completed_at === 'string' ? row.completed_at : null,
    payment_finalized_at: typeof row.payment_finalized_at === 'string' ? row.payment_finalized_at : null,
  };
}

function readItemIds(data: unknown): string[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((row) => (row && typeof row === 'object' ? (row as { id?: unknown }).id : null))
    .filter((id): id is string => typeof id === 'string' && isUuid(id));
}

export async function syncCompletedOrderReviewEligibility(
  admin: SupabaseClient,
  orderId: string,
): Promise<{ ok: true; itemCount: number } | { ok: false; reason: ReviewCommerceBlock | 'not_found' }> {
  const orderResult = await admin
    .from('orders')
    .select('status, completed_at, payment_finalized_at')
    .eq('id', orderId)
    .maybeSingle();
  if (orderResult.error) throw new Error('commerce_state_read_failed');
  const order = readOrder(orderResult.data);
  if (!order) return { ok: false, reason: 'not_found' };

  const itemResult = await admin
    .from('order_items')
    .select('id')
    .eq('order_id', orderId);
  if (itemResult.error) throw new Error('commerce_state_read_failed');

  return applyReviewCommerceTransition(
    {
      status: order.status,
      completedAt: order.completed_at,
      paymentFinalizedAt: order.payment_finalized_at,
      itemIds: readItemIds(itemResult.data),
    },
    'fulfilled',
    async (orderItemId, state) => {
      const { error } = await admin.rpc(REVIEW_COMMERCE_RPC, {
        p_order_item_id: orderItemId,
        p_state: state,
      });
      if (error) throw new Error(error.message || 'commerce_state_rpc_failed');
    },
  );
}

export function registerReviewEligibilityRoute(
  app: Express,
  deps: { supabaseAdmin: SupabaseClient | null; supabasePublic: SupabaseClient | null },
): void {
  app.post(REVIEW_ELIGIBILITY_SYNC_PATH, async (req, res) => {
    if (!deps.supabaseAdmin || !deps.supabasePublic) {
      return res.status(503).json({ ok: false, error: 'unavailable' });
    }
    const actor = await verifyAdminCaller(
      deps.supabaseAdmin,
      deps.supabasePublic,
      req.headers.authorization,
    );
    if (actor.ok === false) {
      return res.status(actor.status).json({ ok: false, error: actor.reason_class });
    }
    const orderId = typeof req.params.orderId === 'string' ? req.params.orderId : '';
    if (!isUuid(orderId)) {
      return res.status(400).json({ ok: false, error: 'invalid_order' });
    }
    try {
      const result = await syncCompletedOrderReviewEligibility(deps.supabaseAdmin, orderId);
      if (result.ok === false) {
        const reason = result.reason;
        return res.status(reason === 'not_found' ? 404 : 409).json({ ok: false, error: reason });
      }
      return res.status(200).json({ ok: true, itemCount: result.itemCount });
    } catch {
      console.error('[REVIEW_ELIGIBILITY]', { reason_class: 'rpc_failed' });
      return res.status(500).json({ ok: false, error: 'unavailable' });
    }
  });
}
