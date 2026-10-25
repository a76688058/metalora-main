/**
 * Unfinalized capture cancellation. The finalized PAID cancellation module stays separate.
 * The pre-send recheck releases its lock before any Toss HTTP call.
 */
import type { Express, Request, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyAdminCaller } from "./accountWithdrawal";
import { readFullCancelProof } from "./paymentCancellation";
import { lookupTossPayment, postTossFullCancel } from "./tossPaymentCancel";
import {
  CARD_METHOD,
  LIVE_MID,
  type CaptureRecord,
  type MemoryCaptureDb,
  conflictRefundPredicate,
  withCaptureLock,
  CaptureDbError,
  CapturePolicyError,
  preSendCancelAllowed,
  readCapturePolicy,
  guardWrite,
} from "./paymentCaptureRecovery";

export type CancelTransport = {
  posts: string[];
  cancel: (input: { paymentKey: string; idempotencyKey: string }) => Promise<
    | { ok: true; payment: unknown }
    | { ok: false; kind: "timeout" | "rejected" }
  >;
  lookup: (orderId: string) => Promise<{ ok: true; payment: unknown } | { ok: false; kind: "timeout" | "not_found" }>;
};

function rowOf(db: MemoryCaptureDb, orderNumber: string): CaptureRecord {
  const row = db.records.get(orderNumber);
  if (!row) throw new Error("not_found");
  return row;
}

export async function beginAlignedMismatchCancel(
  db: MemoryCaptureDb,
  input: { orderNumber: string; actorUserId: string; evidence: string },
): Promise<{ ok: true; idempotencyKey: string } | { ok: false; reason: string }> {
  return withCaptureLock(input.orderNumber, () => {
    const row = rowOf(db, input.orderNumber);
    if (row.orderFinalized || db.finalizedOrders.has(input.orderNumber)) return { ok: false, reason: "finalized" };
    if (row.cancelIdempotencyKey) return { ok: true, idempotencyKey: row.cancelIdempotencyKey };
    const policy = readCapturePolicy(db);
    row.requireLiveMid = policy.requireLiveMid;
    const midOk = policy.requireLiveMid ? row.providerMid === policy.liveMid : !!row.providerMid;
    if (
      row.status !== "provider_mismatch"
      || row.failureClass !== "method_mismatch"
      || row.claimedPaymentKey !== row.observedPaymentKey
      || !row.observedPaymentKey
      || row.providerStatus !== "DONE"
      || !row.paymentMethod
      || row.paymentMethod === CARD_METHOD
      || !midOk
    ) {
      return { ok: false, reason: "not_eligible" };
    }
    row.cancelPath = "aligned_method_mismatch";
    row.cancelTargetPaymentKey = row.observedPaymentKey;
    row.cancelIdempotencyKey = `idem-${input.orderNumber}`;
    row.cancelActorUserId = input.actorUserId;
    row.status = "cancel_pending";
    row.events.push(`aligned-cancel:${input.evidence}`);
    return { ok: true, idempotencyKey: row.cancelIdempotencyKey };
  });
}

export async function beginManualObservedKeyRefund(
  db: MemoryCaptureDb,
  input: { orderNumber: string; actorUserId: string; evidence: string },
): Promise<{ ok: true; idempotencyKey: string; target: string } | { ok: false; reason: string }> {
  return withCaptureLock(input.orderNumber, () => {
    const row = rowOf(db, input.orderNumber);
    if (row.status !== "identity_conflict") return { ok: false, reason: "not_conflict" };
    const verdict = conflictRefundPredicate(row);
    if (!verdict.ok) return { ok: false, reason: "inconsistent" };
    row.cancelPath = "identity_conflict_observed";
    row.cancelTargetPaymentKey = verdict.observedKey;
    row.cancelIdempotencyKey = `idem-${input.orderNumber}`;
    row.cancelActorUserId = input.actorUserId;
    row.status = "cancel_pending";
    row.events.push(`manual-refund:${input.evidence}`);
    return { ok: true, idempotencyKey: row.cancelIdempotencyKey, target: verdict.observedKey };
  });
}

export async function claimCancelDispatch(
  db: MemoryCaptureDb,
  orderNumber: string,
  winnerToken: number,
): Promise<{ won: boolean; token: number | null }> {
  return withCaptureLock(orderNumber, () => {
    const row = rowOf(db, orderNumber);
    if (row.status !== "cancel_pending" || !row.cancelIdempotencyKey || !row.cancelTargetPaymentKey) {
      return { won: false, token: null };
    }
    if (row.cancelProviderAttemptedAt != null) return { won: false, token: null };
    row.cancelProviderAttemptedAt = db.now;
    row.cancelDispatchToken = winnerToken;
    return { won: true, token: winnerToken };
  });
}

export async function recheckBeforeSend(
  db: MemoryCaptureDb,
  orderNumber: string,
  winnerToken: number,
): Promise<"clear" | "blocked" | "db_error"> {
  try {
    return await withCaptureLock(orderNumber, () => {
      if (db.failNextWrite) {
        db.failNextWrite = false;
        throw new CaptureDbError();
      }
      const row = rowOf(db, orderNumber);
      if (row.cancelDispatchToken !== winnerToken) return "blocked";
      try {
        row.requireLiveMid = readCapturePolicy(db).requireLiveMid;
      } catch (error) {
        if (error instanceof CapturePolicyError) {
          row.dispatchBlocked = true;
          row.events.push("dispatch-blocked");
          return "blocked";
        }
        throw error;
      }
      if (!preSendCancelAllowed(row)) {
        row.dispatchBlocked = true;
        row.events.push("dispatch-blocked");
        return "blocked";
      }
      return "clear";
    });
  } catch (error) {
    if (error instanceof CaptureDbError) return "db_error";
    throw error;
  }
}

export async function runCaptureCancel(
  db: MemoryCaptureDb,
  transport: CancelTransport,
  input: { orderNumber: string; actorUserId: string; evidence: string; mode: "aligned" | "conflict"; winnerToken: number },
): Promise<{ posts: number; status: string; blocked: boolean }> {
  const before = transport.posts.length;
  const started = input.mode === "aligned"
    ? await beginAlignedMismatchCancel(db, input)
    : await beginManualObservedKeyRefund(db, input);
  if (!started.ok) return { posts: 0, status: db.records.get(input.orderNumber)?.status ?? "refused", blocked: false };
  const row = db.records.get(input.orderNumber)!;
  if (row.cancelProviderAttemptedAt != null && row.ledgerTransactionKey) {
    return { posts: 0, status: row.status, blocked: false };
  }
  const claim = await claimCancelDispatch(db, input.orderNumber, input.winnerToken);
  if (!claim.won || claim.token == null) {
    return { posts: transport.posts.length - before, status: row.status, blocked: row.dispatchBlocked };
  }
  const recheck = await recheckBeforeSend(db, input.orderNumber, claim.token);
  if (recheck !== "clear") {
    return { posts: 0, status: "cancel_pending", blocked: recheck === "blocked" };
  }
  const target = db.records.get(input.orderNumber)!.cancelTargetPaymentKey!;
  const idem = db.records.get(input.orderNumber)!.cancelIdempotencyKey!;
  transport.posts.push(target);
  let sent: Awaited<ReturnType<CancelTransport["cancel"]>>;
  try {
    sent = await transport.cancel({ paymentKey: target, idempotencyKey: idem });
  } catch {
    sent = { ok: false, kind: "timeout" };
  }
  if (!sent.ok) {
    await withCaptureLock(input.orderNumber, () => {
      const current = rowOf(db, input.orderNumber);
      current.status = "local_cancel_uncertain";
      current.events.push("cancel-uncertain");
    });
    return { posts: 1, status: "local_cancel_uncertain", blocked: false };
  }
  const proof = readFullCancelProof(sent.payment, {
    orderNumber: input.orderNumber,
    paymentKey: target,
    paidAmount: row.amount,
  });
  if (!proof.ok) {
    await withCaptureLock(input.orderNumber, () => {
      rowOf(db, input.orderNumber).status = "local_cancel_uncertain";
    });
    return { posts: 1, status: "local_cancel_uncertain", blocked: false };
  }
  const looked = await transport.lookup(input.orderNumber);
  if (!looked.ok) {
    await withCaptureLock(input.orderNumber, () => {
      rowOf(db, input.orderNumber).status = "local_cancel_uncertain";
    });
    return { posts: 1, status: "local_cancel_uncertain", blocked: false };
  }
  const confirmed = readFullCancelProof(looked.payment, {
    orderNumber: input.orderNumber,
    paymentKey: target,
    paidAmount: row.amount,
  });
  if (!confirmed.ok || confirmed.transactionKey !== proof.transactionKey) {
    await withCaptureLock(input.orderNumber, () => {
      rowOf(db, input.orderNumber).status = "local_cancel_uncertain";
    });
    return { posts: 1, status: "local_cancel_uncertain", blocked: false };
  }
  try {
    await withCaptureLock(input.orderNumber, () => {
      guardWrite(db);
      const current = rowOf(db, input.orderNumber);
      if (current.ledgerTransactionKey && current.ledgerTransactionKey !== confirmed.transactionKey) {
        throw new Error("duplicate_ledger");
      }
      current.ledgerTransactionKey = confirmed.transactionKey;
      current.transactionKey = confirmed.transactionKey;
      current.status = "provider_canceled";
    });
  } catch (error) {
    if (error instanceof CaptureDbError) {
      return { posts: 1, status: db.records.get(input.orderNumber)?.status ?? "cancel_pending", blocked: false };
    }
    throw error;
  }
  return { posts: 1, status: "provider_canceled", blocked: false };
}

export async function attestExternalResolution(
  db: MemoryCaptureDb,
  input: { orderNumber: string; actorUserId: string; evidenceType: string; evidenceReference: string; disposition: "external_party_reports_closed" | "ownership_rejected" },
): Promise<{ ok: boolean; reason?: string }> {
  return withCaptureLock(input.orderNumber, () => {
    const row = rowOf(db, input.orderNumber);
    if (row.status !== "provider_mismatch" || row.failureClass !== "mid_mismatch") return { ok: false, reason: "not_mid_mismatch" };
    if (!row.observedPaymentKey || !row.providerMid) return { ok: false, reason: "unverified" };
    if (input.evidenceType === "transaction_reference" || !input.evidenceReference) return { ok: false, reason: "evidence" };
    if (input.disposition !== "external_party_reports_closed" && input.disposition !== "ownership_rejected") {
      return { ok: false, reason: "disposition" };
    }
    row.status = "operator_closed";
    row.events.push(`external:${input.actorUserId}:${input.evidenceType}:${input.disposition}:${db.now}`);
    return { ok: true };
  });
}

async function sendApprovedCancel(
  admin: SupabaseClient,
  orderNumber: string,
  secret: string,
): Promise<"proven" | "blocked" | "not_winner" | "unproven"> {
  const claim = await admin.rpc("claim_capture_cancel_dispatch", { p_order_number: orderNumber });
  const claimed = claim.data as { won?: boolean; target?: string; idempotency_key?: string; amount?: number } | null;
  if (claim.error || !claimed?.won || !claimed.target || !claimed.idempotency_key) return "not_winner";
  if (!Number.isFinite(Number(claimed.amount))) {
    await admin.rpc("record_capture_dispatch_block", { p_order_number: orderNumber });
    return "blocked";
  }
  const recheck = await admin.rpc("revalidate_capture_cancel_before_send", { p_order_number: orderNumber });
  if (recheck.error || recheck.data !== "clear") {
    await admin.rpc("record_capture_dispatch_block", { p_order_number: orderNumber });
    return "blocked";
  }
  const expected = { orderNumber, paymentKey: claimed.target, paidAmount: Number(claimed.amount) };
  const posted = await postTossFullCancel(fetch, secret, {
    paymentKey: claimed.target,
    cancelReason: "미확정 결제 원복",
    idempotencyKey: claimed.idempotency_key,
  });
  const looked = await lookupTossPayment(fetch, secret, orderNumber);
  const postProof = posted.ok ? readFullCancelProof(posted.payment, expected) : null;
  const getProof = looked.ok ? readFullCancelProof(looked.payment, expected) : null;
  if (!looked.ok || !getProof?.ok || (postProof?.ok && postProof.transactionKey !== getProof.transactionKey)) {
    await admin.rpc("mark_capture_cancel_uncertain", { p_order_number: orderNumber });
    return "unproven";
  }
  const finalized = await admin.rpc("finalize_capture_cancellation", {
    p_order_number: orderNumber,
    p_provider_body: looked.payment,
  });
  if (finalized.error || finalized.data !== "provider_canceled") return "unproven";
  return "proven";
}

export function registerCaptureRecoveryAdminRoutes(
  app: Express,
  deps: { supabaseAdmin: SupabaseClient | null; supabasePublic: SupabaseClient | null },
): void {
  app.get("/api/admin/capture-work-queue", async (req: Request, res: Response) => {
    if (!deps.supabaseAdmin || !deps.supabasePublic) return res.status(503).json({ ok: false });
    const actor = await verifyAdminCaller(deps.supabaseAdmin, deps.supabasePublic, req.headers.authorization);
    if (actor.ok === false) return res.status(actor.status).json({ ok: false });
    const listed = await deps.supabaseAdmin.rpc("list_capture_work_queue");
    if (listed.error) return res.status(503).json({ ok: false });
    return res.status(200).json({ ok: true, items: listed.data ?? [] });
  });

  const begin = async (
    req: Request,
    res: Response,
    rpcName: "begin_unfinalized_capture_cancellation" | "begin_manual_observed_key_refund" | "attest_external_resolution",
  ) => {
    if (!deps.supabaseAdmin || !deps.supabasePublic) return res.status(503).json({ ok: false });
    const actor = await verifyAdminCaller(deps.supabaseAdmin, deps.supabasePublic, req.headers.authorization);
    if (actor.ok === false) return res.status(actor.status).json({ ok: false });
    const orderNumber = typeof req.params.orderNumber === "string" ? req.params.orderNumber : "";
    const body = (req.body ?? {}) as { evidence?: unknown; evidenceReference?: unknown; disposition?: unknown };
    const started = await deps.supabaseAdmin.rpc(rpcName, {
      p_order_number: orderNumber,
      p_actor_user_id: actor.actorUserId,
      p_evidence: typeof body.evidence === "string" ? body.evidence : null,
      p_evidence_reference: typeof body.evidenceReference === "string" ? body.evidenceReference : null,
      p_disposition: typeof body.disposition === "string" ? body.disposition : null,
    });
    if (started.error) return res.status(409).json({ ok: false });
    if (rpcName === "attest_external_resolution") return res.status(200).json({ ok: true });
    const secret = process.env.TOSS_SECRET_KEY ?? "";
    const outcome = await sendApprovedCancel(deps.supabaseAdmin, orderNumber, secret);
    if (outcome !== "proven") return res.status(409).json({ ok: false, outcome });
    return res.status(200).json({ ok: true, outcome });
  };

  app.post("/api/admin/captures/:orderNumber/close-uncaptured", async (req, res) => {
    if (!deps.supabaseAdmin || !deps.supabasePublic) return res.status(503).json({ ok: false });
    const actor = await verifyAdminCaller(deps.supabaseAdmin, deps.supabasePublic, req.headers.authorization);
    if (actor.ok === false) return res.status(actor.status).json({ ok: false });
    const orderNumber = typeof req.params.orderNumber === "string" ? req.params.orderNumber : "";
    const evidenceKind = (req.body ?? {}) as { evidenceKind?: unknown };
    const closed = await deps.supabaseAdmin.rpc("resolve_capture_review", {
      p_order_number: orderNumber,
      p_action: "close_uncaptured",
      p_actor_user_id: actor.actorUserId,
      p_evidence_kind: evidenceKind.evidenceKind === "merchant_console_no_payment" ? evidenceKind.evidenceKind : "",
    });
    if (closed.error) return res.status(409).json({ ok: false });
    return res.status(200).json({ ok: true });
  });
  app.post("/api/admin/captures/:orderNumber/cancel", (req, res) => begin(req, res, "begin_unfinalized_capture_cancellation"));
  app.post("/api/admin/captures/:orderNumber/manual-refund", (req, res) => begin(req, res, "begin_manual_observed_key_refund"));
  app.post("/api/admin/captures/:orderNumber/external-resolution", (req, res) => begin(req, res, "attest_external_resolution"));
}
