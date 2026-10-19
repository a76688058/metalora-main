import type { Express, Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isUuid, verifyAdminCaller } from './accountWithdrawal';
import { lookupTossPayment, postTossFullCancel } from './tossPaymentCancel';

export const FULL_ORDER_CANCEL_PATH = '/api/admin/orders/:orderId/cancel';

export type CancellationStatus =
  | 'pending'
  | 'provider_uncertain'
  | 'provider_rejected'
  | 'confirmed'
  | 'local_uncertain';

export type CancellationRecord = {
  id: string;
  orderNumber: string;
  paymentKey: string;
  idempotencyKey: string;
  paidAmount: number;
  status: CancellationStatus;
  providerAttemptedAt: string | null;
  transactionKey: string | null;
};

export type CancellationBeginError =
  | 'not_found'
  | 'not_eligible'
  | 'fulfilled'
  | 'payment_key_missing'
  | 'payment_key_mismatch'
  | 'method_unsupported'
  | 'invalid_reason'
  | 'unavailable';

export type CancellationPort = {
  begin(input: {
    orderId: string;
    actorUserId: string;
    cancelReason: string;
  }): Promise<{ ok: true; row: CancellationRecord } | { ok: false; error: CancellationBeginError }>;
  claim(id: string): Promise<boolean>;
  mark(id: string, status: 'provider_uncertain' | 'provider_rejected' | 'local_uncertain', code: string | null): Promise<void>;
  finalize(id: string, transactionKey: string, cancelAmount: number): Promise<'ok' | 'failed'>;
};

export type CancellationProvider = {
  cancel(input: {
    paymentKey: string;
    cancelReason: string;
    idempotencyKey: string;
  }): Promise<
    | { ok: true; payment: unknown }
    | { ok: false; kind: 'rejected'; code: string | null }
    | { ok: false; kind: 'timeout' | 'network' | 'invalid_body' }
  >;
  lookup(orderNumber: string): Promise<
    | { ok: true; payment: unknown }
    | { ok: false; kind: 'not_found' | 'rejected' | 'timeout' | 'network' | 'invalid_body' }
  >;
};

export type CancellationOutcome =
  | { ok: true; alreadyComplete: boolean }
  | {
      ok: false;
      error:
        | CancellationBeginError
        | 'in_progress'
        | 'provider_rejected'
        | 'reconciliation_required';
    };

const BEGIN_ERRORS: Record<string, CancellationBeginError> = {
  cancellation_not_found: 'not_found',
  cancellation_not_eligible: 'not_eligible',
  cancellation_fulfilled: 'fulfilled',
  cancellation_payment_key_missing: 'payment_key_missing',
  cancellation_payment_key_mismatch: 'payment_key_mismatch',
  cancellation_method_unsupported: 'method_unsupported',
  cancellation_reason_invalid: 'invalid_reason',
  cancellation_server_only: 'unavailable',
};

function amount(value: unknown): number | null {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : Number.NaN;
  if (!Number.isSafeInteger(numeric) || numeric < 0) return null;
  return numeric;
}

function won(value: unknown): number | null {
  const numeric = amount(value);
  if (numeric === null || numeric <= 0) return null;
  return numeric;
}

export function readFullCancelProof(
  payment: unknown,
  expected: { orderNumber: string; paymentKey: string; paidAmount: number },
): { ok: true; transactionKey: string } | { ok: false; reason: 'not_full' | 'mismatch' } {
  if (!payment || typeof payment !== 'object') return { ok: false, reason: 'mismatch' };
  const body = payment as Record<string, unknown>;
  if (body.status !== 'CANCELED') return { ok: false, reason: 'not_full' };
  if (body.orderId !== expected.orderNumber || body.paymentKey !== expected.paymentKey) {
    return { ok: false, reason: 'mismatch' };
  }
  if (won(body.totalAmount) !== expected.paidAmount || amount(body.balanceAmount) !== 0) {
    return { ok: false, reason: 'not_full' };
  }
  if (!Array.isArray(body.cancels) || body.cancels.length !== 1) return { ok: false, reason: 'not_full' };
  const cancel = body.cancels[0];
  if (!cancel || typeof cancel !== 'object') return { ok: false, reason: 'mismatch' };
  const row = cancel as Record<string, unknown>;
  const transactionKey = typeof row.transactionKey === 'string' ? row.transactionKey.trim() : '';
  if (
    row.cancelStatus !== 'DONE'
    || transactionKey.length < 1
    || transactionKey.length > 64
    || won(row.cancelAmount) !== expected.paidAmount
  ) {
    return { ok: false, reason: 'not_full' };
  }
  if ('refundableAmount' in row && amount(row.refundableAmount) !== 0) {
    return { ok: false, reason: 'not_full' };
  }
  return { ok: true, transactionKey };
}

function stillPaid(payment: unknown, expected: { orderNumber: string; paymentKey: string; paidAmount: number }): boolean {
  if (!payment || typeof payment !== 'object') return false;
  const body = payment as Record<string, unknown>;
  return body.status === 'DONE'
    && body.orderId === expected.orderNumber
    && body.paymentKey === expected.paymentKey
    && won(body.totalAmount) === expected.paidAmount
    && amount(body.balanceAmount) === expected.paidAmount;
}

function mapBeginError(message: string): CancellationBeginError {
  for (const [code, error] of Object.entries(BEGIN_ERRORS)) {
    if (message.includes(code)) return error;
  }
  return 'unavailable';
}

function readRow(data: unknown): CancellationRecord | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  const paidAmount = won(record.paid_amount);
  if (
    typeof record.cancellation_id !== 'string'
    || typeof record.cancellation_status !== 'string'
    || typeof record.idempotency_key !== 'string'
    || typeof record.payment_key !== 'string'
    || typeof record.order_number !== 'string'
    || paidAmount === null
  ) {
    return null;
  }
  return {
    id: record.cancellation_id,
    status: record.cancellation_status as CancellationStatus,
    idempotencyKey: record.idempotency_key,
    paymentKey: record.payment_key,
    orderNumber: record.order_number,
    paidAmount,
    providerAttemptedAt: typeof record.provider_attempted_at === 'string' ? record.provider_attempted_at : null,
    transactionKey: typeof record.transaction_key === 'string' ? record.transaction_key : null,
  };
}

export function createSupabaseCancellationPort(admin: SupabaseClient): CancellationPort {
  return {
    async begin(input) {
      const { data, error } = await admin.rpc('begin_full_order_cancellation', {
        p_order_id: input.orderId,
        p_actor_user_id: input.actorUserId,
        p_cancel_reason: input.cancelReason,
      });
      if (error) return { ok: false, error: mapBeginError(error.message ?? '') };
      const row = readRow(data);
      if (!row) return { ok: false, error: 'unavailable' };
      return { ok: true, row };
    },
    async claim(id) {
      const { data, error } = await admin.rpc('claim_full_order_cancellation', {
        p_cancellation_id: id,
      });
      if (error) return false;
      return data === true;
    },
    async mark(id, status, code) {
      const { error } = await admin.rpc('mark_full_order_cancellation', {
        p_cancellation_id: id,
        p_status: status,
        p_provider_code: code,
      });
      if (error) throw new Error('cancellation_mark_failed');
    },
    async finalize(id, transactionKey, cancelAmount) {
      const { error } = await admin.rpc('finalize_full_order_cancellation', {
        p_cancellation_id: id,
        p_transaction_key: transactionKey,
        p_cancel_amount: cancelAmount,
      });
      return error ? 'failed' : 'ok';
    },
  };
}

async function finalizeConfirmed(
  port: CancellationPort,
  row: CancellationRecord,
  transactionKey: string,
): Promise<CancellationOutcome> {
  try {
    const wrote = await port.finalize(row.id, transactionKey, row.paidAmount);
    if (wrote === 'failed') {
      await port.mark(row.id, 'local_uncertain', null);
      return { ok: false, error: 'reconciliation_required' };
    }
    return { ok: true, alreadyComplete: false };
  } catch {
    return { ok: false, error: 'reconciliation_required' };
  }
}

export async function executeFullOrderCancellation(
  port: CancellationPort,
  provider: CancellationProvider,
  input: { orderId: string; actorUserId: string; cancelReason: string },
): Promise<CancellationOutcome> {
  const reason = input.cancelReason.trim();
  if (reason.length < 1 || reason.length > 200) return { ok: false, error: 'invalid_reason' };

  const started = await port.begin({ ...input, cancelReason: reason });
  if (started.ok === false) return started;
  const row = started.row;
  if (row.status === 'confirmed') return { ok: true, alreadyComplete: true };

  const expected = {
    orderNumber: row.orderNumber,
    paymentKey: row.paymentKey,
    paidAmount: row.paidAmount,
  };

  const reconcileFromLookup = async (): Promise<CancellationOutcome | null> => {
    const looked = await provider.lookup(row.orderNumber);
    if (looked.ok === false) {
      await port.mark(row.id, 'provider_uncertain', null);
      return { ok: false, error: 'reconciliation_required' };
    }
    const proof = readFullCancelProof(looked.payment, expected);
    if (proof.ok) return finalizeConfirmed(port, row, proof.transactionKey);
    if (stillPaid(looked.payment, expected)) return null;
    await port.mark(row.id, 'local_uncertain', null);
    return { ok: false, error: 'reconciliation_required' };
  };

  if (row.providerAttemptedAt || row.status === 'provider_uncertain' || row.status === 'local_uncertain') {
    const reconciled = await reconcileFromLookup();
    if (reconciled) return reconciled;
  } else {
    const claimed = await port.claim(row.id);
    if (!claimed) return { ok: false, error: 'in_progress' };
  }

  const cancelled = await provider.cancel({
    paymentKey: row.paymentKey,
    cancelReason: reason,
    idempotencyKey: row.idempotencyKey,
  });

  if (cancelled.ok === false) {
    if (cancelled.kind === 'rejected') {
      const looked = await provider.lookup(row.orderNumber);
      if (looked.ok) {
        const proof = readFullCancelProof(looked.payment, expected);
        if (proof.ok) return finalizeConfirmed(port, row, proof.transactionKey);
        if (stillPaid(looked.payment, expected)) {
          await port.mark(row.id, 'provider_rejected', cancelled.code);
          return { ok: false, error: 'provider_rejected' };
        }
      }
      await port.mark(row.id, 'provider_uncertain', cancelled.code);
      return { ok: false, error: 'reconciliation_required' };
    }
    await port.mark(row.id, 'provider_uncertain', null);
    const reconciled = await reconcileFromLookup();
    return reconciled ?? { ok: false, error: 'reconciliation_required' };
  }

  const posted = readFullCancelProof(cancelled.payment, expected);
  if (!posted.ok) {
    await port.mark(row.id, 'local_uncertain', null);
    return { ok: false, error: 'reconciliation_required' };
  }

  const looked = await provider.lookup(row.orderNumber);
  if (looked.ok === false) {
    await port.mark(row.id, 'provider_uncertain', null);
    return { ok: false, error: 'reconciliation_required' };
  }
  const confirmed = readFullCancelProof(looked.payment, expected);
  if (!confirmed.ok || confirmed.transactionKey !== posted.transactionKey) {
    await port.mark(row.id, 'local_uncertain', null);
    return { ok: false, error: 'reconciliation_required' };
  }
  return finalizeConfirmed(port, row, confirmed.transactionKey);
}

function httpStatus(error: Exclude<CancellationOutcome, { ok: true }>['error']): number {
  if (error === 'not_found') return 404;
  if (error === 'invalid_reason') return 400;
  if (error === 'reconciliation_required' || error === 'unavailable') return 503;
  return 409;
}

export function registerFullOrderCancellationRoute(
  app: Express,
  deps: {
    supabaseAdmin: SupabaseClient | null;
    supabasePublic: SupabaseClient | null;
    provider?: CancellationProvider;
    port?: CancellationPort;
    secretKey?: string;
  },
): void {
  app.post(FULL_ORDER_CANCEL_PATH, async (req: Request, res: Response) => {
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
    if (!isUuid(orderId)) return res.status(400).json({ ok: false, error: 'invalid_order' });
    const cancelReason = (req.body ?? {}) as { cancelReason?: unknown };
    if (typeof cancelReason.cancelReason !== 'string') {
      return res.status(400).json({ ok: false, error: 'invalid_reason' });
    }

    const secret = deps.secretKey ?? process.env.TOSS_SECRET_KEY ?? '';
    const provider = deps.provider ?? (secret.trim()
      ? {
          cancel: (input: { paymentKey: string; cancelReason: string; idempotencyKey: string }) =>
            postTossFullCancel(fetch, secret.trim(), input),
          lookup: (orderNumber: string) => lookupTossPayment(fetch, secret.trim(), orderNumber),
        }
      : null);
    if (!provider) return res.status(503).json({ ok: false, error: 'unavailable' });

    try {
      const outcome = await executeFullOrderCancellation(
        deps.port ?? createSupabaseCancellationPort(deps.supabaseAdmin),
        provider,
        { orderId, actorUserId: actor.actorUserId, cancelReason: cancelReason.cancelReason },
      );
      if (outcome.ok === false) {
        return res.status(httpStatus(outcome.error)).json({ ok: false, error: outcome.error });
      }
      return res.status(200).json({ ok: true, alreadyComplete: outcome.alreadyComplete });
    } catch {
      return res.status(503).json({ ok: false, error: 'reconciliation_required' });
    }
  });
}
