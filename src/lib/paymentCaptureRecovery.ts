/**
 * NEW7 capture recovery. In-memory transitions mirror the SQL RPCs for mock tests.
 * Browser paymentKey is only a claim. SQL apply is a separate approval.
 */
import { LIVE_TOSS_MID, REQUIRED_CARD_METHOD } from "./paymentEnvGuard";

export const LIVE_MID = LIVE_TOSS_MID;
export const CARD_METHOD = REQUIRED_CARD_METHOD;
export const STALE_CONFIRM_MS = 2 * 60 * 1000;
const LOOKUP_STEPS_MS = [60_000, 300_000, 900_000, 3_600_000, 21_600_000, 86_400_000];

export type CaptureStatus =
  | "key_recorded"
  | "confirm_submitted"
  | "provider_done_pending_finalize"
  | "provider_mismatch"
  | "provider_uncertain"
  | "operator_review"
  | "identity_conflict"
  | "finalized"
  | "cancel_pending"
  | "local_cancel_uncertain"
  | "provider_canceled"
  | "operator_closed";

export type CancelPath = "aligned_method_mismatch" | "identity_conflict_observed";

export type ProviderObservation = {
  source: "confirm_body" | "get_lookup";
  observedPaymentKey: string | null;
  providerOrderId: string | null;
  amount: number | null;
  providerMid: string | null;
  paymentMethod: string | null;
  providerStatus: string | null;
  transactionKey: string | null;
  lastTransactionKey: string | null;
  observedAt: number;
};

export type CaptureRecord = {
  orderNumber: string;
  userId: string;
  claimedPaymentKey: string;
  observedPaymentKey: string | null;
  amount: number;
  status: CaptureStatus;
  failureClass: string | null;
  providerStatus: string | null;
  providerMid: string | null;
  paymentMethod: string | null;
  transactionKey: string | null;
  confirmEpoch: number;
  confirmClaimedAt: number | null;
  requestDispatchedAt: number | null;
  lookupCount: number;
  notFoundCount: number;
  nextLookupAfter: number | null;
  escalationLevel: number;
  reviewEnqueuedAt: number | null;
  cancelIdempotencyKey: string | null;
  cancelPath: CancelPath | null;
  cancelTargetPaymentKey: string | null;
  cancelProviderAttemptedAt: number | null;
  cancelActorUserId: string | null;
  cancelDispatchToken: number | null;
  dispatchBlocked: boolean;
  orderFinalized: boolean;
  reopenedAfterClose: boolean;
  requireLiveMid: boolean;
  observations: ProviderObservation[];
  ledgerTransactionKey: string | null;
  events: string[];
};

export type LookupClass = "found" | "not_found" | "unavailable";

export class CaptureDbError extends Error {
  constructor(message = "capture_db_unavailable") {
    super(message);
    this.name = "CaptureDbError";
  }
}

export class CapturePolicyError extends Error {
  constructor() {
    super("policy_unavailable");
    this.name = "CapturePolicyError";
  }
}

const locks = new Map<string, Promise<void>>();

export async function withCaptureLock<T>(orderNumber: string, fn: () => Promise<T> | T): Promise<T> {
  const previous = locks.get(orderNumber) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => gate);
  locks.set(orderNumber, tail);
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}

function keyOk(value: string): boolean {
  return value.length >= 1 && value.length <= 200 && !/\s/.test(value);
}

function observationIdentity(row: ProviderObservation): string {
  return [
    row.source,
    row.observedPaymentKey ?? "",
    row.providerOrderId ?? "",
    row.amount ?? -1,
    row.providerMid ?? "",
    row.paymentMethod ?? "",
    row.providerStatus ?? "",
    row.transactionKey ?? "",
    row.lastTransactionKey ?? "",
  ].join("\u0000");
}

export function upsertObservation(record: CaptureRecord, next: ProviderObservation, now: number): void {
  const id = observationIdentity(next);
  const existing = record.observations.find((row) => observationIdentity(row) === id);
  if (existing) {
    existing.observedAt = now;
    return;
  }
  record.observations.push({ ...next, observedAt: now });
  if (next.observedPaymentKey && record.observedPaymentKey == null) {
    record.observedPaymentKey = next.observedPaymentKey;
  }
}

function distinctObservedKeys(record: CaptureRecord): string[] {
  return [...new Set(record.observations.map((row) => row.observedPaymentKey).filter((key): key is string => !!key))];
}

export function conflictRefundPredicate(
  record: CaptureRecord,
  options?: { allowExistingClaim?: boolean },
): { ok: true; observedKey: string } | { ok: false } {
  const keys = distinctObservedKeys(record);
  if (keys.length !== 1) return { ok: false };
  if (record.observations.length === 0 || record.observations.some((row) => !row.observedPaymentKey)) return { ok: false };
  const observedKey = keys[0];
  if (observedKey === record.claimedPaymentKey) return { ok: false };
  for (const row of record.observations) {
    if (row.providerOrderId !== record.orderNumber) return { ok: false };
    if (row.amount !== record.amount) return { ok: false };
    if (row.providerMid !== LIVE_MID) return { ok: false };
    if (row.providerStatus !== "DONE") return { ok: false };
    if (!row.paymentMethod) return { ok: false };
  }
  const methods = new Set(record.observations.map((row) => row.paymentMethod));
  if (methods.size !== 1) return { ok: false };
  if (record.orderFinalized) return { ok: false };
  if (!options?.allowExistingClaim && record.cancelIdempotencyKey) return { ok: false };
  return { ok: true, observedKey };
}

function alignedDone(record: CaptureRecord, body: ProviderObservation): boolean {
  return body.observedPaymentKey === record.claimedPaymentKey
    && body.providerOrderId === record.orderNumber
    && body.amount === record.amount
    && body.providerStatus === "DONE"
    && body.paymentMethod === CARD_METHOD
    && !!body.providerMid
    && (!record.requireLiveMid || body.providerMid === LIVE_MID);
}

function classifyAlignedFailure(record: CaptureRecord, body: ProviderObservation): string {
  if (!body.providerMid) return "mid_missing";
  if (record.requireLiveMid && body.providerMid !== LIVE_MID) return "mid_mismatch";
  if (!body.paymentMethod) return "method_missing";
  if (body.paymentMethod !== CARD_METHOD) return "method_mismatch";
  return "provider_open";
}

function enterReview(record: CaptureRecord, failureClass: string, now: number): void {
  record.status = "operator_review";
  record.failureClass = failureClass;
  record.reviewEnqueuedAt = record.reviewEnqueuedAt ?? now;
  record.events.push(`queue:${failureClass}`);
}

function bumpEscalation(record: CaptureRecord, now: number): void {
  if (!record.reviewEnqueuedAt) return;
  const age = now - record.reviewEnqueuedAt;
  const level = age >= 86_400_000 ? 3 : age >= 21_600_000 ? 2 : age >= 3_600_000 ? 1 : 0;
  if (level > record.escalationLevel) record.escalationLevel = level;
}

const CANCEL_FROZEN: CaptureStatus[] = ["cancel_pending", "local_cancel_uncertain", "provider_canceled", "finalized"];

export function applyFoundObservation(record: CaptureRecord, body: ProviderObservation, now: number): void {
  const wasClosed = record.status === "operator_closed";
  upsertObservation(record, body, now);
  if (CANCEL_FROZEN.includes(record.status)) return;
  const keys = distinctObservedKeys(record);
  if (body.observedPaymentKey && body.observedPaymentKey !== record.claimedPaymentKey) {
    record.status = "identity_conflict";
    record.failureClass = "payment_key_conflict";
    record.reviewEnqueuedAt = record.reviewEnqueuedAt ?? now;
    return;
  }
  if (keys.length > 1) {
    record.status = "identity_conflict";
    record.failureClass = "payment_key_conflict";
    record.reviewEnqueuedAt = record.reviewEnqueuedAt ?? now;
    return;
  }
  if (body.providerStatus === "DONE" && alignedDone(record, body)) {
    record.status = "provider_done_pending_finalize";
    record.failureClass = null;
    record.providerStatus = "DONE";
    record.providerMid = body.providerMid;
    record.paymentMethod = body.paymentMethod;
    record.transactionKey = body.transactionKey;
    if (wasClosed) record.reopenedAfterClose = true;
    return;
  }
  if (body.providerStatus === "DONE") {
    const failure = classifyAlignedFailure(record, body);
    record.status = failure === "provider_open" ? "operator_review" : "provider_mismatch";
    record.failureClass = failure;
    record.providerStatus = body.providerStatus;
    record.providerMid = body.providerMid;
    record.paymentMethod = body.paymentMethod;
    if (record.status === "operator_review") record.reviewEnqueuedAt = record.reviewEnqueuedAt ?? now;
    return;
  }
  record.status = "operator_review";
  record.failureClass = "provider_open";
  record.providerStatus = body.providerStatus;
  record.reviewEnqueuedAt = record.reviewEnqueuedAt ?? now;
}

export type MemoryCaptureDb = {
  now: number;
  failNextWrite: boolean;
  records: Map<string, CaptureRecord>;
  finalizedOrders: Set<string>;
  policy: { requireLiveMid: boolean; liveMid: string } | "missing" | "ambiguous";
};

export function createMemoryCaptureDb(): MemoryCaptureDb {
  return {
    now: 0,
    failNextWrite: false,
    records: new Map(),
    finalizedOrders: new Set(),
    policy: { requireLiveMid: true, liveMid: LIVE_MID },
  };
}

export function readCapturePolicy(db: MemoryCaptureDb): { requireLiveMid: boolean; liveMid: string } {
  if (db.policy === "missing" || db.policy === "ambiguous") throw new CapturePolicyError();
  if (db.policy.liveMid !== LIVE_MID || typeof db.policy.requireLiveMid !== "boolean") throw new CapturePolicyError();
  return db.policy;
}

export function preSendCancelAllowed(record: CaptureRecord): boolean {
  if (!record.cancelPath || !record.cancelTargetPaymentKey || record.observations.length === 0) return false;
  const expected = record.cancelTargetPaymentKey;
  const methods = new Set<string>();
  const transactionKeys = new Set<string | null>();
  const lastTransactionKeys = new Set<string | null>();
  const mids = new Set<string | null>();
  for (const row of record.observations) {
    if (row.providerOrderId !== record.orderNumber || row.amount !== record.amount) return false;
    if (row.observedPaymentKey !== expected || row.providerStatus !== "DONE" || !row.paymentMethod || !row.transactionKey) return false;
    methods.add(row.paymentMethod);
    transactionKeys.add(row.transactionKey);
    lastTransactionKeys.add(row.lastTransactionKey);
    mids.add(row.providerMid);
  }
  if (methods.size !== 1 || transactionKeys.size !== 1 || lastTransactionKeys.size !== 1 || mids.size !== 1) return false;
  const mid = [...mids][0];
  if (record.cancelPath === "identity_conflict_observed") {
    return expected !== record.claimedPaymentKey && mid === LIVE_MID;
  }
  if (record.cancelPath === "aligned_method_mismatch") {
    const method = [...methods][0];
    return record.claimedPaymentKey === record.observedPaymentKey
      && expected === record.observedPaymentKey
      && method !== CARD_METHOD
      && (record.requireLiveMid ? mid === LIVE_MID : !!mid);
  }
  return false;
}

export function guardWrite(db: MemoryCaptureDb): void {
  if (db.failNextWrite) {
    db.failNextWrite = false;
    throw new CaptureDbError();
  }
}

export async function recordAttempt(
  db: MemoryCaptureDb,
  input: { orderNumber: string; userId: string; claimedPaymentKey: string; amount: number; requireLiveMid: boolean },
): Promise<CaptureRecord> {
  return withCaptureLock(input.orderNumber, () => {
    guardWrite(db);
    const policy = readCapturePolicy(db);
    if (db.finalizedOrders.has(input.orderNumber)) throw new Error("already_finalized");
    if (!keyOk(input.claimedPaymentKey)) throw new Error("invalid_key");
    const existing = db.records.get(input.orderNumber);
    if (existing) {
      if (existing.claimedPaymentKey !== input.claimedPaymentKey) throw new Error("payment_key_conflict");
      return existing;
    }
    const taken = [...db.records.values()].some((row) => row.claimedPaymentKey === input.claimedPaymentKey);
    if (taken) throw new Error("payment_key_conflict");
    const row: CaptureRecord = {
      orderNumber: input.orderNumber,
      userId: input.userId,
      claimedPaymentKey: input.claimedPaymentKey,
      observedPaymentKey: null,
      amount: input.amount,
      status: "key_recorded",
      failureClass: null,
      providerStatus: null,
      providerMid: null,
      paymentMethod: null,
      transactionKey: null,
      confirmEpoch: 0,
      confirmClaimedAt: null,
      requestDispatchedAt: null,
      lookupCount: 0,
      notFoundCount: 0,
      nextLookupAfter: null,
      escalationLevel: 0,
      reviewEnqueuedAt: null,
      cancelIdempotencyKey: null,
      cancelPath: null,
      cancelTargetPaymentKey: null,
      cancelProviderAttemptedAt: null,
      cancelActorUserId: null,
      cancelDispatchToken: null,
      dispatchBlocked: false,
      orderFinalized: false,
      reopenedAfterClose: false,
      requireLiveMid: policy.requireLiveMid,
      observations: [],
      ledgerTransactionKey: null,
      events: [],
    };
    db.records.set(input.orderNumber, row);
    return row;
  });
}

export async function claimConfirm(db: MemoryCaptureDb, orderNumber: string, claimedKey: string): Promise<{ won: boolean; epoch: number }> {
  return withCaptureLock(orderNumber, () => {
    guardWrite(db);
    const row = db.records.get(orderNumber);
    if (!row || row.claimedPaymentKey !== claimedKey) return { won: false, epoch: row?.confirmEpoch ?? 0 };
    if (row.status !== "key_recorded") return { won: false, epoch: row.confirmEpoch };
    row.status = "confirm_submitted";
    row.confirmEpoch += 1;
    row.confirmClaimedAt = db.now;
    return { won: true, epoch: row.confirmEpoch };
  });
}

export async function markDispatched(db: MemoryCaptureDb, orderNumber: string, epoch: number): Promise<boolean> {
  return withCaptureLock(orderNumber, () => {
    guardWrite(db);
    const row = db.records.get(orderNumber);
    if (!row || row.status !== "confirm_submitted" || row.confirmEpoch !== epoch || row.requestDispatchedAt != null) return false;
    row.requestDispatchedAt = db.now;
    return true;
  });
}

export async function noteLookup(
  db: MemoryCaptureDb,
  orderNumber: string,
  lookupClass: LookupClass,
  body?: ProviderObservation,
): Promise<void> {
  return withCaptureLock(orderNumber, () => {
    guardWrite(db);
    const row = db.records.get(orderNumber);
    if (!row) return;
    row.requireLiveMid = readCapturePolicy(db).requireLiveMid;
    const wasClosed = row.status === "operator_closed";
    row.lookupCount += 1;
    if (lookupClass === "not_found") row.notFoundCount += 1;
    const step = LOOKUP_STEPS_MS[Math.min(row.lookupCount - 1, LOOKUP_STEPS_MS.length - 1)];
    row.nextLookupAfter = db.now + step;
    if (lookupClass === "found" && body) {
      applyFoundObservation(row, body, db.now);
      if (wasClosed && row.status !== "operator_closed") row.reopenedAfterClose = true;
      return;
    }
    if (lookupClass === "unavailable") {
      if (row.status === "confirm_submitted" || row.status === "provider_uncertain") row.status = "provider_uncertain";
      row.failureClass = "lookup_unavailable";
    }
    const stale = row.status === "confirm_submitted"
      && row.confirmClaimedAt != null
      && db.now - row.confirmClaimedAt >= STALE_CONFIRM_MS;
    if (stale || (lookupClass === "not_found" && (row.requestDispatchedAt != null || stale || row.status === "confirm_submitted"))) {
      if (row.confirmClaimedAt != null && db.now - row.confirmClaimedAt >= STALE_CONFIRM_MS) {
        enterReview(row, lookupClass === "not_found" ? "lookup_not_found" : row.failureClass ?? "lookup_unavailable", db.now);
      }
    }
    bumpEscalation(row, db.now);
  });
}

export function listWorkQueue(db: MemoryCaptureDb): Array<{ orderNumber: string; status: CaptureStatus; failureClass: string | null; escalationLevel: number; dispatchBlocked: boolean }> {
  return [...db.records.values()]
    .filter((row) => row.status === "operator_review" || row.status === "identity_conflict" || row.status === "local_cancel_uncertain" || (row.status === "cancel_pending" && row.dispatchBlocked))
    .sort((left, right) => right.escalationLevel - left.escalationLevel)
    .map((row) => ({
      orderNumber: row.orderNumber,
      status: row.status,
      failureClass: row.failureClass,
      escalationLevel: row.escalationLevel,
      dispatchBlocked: row.dispatchBlocked,
    }));
}

export type ConfirmProvider = {
  posts: string[];
  confirm: (input: { paymentKey: string; orderId: string; amount: number }) => Promise<{ ok: true; body: ProviderObservation } | { ok: false; kind: "timeout" | "not_found" | "http" }>;
  lookup: (orderId: string) => Promise<{ ok: true; body: ProviderObservation } | { ok: false; kind: "timeout" | "not_found" | "http" }>;
};

export type CapturePort = {
  record: (input: { orderNumber: string; userId: string; claimedPaymentKey: string; amount: number; requireLiveMid: boolean }) => Promise<CaptureRecord | "failed">;
  claim: (orderNumber: string, claimedKey: string) => Promise<{ won: boolean; epoch: number }>;
  markDispatched: (orderNumber: string, epoch: number) => Promise<boolean>;
  applyBody: (orderNumber: string, body: ProviderObservation) => Promise<"ok" | "failed">;
  noteLookup: (orderNumber: string, lookupClass: LookupClass, body?: ProviderObservation) => Promise<void>;
  read: (orderNumber: string) => Promise<CaptureRecord | null>;
};

export function memoryCapturePort(db: MemoryCaptureDb): CapturePort {
  return {
    record: async (input) => {
      try {
        return await recordAttempt(db, input);
      } catch (error) {
        if (error instanceof CaptureDbError || error instanceof CapturePolicyError) return "failed";
        throw error;
      }
    },
    claim: (orderNumber, claimedKey) => claimConfirm(db, orderNumber, claimedKey),
    markDispatched: (orderNumber, epoch) => markDispatched(db, orderNumber, epoch),
    applyBody: async (orderNumber, body) => {
      try {
        await withCaptureLock(orderNumber, () => {
          guardWrite(db);
          const current = db.records.get(orderNumber);
          if (current) {
            current.requireLiveMid = readCapturePolicy(db).requireLiveMid;
            applyFoundObservation(current, body, db.now);
          }
        });
        return "ok";
      } catch (error) {
        if (error instanceof CaptureDbError || error instanceof CapturePolicyError) return "failed";
        throw error;
      }
    },
    noteLookup: (orderNumber, lookupClass, body) => noteLookup(db, orderNumber, lookupClass, body),
    read: async (orderNumber) => db.records.get(orderNumber) ?? null,
  };
}

export async function runMemberConfirm(
  port: CapturePort,
  provider: ConfirmProvider,
  input: { orderNumber: string; userId: string; claimedPaymentKey: string; amount: number; requireLiveMid: boolean },
): Promise<{ status: CaptureStatus | "record_failed"; posts: number }> {
  const before = provider.posts.length;
  const recorded = await port.record(input);
  if (recorded === "failed") return { status: "record_failed", posts: 0 };
  if (recorded.status !== "key_recorded") {
    await reconcileByGet(port, provider, recorded.orderNumber);
    const after = await port.read(input.orderNumber);
    return { status: after?.status ?? recorded.status, posts: provider.posts.length - before };
  }
  const claim = await port.claim(input.orderNumber, input.claimedPaymentKey);
  if (!claim.won) {
    await reconcileByGet(port, provider, input.orderNumber);
    const after = await port.read(input.orderNumber);
    return { status: after?.status ?? "confirm_submitted", posts: provider.posts.length - before };
  }
  const dispatched = await port.markDispatched(input.orderNumber, claim.epoch);
  if (!dispatched) {
    await reconcileByGet(port, provider, input.orderNumber);
    const after = await port.read(input.orderNumber);
    return { status: after?.status ?? "confirm_submitted", posts: provider.posts.length - before };
  }
  provider.posts.push(input.claimedPaymentKey);
  let posted: Awaited<ReturnType<ConfirmProvider["confirm"]>>;
  try {
    posted = await provider.confirm({ paymentKey: input.claimedPaymentKey, orderId: input.orderNumber, amount: input.amount });
  } catch {
    posted = { ok: false, kind: "timeout" };
  }
  if ("kind" in posted) {
    await port.noteLookup(input.orderNumber, posted.kind === "not_found" ? "not_found" : "unavailable");
    await reconcileByGet(port, provider, input.orderNumber);
  } else {
    const applied = await port.applyBody(input.orderNumber, posted.body);
    if (applied === "failed") {
      return { status: "confirm_submitted", posts: provider.posts.length - before };
    }
  }
  const current = await port.read(input.orderNumber);
  return { status: current?.status ?? "confirm_submitted", posts: provider.posts.length - before };
}

async function reconcileByGet(port: CapturePort, provider: ConfirmProvider, orderNumber: string): Promise<void> {
  const looked = await provider.lookup(orderNumber);
  if ("kind" in looked) await port.noteLookup(orderNumber, looked.kind === "not_found" ? "not_found" : "unavailable");
  else await port.noteLookup(orderNumber, "found", looked.body);
}

type RpcResult = { data: unknown; error: { message?: string } | null };
type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult> };

export async function persistProviderObservation(
  admin: RpcClient,
  input: { orderNumber: string; source: "confirm_body" | "get_lookup"; payment: Record<string, unknown> },
): Promise<{ ok: true; status: string } | { ok: false }> {
  const result = await admin.rpc("apply_provider_capture_observation", {
    p_order_number: input.orderNumber,
    p_source: input.source,
    p_observed_payment_key: input.payment.paymentKey ?? null,
    p_provider_order_id: input.payment.orderId ?? null,
    p_amount: input.payment.totalAmount ?? null,
    p_provider_mid: input.payment.mId ?? null,
    p_payment_method: input.payment.method ?? null,
    p_provider_status: input.payment.status ?? null,
    p_transaction_key: input.payment.transactionKey ?? null,
    p_last_transaction_key: input.payment.lastTransactionKey ?? null,
  });
  if (result.error || typeof result.data !== "string") return { ok: false };
  return { ok: true, status: result.data };
}

export async function prepareDurableConfirmDispatch(
  admin: RpcClient,
  input: { orderNumber: string; userId: string; claimedPaymentKey: string; amount: number },
): Promise<"abort" | "post" | "lookup"> {
  const recorded = await admin.rpc("record_provider_capture_attempt", {
    p_order_number: input.orderNumber,
    p_user_id: input.userId,
    p_claimed_payment_key: input.claimedPaymentKey,
    p_amount: input.amount,
  });
  if (recorded.error) return "abort";
  const claim = await admin.rpc("claim_confirm_submit", {
    p_order_number: input.orderNumber,
    p_claimed_payment_key: input.claimedPaymentKey,
  });
  if (claim.error || claim.data !== true) return "lookup";
  const dispatched = await admin.rpc("mark_confirm_dispatched", { p_order_number: input.orderNumber });
  if (dispatched.error || dispatched.data !== true) return "lookup";
  return "post";
}

export const TOSS_CONFIRM_URL = "https://api.tosspayments.com/v1/payments/confirm";

export async function postWinningTossConfirm(
  fetchImpl: typeof fetch,
  secretKey: string,
  input: { paymentKey: string; orderId: string; amount: number },
): Promise<Response> {
  const auth = `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;
  return fetchImpl(TOSS_CONFIRM_URL, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ paymentKey: input.paymentKey, orderId: input.orderId, amount: input.amount }),
  });
}

export async function markFinalized(db: MemoryCaptureDb, orderNumber: string): Promise<"ok" | "retry" | "refused"> {
  return withCaptureLock(orderNumber, () => {
    try {
      guardWrite(db);
    } catch {
      return "retry";
    }
    const row = db.records.get(orderNumber);
    if (!row || row.status !== "provider_done_pending_finalize") return "refused";
    if (row.claimedPaymentKey !== row.observedPaymentKey || row.paymentMethod !== CARD_METHOD) return "refused";
    row.orderFinalized = true;
    row.status = "finalized";
    db.finalizedOrders.add(orderNumber);
    return "ok";
  });
}

export function historicalFinalizeAllowed(db: MemoryCaptureDb, orderNumber: string): boolean {
  return !db.records.has(orderNumber);
}
