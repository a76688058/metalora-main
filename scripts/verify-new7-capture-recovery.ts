/**
 * NEW7 capture-recovery mock verifier. No Toss, no SQL, no network.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 } from "../src/lib/publicPaymentFreeze";
import {
  LIVE_MID,
  STALE_CONFIRM_MS,
  applyFoundObservation,
  claimConfirm,
  createMemoryCaptureDb,
  historicalFinalizeAllowed,
  listWorkQueue,
  markDispatched,
  markFinalized,
  memoryCapturePort,
  noteLookup,
  recordAttempt,
  runMemberConfirm,
  type CaptureRecord,
  type ConfirmProvider,
  type MemoryCaptureDb,
  type ProviderObservation,
} from "../src/lib/paymentCaptureRecovery";
import {
  attestExternalResolution,
  beginAlignedMismatchCancel,
  beginManualObservedKeyRefund,
  claimCancelDispatch,
  recheckBeforeSend,
  runCaptureCancel,
  type CancelTransport,
} from "../src/lib/paymentCaptureCancellation";

const failures: string[] = [];
function check(name: string, ok: boolean): void {
  if (!ok) failures.push(name);
}

const ORDER = "ML-1000";
const KEY = "pay_claimed_key";
const OTHER = "pay_observed_key";

function observation(overrides: Partial<ProviderObservation> = {}): ProviderObservation {
  return {
    source: "confirm_body",
    observedPaymentKey: KEY,
    providerOrderId: ORDER,
    amount: 1000,
    providerMid: LIVE_MID,
    paymentMethod: "카드",
    providerStatus: "DONE",
    transactionKey: "tx-1",
    lastTransactionKey: "tx-1",
    observedAt: 0,
    ...overrides,
  };
}

function provider(behavior: {
  confirm: "done" | "not_found" | "timeout" | "other_key" | "bad_mid" | "missing_mid" | "bad_method" | "missing_method";
  lookup?: "done" | "not_found" | "timeout" | "other_key";
}): ConfirmProvider & { posts: string[] } {
  const posts: string[] = [];
  const bodyFor = (kind: string): ProviderObservation => {
    if (kind === "other_key") return observation({ observedPaymentKey: OTHER, source: "get_lookup" });
    if (kind === "bad_mid") return observation({ providerMid: "other-mid" });
    if (kind === "missing_mid") return observation({ providerMid: null });
    if (kind === "bad_method") return observation({ paymentMethod: "가상계좌" });
    if (kind === "missing_method") return observation({ paymentMethod: null });
    return observation({ source: "get_lookup" });
  };
  return {
    posts,
    async confirm() {
      if (behavior.confirm === "timeout") throw new Error("timeout");
      if (behavior.confirm === "not_found") return { ok: false, kind: "not_found" };
      return { ok: true, body: bodyFor(behavior.confirm) };
    },
    async lookup() {
      const kind = behavior.lookup ?? "not_found";
      if (kind === "timeout") return { ok: false, kind: "timeout" };
      if (kind === "not_found") return { ok: false, kind: "not_found" };
      return { ok: true, body: bodyFor(kind) };
    },
  };
}

function input(requireLiveMid = true) {
  return { orderNumber: ORDER, userId: "user-1", claimedPaymentKey: KEY, amount: 1000, requireLiveMid };
}

async function confirm(db: MemoryCaptureDb, behavior: Parameters<typeof provider>[0], requireLiveMid = true) {
  const port = provider(behavior);
  const result = await runMemberConfirm(memoryCapturePort(db), port, input(requireLiveMid));
  return { ...result, posts: port.posts.length };
}

function canceledBody(paymentKey: string, transactionKey = "tx-cancel") {
  return {
    status: "CANCELED",
    orderId: ORDER,
    paymentKey,
    totalAmount: 1000,
    balanceAmount: 0,
    cancels: [{ cancelStatus: "DONE", transactionKey, cancelAmount: 1000 }],
  };
}

function transport(paymentKey: string, mode: "ok" | "timeout" = "ok"): CancelTransport {
  return {
    posts: [],
    async cancel() {
      if (mode === "timeout") return { ok: false, kind: "timeout" };
      return { ok: true, payment: canceledBody(paymentKey) };
    },
    async lookup() {
      return { ok: true, payment: canceledBody(paymentKey) };
    },
  };
}

async function seed(body: ProviderObservation, requireLiveMid = true): Promise<MemoryCaptureDb> {
  const db = createMemoryCaptureDb();
  await recordAttempt(db, input(requireLiveMid));
  applyFoundObservation(db.records.get(ORDER) as CaptureRecord, body, 0);
  return db;
}

async function main(): Promise<void> {
  const failedRecord = createMemoryCaptureDb();
  failedRecord.failNextWrite = true;
  check("record failure sends 0 posts", (await confirm(failedRecord, { confirm: "done" })).posts === 0);

  const lostClaim = createMemoryCaptureDb();
  const lostClaimPort = memoryCapturePort(lostClaim);
  lostClaimPort.claim = async () => ({ won: false, epoch: 1 });
  const lostClaimProvider = provider({ confirm: "done", lookup: "not_found" });
  const lostClaimResult = await runMemberConfirm(lostClaimPort, lostClaimProvider, input());
  check("lost confirm claim sends 0 posts", lostClaimResult.posts === 0 && lostClaimProvider.posts.length === 0);

  const lostDispatch = createMemoryCaptureDb();
  const lostDispatchPort = memoryCapturePort(lostDispatch);
  lostDispatchPort.markDispatched = async () => false;
  const lostDispatchProvider = provider({ confirm: "done", lookup: "not_found" });
  await runMemberConfirm(lostDispatchPort, lostDispatchProvider, input());
  check("lost dispatch sends 0 posts", lostDispatchProvider.posts.length === 0);

  const winner = createMemoryCaptureDb();
  check("winning dispatch sends 1 post", (await confirm(winner, { confirm: "done", lookup: "done" })).posts === 1);

  const concurrent = createMemoryCaptureDb();
  const concurrentProvider = provider({ confirm: "done", lookup: "not_found" });
  const concurrentLookup = concurrentProvider.lookup.bind(concurrentProvider);
  concurrentProvider.lookup = async (orderId) => {
    if (concurrentProvider.posts.length === 0) return { ok: false, kind: "not_found" };
    return concurrentLookup(orderId);
  };
  await Promise.all([
    runMemberConfirm(memoryCapturePort(concurrent), concurrentProvider, input()),
    runMemberConfirm(memoryCapturePort(concurrent), concurrentProvider, input()),
  ]);
  check(`concurrent confirms have one winner (${concurrentProvider.posts.length})`, concurrentProvider.posts.length === 1);

  const crashed = createMemoryCaptureDb();
  await recordAttempt(crashed, input());
  await claimConfirm(crashed, ORDER, KEY);
  crashed.now = STALE_CONFIRM_MS;
  await noteLookup(crashed, ORDER, "not_found");
  check("crash before HTTP becomes operator review", crashed.records.get(ORDER)?.status === "operator_review");

  const missing = createMemoryCaptureDb();
  const missingRun = await confirm(missing, { confirm: "not_found", lookup: "not_found" });
  check("GET 404 does not send a second post", missingRun.posts === 1);

  const timed = createMemoryCaptureDb();
  const timedRun = await confirm(timed, { confirm: "timeout", lookup: "timeout" });
  check("GET timeout does not send a second post", timedRun.posts === 1);

  const late = createMemoryCaptureDb();
  await recordAttempt(late, input());
  await claimConfirm(late, ORDER, KEY);
  late.now = STALE_CONFIRM_MS;
  await noteLookup(late, ORDER, "not_found");
  await noteLookup(late, ORDER, "found", observation());
  check("late DONE is recoverable", late.records.get(ORDER)?.status === "provider_done_pending_finalize");

  const observeFail = createMemoryCaptureDb();
  const observeProvider = provider({ confirm: "done", lookup: "done" });
  const originalConfirm = observeProvider.confirm.bind(observeProvider);
  observeProvider.confirm = async (value) => {
    observeFail.failNextWrite = true;
    return originalConfirm(value);
  };
  await runMemberConfirm(memoryCapturePort(observeFail), observeProvider, input());
  check("observation failure keeps the claim", observeFail.records.get(ORDER)?.status === "confirm_submitted" && observeFail.records.get(ORDER)?.claimedPaymentKey === KEY);
  const recovered = await confirm(observeFail, { confirm: "done", lookup: "done" });
  check("observation failure can recover without another post", recovered.posts === 0 && observeFail.records.get(ORDER)?.status === "provider_done_pending_finalize");

  const finalizeDb = createMemoryCaptureDb();
  await confirm(finalizeDb, { confirm: "done" });
  finalizeDb.failNextWrite = true;
  check("finalize database failure retries", await markFinalized(finalizeDb, ORDER) === "retry");
  check("finalize retry succeeds", await markFinalized(finalizeDb, ORDER) === "ok");

  const badMid = await confirm(createMemoryCaptureDb(), { confirm: "bad_mid" });
  const missingMid = await confirm(createMemoryCaptureDb(), { confirm: "missing_mid" });
  check("wrong or missing MID does not finalize", badMid.status !== "finalized" && missingMid.status === "provider_mismatch");
  const badMethod = await confirm(createMemoryCaptureDb(), { confirm: "bad_method" });
  const missingMethod = await confirm(createMemoryCaptureDb(), { confirm: "missing_method" });
  check("wrong or missing method does not finalize", badMethod.status === "provider_mismatch" && missingMethod.status === "provider_mismatch");

  const conflict = await confirm(createMemoryCaptureDb(), { confirm: "other_key", lookup: "other_key" });
  check("different paymentKey becomes identity conflict", conflict.status === "identity_conflict");

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const server = fs.readFileSync(path.join(root, "server.ts"), "utf8");
  const confirmAt = server.indexOf('app.post("/api/payment/confirm"');
  const confirmBody = server.slice(confirmAt, server.indexOf("app.post(", confirmAt + 20));
  const recovery = fs.readFileSync(path.join(root, "src/lib/paymentCaptureRecovery.ts"), "utf8");
  check("confirm handler has no legacy confirm URL", !confirmBody.includes("https://api.tosspayments.com/v1/payments/confirm"));
  check("confirm URL exists once on the winning helper", (recovery.match(/https:\/\/api\.tosspayments\.com\/v1\/payments\/confirm/g) ?? []).length === 1);

  const mismatch = await seed(observation({ paymentMethod: "가상계좌" }));
  const mismatchTransport = transport(KEY);
  const mismatchCancel = await runCaptureCancel(mismatch, mismatchTransport, {
    orderNumber: ORDER, actorUserId: "admin-1", evidence: "method", mode: "aligned", winnerToken: 1,
  });
  check("aligned mismatch cancellation", mismatchCancel.posts === 1 && mismatchCancel.status === "provider_canceled");

  const conflictDb = await seed(observation({ observedPaymentKey: OTHER }));
  const conflictTransport = transport(OTHER);
  const conflictCancel = await runCaptureCancel(conflictDb, conflictTransport, {
    orderNumber: ORDER, actorUserId: "admin-1", evidence: "conflict", mode: "conflict", winnerToken: 2,
  });
  check(
    "identity conflict refund uses the observed key",
    conflictCancel.status === "provider_canceled" && conflictDb.records.get(ORDER)?.cancelTargetPaymentKey === OTHER,
  );

  const invalid = await seed(observation({ observedPaymentKey: OTHER, providerOrderId: "other-order" }));
  check("invalid observed target is rejected", !(await beginManualObservedKeyRefund(invalid, { orderNumber: ORDER, actorUserId: "admin-1", evidence: "x" })).ok);

  const amountDb = await seed(observation({ observedPaymentKey: OTHER, amount: 5 }));
  check("different provider amount is rejected", !(await beginManualObservedKeyRefund(amountDb, { orderNumber: ORDER, actorUserId: "admin-1", evidence: "x" })).ok);
  const midDb = await seed(observation({ observedPaymentKey: OTHER, providerMid: "other-mid" }));
  check("different MID is rejected", !(await beginManualObservedKeyRefund(midDb, { orderNumber: ORDER, actorUserId: "admin-1", evidence: "x" })).ok);
  const noMid = await seed(observation({ observedPaymentKey: OTHER, providerMid: null }));
  check("missing MID is rejected", !(await beginManualObservedKeyRefund(noMid, { orderNumber: ORDER, actorUserId: "admin-1", evidence: "x" })).ok);
  const methodDb = await seed(observation({ observedPaymentKey: OTHER, paymentMethod: "계좌이체" }));
  const method2 = observation({ observedPaymentKey: OTHER, paymentMethod: "카드", source: "get_lookup" });
  applyFoundObservation(methodDb.records.get(ORDER) as CaptureRecord, method2, 1);
  check("different method is rejected", !(await beginManualObservedKeyRefund(methodDb, { orderNumber: ORDER, actorUserId: "admin-1", evidence: "x" })).ok);
  const missingMethodDb = await seed(observation({ observedPaymentKey: OTHER, paymentMethod: null }));
  check("missing method is rejected", !(await beginManualObservedKeyRefund(missingMethodDb, { orderNumber: ORDER, actorUserId: "admin-1", evidence: "x" })).ok);
  const statusDb = await seed(observation({ observedPaymentKey: OTHER, providerStatus: "WAITING" }));
  check("different provider status is rejected", !(await beginManualObservedKeyRefund(statusDb, { orderNumber: ORDER, actorUserId: "admin-1", evidence: "x" })).ok);
  const orderDb = await seed(observation({ observedPaymentKey: OTHER, providerOrderId: "ML-other" }));
  check("different provider orderId is rejected", !(await beginManualObservedKeyRefund(orderDb, { orderNumber: ORDER, actorUserId: "admin-1", evidence: "x" })).ok);
  const multiDb = await seed(observation({ observedPaymentKey: OTHER }));
  applyFoundObservation(multiDb.records.get(ORDER) as CaptureRecord, observation({ observedPaymentKey: "pay_third", source: "get_lookup" }), 1);
  check("multiple observed keys are rejected", !(await beginManualObservedKeyRefund(multiDb, { orderNumber: ORDER, actorUserId: "admin-1", evidence: "x" })).ok);

  const race = await seed(observation({ observedPaymentKey: OTHER }));
  const started = await beginManualObservedKeyRefund(race, { orderNumber: ORDER, actorUserId: "admin-1", evidence: "x" });
  applyFoundObservation(race.records.get(ORDER) as CaptureRecord, observation({ observedPaymentKey: "pay_third", source: "get_lookup", amount: 5 }), 1);
  const claimed = await claimCancelDispatch(race, ORDER, 7);
  const blocked = await recheckBeforeSend(race, ORDER, claimed.token ?? 0);
  check("contradictory observation blocks dispatch", started.ok && blocked === "blocked" && race.records.get(ORDER)?.status === "cancel_pending");

  const recheckDb = await seed(observation({ paymentMethod: "가상계좌" }));
  await beginAlignedMismatchCancel(recheckDb, { orderNumber: ORDER, actorUserId: "admin-1", evidence: "x" });
  const won = await claimCancelDispatch(recheckDb, ORDER, 8);
  recheckDb.records.get(ORDER)!.observedPaymentKey = "changed";
  const failedRecheck = await recheckBeforeSend(recheckDb, ORDER, won.token ?? 0);
  const preserved = recheckDb.records.get(ORDER)!;
  check("failed recheck sends 0 posts and preserves the claim", failedRecheck === "blocked" && preserved.cancelIdempotencyKey != null && preserved.cancelProviderAttemptedAt != null && preserved.status === "cancel_pending");

  const dbFail = await seed(observation({ paymentMethod: "가상계좌" }));
  await beginAlignedMismatchCancel(dbFail, { orderNumber: ORDER, actorUserId: "admin-1", evidence: "x" });
  const dbWon = await claimCancelDispatch(dbFail, ORDER, 9);
  dbFail.failNextWrite = true;
  check("database failure during recheck sends 0 posts", await recheckBeforeSend(dbFail, ORDER, dbWon.token ?? 0) === "db_error");

  const oneWinner = await seed(observation({ paymentMethod: "가상계좌" }));
  await beginAlignedMismatchCancel(oneWinner, { orderNumber: ORDER, actorUserId: "admin-1", evidence: "x" });
  const first = await claimCancelDispatch(oneWinner, ORDER, 10);
  const second = await claimCancelDispatch(oneWinner, ORDER, 11);
  check("one cancellation dispatch wins", first.won && !second.won);

  const timeoutDb = await seed(observation({ paymentMethod: "가상계좌" }));
  const timeoutTransport = transport(KEY, "timeout");
  const firstTimeout = await runCaptureCancel(timeoutDb, timeoutTransport, { orderNumber: ORDER, actorUserId: "admin-1", evidence: "x", mode: "aligned", winnerToken: 12 });
  const keyBefore = timeoutDb.records.get(ORDER)?.cancelIdempotencyKey;
  const secondTimeout = await runCaptureCancel(timeoutDb, timeoutTransport, { orderNumber: ORDER, actorUserId: "admin-1", evidence: "x", mode: "aligned", winnerToken: 13 });
  check("cancel timeout does not mint another key or post", firstTimeout.posts === 1 && secondTimeout.posts === 0 && timeoutDb.records.get(ORDER)?.cancelIdempotencyKey === keyBefore);

  const ledgerDb = await seed(observation({ paymentMethod: "가상계좌" }));
  const ledgerRow = ledgerDb.records.get(ORDER)!;
  ledgerRow.ledgerTransactionKey = "existing-other";
  let duplicate = false;
  try {
    await runCaptureCancel(ledgerDb, transport(KEY), { orderNumber: ORDER, actorUserId: "admin-1", evidence: "x", mode: "aligned", winnerToken: 14 });
  } catch (error) {
    duplicate = error instanceof Error && error.message === "duplicate_ledger";
  }
  check("duplicate ledger is rejected", duplicate && ledgerRow.status !== "provider_canceled");

  const atomic = await seed(observation({ paymentMethod: "가상계좌" }));
  await runCaptureCancel(atomic, transport(KEY), { orderNumber: ORDER, actorUserId: "admin-1", evidence: "x", mode: "aligned", winnerToken: 15 });
  const atomicRow = atomic.records.get(ORDER)!;
  check("ledger and canceled status commit together", atomicRow.status === "provider_canceled" && atomicRow.ledgerTransactionKey === "tx-cancel");

  const finalizeRace = await seed(observation());
  const cancelRace = beginAlignedMismatchCancel(finalizeRace, { orderNumber: ORDER, actorUserId: "admin-1", evidence: "x" });
  const paidRace = markFinalized(finalizeRace, ORDER);
  const [cancelResult, paidResult] = await Promise.all([cancelRace, paidRace]);
  check("cancel and finalize cannot both win", cancelResult.ok !== (paidResult === "ok") || finalizeRace.records.get(ORDER)?.status === "finalized");

  const paidCancel = fs.readFileSync(path.join(root, "src/lib/paymentCancellation.ts"), "utf8");
  const captureCancel = fs.readFileSync(path.join(root, "src/lib/paymentCaptureCancellation.ts"), "utf8");
  check(
    "normal PAID cancellation remains separate",
    paidCancel.includes("begin_full_order_cancellation") && !captureCancel.includes("begin_full_order_cancellation"),
  );

  const historical = createMemoryCaptureDb();
  check("historical order without a capture row can finalize", historicalFinalizeAllowed(historical, ORDER));
  await recordAttempt(historical, input());
  check("a new capture cannot use the historical branch", !historicalFinalizeAllowed(historical, ORDER) && await markFinalized(historical, ORDER) === "refused");
  historical.finalizedOrders.add("ML-done");
  let already = false;
  try { await recordAttempt(historical, { ...input(), orderNumber: "ML-done" }); } catch { already = true; }
  check("already finalized order number is rejected", already);

  const callerBypass = createMemoryCaptureDb();
  const bypassResult = await confirm(callerBypass, { confirm: "bad_mid" }, false);
  check("caller MID bypass is ignored while production policy is on", bypassResult.status === "provider_mismatch" && bypassResult.posts === 1);
  const missingPolicy = createMemoryCaptureDb();
  missingPolicy.policy = "missing";
  check("missing production policy fails closed before confirm", (await confirm(missingPolicy, { confirm: "done" })).posts === 0);
  const paymentTestDb = createMemoryCaptureDb();
  paymentTestDb.policy = { requireLiveMid: false, liveMid: "metalom5u3" };
  const paymentTest = await confirm(paymentTestDb, { confirm: "bad_mid" }, true);
  check("payment-test policy may skip the live MID restriction", paymentTest.status === "provider_done_pending_finalize");
  const strict = await seed(observation({ observedPaymentKey: OTHER, providerMid: "other-mid" }), false);
  check("manual refund still requires the live MID", !(await beginManualObservedKeyRefund(strict, { orderNumber: ORDER, actorUserId: "admin-1", evidence: "x" })).ok);
  check("card method is required to finalize", await markFinalized(await seed(observation({ paymentMethod: "가상계좌" })), ORDER) === "refused");
  check("public payment freeze stays active", PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 === true);

  const external = await seed(observation({ providerMid: "other-mid" }));
  const attested = await attestExternalResolution(external, {
    orderNumber: ORDER, actorUserId: "admin-1", evidenceType: "merchant_console", evidenceReference: "case-1", disposition: "ownership_rejected",
  });
  check("wrong MID closes externally without a ledger", attested.ok && external.records.get(ORDER)?.status === "operator_closed" && external.records.get(ORDER)?.ledgerTransactionKey == null);
  check("work queue does not expose payment keys", !JSON.stringify(listWorkQueue(conflictDb)).includes(OTHER));

  const dispatched = createMemoryCaptureDb();
  await recordAttempt(dispatched, input());
  await claimConfirm(dispatched, ORDER, KEY);
  check("dispatch is separate from the claim", await markDispatched(dispatched, ORDER, 1));

  const reserved = await seed(observation({ paymentMethod: "가상계좌" }));
  await beginAlignedMismatchCancel(reserved, { orderNumber: ORDER, actorUserId: "admin-1", evidence: "x" });
  const firstReservation = await claimCancelDispatch(reserved, ORDER, 21);
  const reservedAt = reserved.records.get(ORDER)?.cancelProviderAttemptedAt;
  const secondReservation = await claimCancelDispatch(reserved, ORDER, 22);
  check(
    "first dispatch reservation succeeds and the next one loses",
    firstReservation.won && !secondReservation.won && reserved.records.get(ORDER)?.cancelProviderAttemptedAt === reservedAt && reservedAt != null,
  );

  const mixedMethods = await seed(observation({ paymentMethod: "가상계좌" }));
  await beginAlignedMismatchCancel(mixedMethods, { orderNumber: ORDER, actorUserId: "admin-1", evidence: "x" });
  applyFoundObservation(mixedMethods.records.get(ORDER) as CaptureRecord, observation({ paymentMethod: "계좌이체", source: "get_lookup" }), 1);
  const mixedTransport = transport(KEY);
  const mixedRun = await runCaptureCancel(mixedMethods, mixedTransport, {
    orderNumber: ORDER, actorUserId: "admin-1", evidence: "x", mode: "aligned", winnerToken: 23,
  });
  check("two payment methods block cancellation before POST", mixedRun.posts === 0 && mixedRun.blocked && mixedMethods.records.get(ORDER)?.cancelIdempotencyKey != null);
  const blockedQueue = listWorkQueue(mixedMethods);
  check(
    "blocked cancellation appears without payment keys",
    blockedQueue.some((item) => item.orderNumber === ORDER && item.dispatchBlocked) && !JSON.stringify(blockedQueue).includes(KEY),
  );

  const partial = await seed(observation({ paymentMethod: "가상계좌" }));
  const partialTransport = transport(KEY);
  partialTransport.cancel = async () => ({ ok: true, payment: { ...canceledBody(KEY), balanceAmount: 100, cancels: [{ cancelStatus: "DONE", transactionKey: "tx-cancel", cancelAmount: 900 }] } });
  partialTransport.lookup = async () => ({ ok: true, payment: { ...canceledBody(KEY), balanceAmount: 100, cancels: [{ cancelStatus: "DONE", transactionKey: "tx-cancel", cancelAmount: 900 }] } });
  const partialRun = await runCaptureCancel(partial, partialTransport, { orderNumber: ORDER, actorUserId: "admin-1", evidence: "x", mode: "aligned", winnerToken: 24 });
  check("partial cancellation is not ledgered", partialRun.status === "local_cancel_uncertain" && partial.records.get(ORDER)?.ledgerTransactionKey == null);

  const missingDone = await seed(observation({ paymentMethod: "가상계좌" }));
  const missingDoneTransport = transport(KEY);
  const incomplete = { ...canceledBody(KEY), cancels: [{ cancelStatus: "PENDING", transactionKey: "tx-cancel", cancelAmount: 1000 }] };
  missingDoneTransport.cancel = async () => ({ ok: true, payment: incomplete });
  missingDoneTransport.lookup = async () => ({ ok: true, payment: incomplete });
  check("missing DONE transaction is rejected", (await runCaptureCancel(missingDone, missingDoneTransport, { orderNumber: ORDER, actorUserId: "admin-1", evidence: "x", mode: "aligned", winnerToken: 25 })).status === "local_cancel_uncertain");

  const balance = await seed(observation({ paymentMethod: "가상계좌" }));
  const balanceTransport = transport(KEY);
  const openBalance = { ...canceledBody(KEY), balanceAmount: 1 };
  balanceTransport.cancel = async () => ({ ok: true, payment: openBalance });
  balanceTransport.lookup = async () => ({ ok: true, payment: openBalance });
  check("nonzero remaining balance is rejected", (await runCaptureCancel(balance, balanceTransport, { orderNumber: ORDER, actorUserId: "admin-1", evidence: "x", mode: "aligned", winnerToken: 26 })).status === "local_cancel_uncertain");

  const wrongTx = await seed(observation({ paymentMethod: "가상계좌" }));
  const wrongTxTransport = transport(KEY);
  wrongTxTransport.cancel = async () => ({ ok: true, payment: canceledBody(KEY, "tx-post") });
  wrongTxTransport.lookup = async () => ({ ok: true, payment: canceledBody(KEY, "tx-get") });
  const wrongTxRun = await runCaptureCancel(wrongTx, wrongTxTransport, { orderNumber: ORDER, actorUserId: "admin-1", evidence: "x", mode: "aligned", winnerToken: 27 });
  check("disagreeing transaction keys are rejected", wrongTxRun.status === "local_cancel_uncertain" && wrongTx.records.get(ORDER)?.ledgerTransactionKey == null);

  const ledgerFailure = await seed(observation({ paymentMethod: "가상계좌" }));
  const ledgerFailureTransport = transport(KEY);
  ledgerFailureTransport.lookup = async () => {
    ledgerFailure.failNextWrite = true;
    return { ok: true, payment: canceledBody(KEY) };
  };
  const ledgerFailureRun = await runCaptureCancel(ledgerFailure, ledgerFailureTransport, { orderNumber: ORDER, actorUserId: "admin-1", evidence: "x", mode: "aligned", winnerToken: 28 });
  const ledgerFailureRow = ledgerFailure.records.get(ORDER);
  check(
    "failed ledger write keeps the recovery claim",
    ledgerFailureRun.posts === 1 && ledgerFailureRow?.status === "cancel_pending" && ledgerFailureRow.ledgerTransactionKey == null && ledgerFailureRow.cancelIdempotencyKey != null,
  );

  const noKey = await seed(observation({ providerMid: "other-mid" }));
  noKey.records.get(ORDER)!.observedPaymentKey = null;
  check("missing observed key refuses external attestation", !(await attestExternalResolution(noKey, { orderNumber: ORDER, actorUserId: "admin-1", evidenceType: "merchant_console", evidenceReference: "case-2", disposition: "ownership_rejected" })).ok);
  const missingMidAttest = await seed(observation({ providerMid: "other-mid" }));
  missingMidAttest.records.get(ORDER)!.providerMid = null;
  check("missing MID refuses external attestation", !(await attestExternalResolution(missingMidAttest, { orderNumber: ORDER, actorUserId: "admin-1", evidenceType: "merchant_console", evidenceReference: "case-3", disposition: "ownership_rejected" })).ok);

  const review = createMemoryCaptureDb();
  await recordAttempt(review, input());
  await claimConfirm(review, ORDER, KEY);
  review.now = STALE_CONFIRM_MS;
  await noteLookup(review, ORDER, "not_found");
  const enqueuedAt = review.records.get(ORDER)?.reviewEnqueuedAt ?? 0;
  review.now = enqueuedAt + 3_600_000;
  await noteLookup(review, ORDER, "not_found");
  check("escalation level 1 persists at one hour", review.records.get(ORDER)?.escalationLevel === 1);
  review.now = enqueuedAt + 21_600_000;
  await noteLookup(review, ORDER, "not_found");
  check("escalation level 2 persists at six hours", review.records.get(ORDER)?.escalationLevel === 2);
  review.now = enqueuedAt + 86_400_000;
  await noteLookup(review, ORDER, "not_found");
  check("escalation level 3 persists at twenty-four hours", review.records.get(ORDER)?.escalationLevel === 3);
  review.now = enqueuedAt + 3_600_000;
  await noteLookup(review, ORDER, "not_found");
  check("a later lookup does not lower escalation", review.records.get(ORDER)?.escalationLevel === 3);

  const migrationPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../supabase/migrations/20261024120000_new7_capture_recovery.sql",
  );
  const migrationSql = fs.readFileSync(migrationPath, "utf8").replace(/\r\n/g, "\n");
  const replacementStart = migrationSql.lastIndexOf("CREATE OR REPLACE FUNCTION public.finalize_paid_order(");
  const replacementSql = migrationSql.slice(replacementStart);
  const signature = "public.finalize_paid_order(\n  uuid, text, text, numeric, numeric, text, text, text, text, text, jsonb, jsonb, jsonb\n)";
  check("replacement rejects a non-service caller before writes", replacementSql.includes("PERFORM public.assert_capture_service_role();"));
  check("replacement revokes PUBLIC", replacementSql.includes(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC;`));
  check("replacement revokes anon", replacementSql.includes(`REVOKE EXECUTE ON FUNCTION ${signature} FROM anon;`));
  check("replacement revokes authenticated", replacementSql.includes(`REVOKE EXECUTE ON FUNCTION ${signature} FROM authenticated;`));
  check("replacement grants service_role", replacementSql.includes(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role;`));
  check(
    "replacement does not grant customer roles",
    !/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.finalize_paid_order\([\s\S]*?\)\s+TO\s+(PUBLIC|anon|authenticated)\s*;/.test(replacementSql),
  );
  check(
    "composite policy fields are parenthesized",
    migrationSql.includes("RETURNS public.payment_runtime_policy")
      && migrationSql.includes("(public.capture_runtime_policy()).require_live_mid")
      && migrationSql.includes("(public.capture_runtime_policy()).live_mid")
      && !/public\.capture_runtime_policy\(\)\.[a-z_]/.test(migrationSql),
  );

  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log("NEW7 capture recovery mock verifier PASS");
}

main();
