/**
 * Mocked Toss checkout method regression. No network, no Toss, no database.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LIVE_TOSS_MID, validateTossDonePayment } from "../src/lib/paymentEnvGuard";
import {
  applyFoundObservation,
  createMemoryCaptureDb,
  markFinalized,
  recordAttempt,
} from "../src/lib/paymentCaptureRecovery";
import { beginAlignedMismatchCancel } from "../src/lib/paymentCaptureCancellation";
import {
  executeFullOrderCancellation,
  type CancellationPort,
  type CancellationProvider,
  type CancellationRecord,
} from "../src/lib/paymentCancellation";

const failures: string[] = [];
function check(name: string, ok: boolean): void {
  if (!ok) failures.push(name);
}

const expected = {
  orderNumber: "ORD-EASY-1",
  totalPrice: 54900,
  paymentKey: "pay_easy_1",
  requireLiveMid: true,
};

const done = {
  status: "DONE",
  orderId: expected.orderNumber,
  totalAmount: expected.totalPrice,
  paymentKey: expected.paymentKey,
  mId: LIVE_TOSS_MID,
};

for (const method of ["카드", "CARD"] as const) {
  const cardOnly = validateTossDonePayment({ ...done, method, card: { amount: 54900 }, easyPay: null }, expected);
  const cardMissing = validateTossDonePayment({ ...done, method }, expected);
  check(`${method} with a card object passes`, cardOnly.ok === true);
  check(`${method} without a card object passes`, cardMissing.ok === true);
}

const money = validateTossDonePayment({
  ...done,
  method: "간편결제",
  card: null,
  easyPay: { provider: "토스페이", amount: 54900, discountAmount: 0 },
}, expected);
check("easy-pay money without card passes", money.ok === true);

const points = validateTossDonePayment({
  ...done,
  method: "EASY_PAY",
  card: null,
  easyPay: { provider: "KAKAOPAY", amount: 0, discountAmount: 54900 },
}, expected);
check("easy-pay points without card passes", points.ok === true);

const mixed = validateTossDonePayment({
  ...done,
  method: "간편결제",
  card: { amount: 34900, useCardPoint: true },
  easyPay: { provider: "네이버페이", amount: 10000, discountAmount: 10000 },
}, expected);
check("easy-pay card, money, and point combination passes", mixed.ok === true);

const missingCardKey = validateTossDonePayment({ ...done, method: "EASY_PAY" }, expected);
check("easy-pay with neither instrument passes on the method enum", missingCardKey.ok === true);

for (const method of ["계좌이체", "TRANSFER", "가상계좌", "VIRTUAL_ACCOUNT", "휴대폰", "MOBILE_PHONE", "card", "easy_pay"]) {
  const rejected = validateTossDonePayment({ ...done, method }, expected);
  check(`${method} is rejected`, rejected.ok === false && rejected.reason === "method_unsupported");
}

const missing = validateTossDonePayment({ ...done, method: undefined }, expected);
check("missing method is rejected", missing.ok === false && missing.reason === "method_missing");

const badCard = validateTossDonePayment({ ...done, method: "간편결제", card: "4111" }, expected);
check("non-object card is rejected", badCard.ok === false && badCard.reason === "card_shape_invalid");

const badEasy = validateTossDonePayment({
  ...done,
  method: "EASY_PAY",
  card: null,
  easyPay: { amount: -1, discountAmount: 0 },
}, expected);
check("negative easy-pay amount is rejected", badEasy.ok === false && badEasy.reason === "easypay_shape_invalid");

const stringEasy = validateTossDonePayment({ ...done, method: "간편결제", easyPay: "TOSSPAY" }, expected);
check("string easyPay is rejected", stringEasy.ok === false && stringEasy.reason === "easypay_shape_invalid");

const wrongAmount = validateTossDonePayment({
  ...done,
  method: "간편결제",
  totalAmount: 100,
  card: null,
  easyPay: { amount: 100, discountAmount: 0 },
}, expected);
check("easy-pay still requires the server amount", wrongAmount.ok === false && wrongAmount.reason === "amount_mismatch");

const wrongMid = validateTossDonePayment({ ...done, method: "CARD", mId: "other" }, expected);
check("easy-pay path still requires the live merchant", wrongMid.ok === false && wrongMid.reason === "mid_mismatch");

async function capture(method: string) {
  const db = createMemoryCaptureDb();
  const orderNumber = `ORD-${method}`;
  await recordAttempt(db, {
    orderNumber,
    userId: "member-1",
    claimedPaymentKey: `pay_${method}`,
    amount: 54900,
    requireLiveMid: true,
  });
  const row = db.records.get(orderNumber);
  if (!row) throw new Error("missing capture");
  applyFoundObservation(row, {
    source: "confirm_body",
    observedPaymentKey: `pay_${method}`,
    providerOrderId: orderNumber,
    amount: 54900,
    providerMid: LIVE_TOSS_MID,
    paymentMethod: method,
    providerStatus: "DONE",
    transactionKey: "tx-easy",
    lastTransactionKey: "tx-easy",
    observedAt: 0,
  }, 1);
  return db;
}

const easyCapture = await capture("간편결제");
const easyBeforeFinalize = await beginAlignedMismatchCancel(easyCapture, {
  orderNumber: "ORD-간편결제",
  actorUserId: "admin-1",
  evidence: "must-not-cancel",
});
check("easy-pay pending finalize is not a method-mismatch cancellation", easyBeforeFinalize.ok === false);
check(
  "easy-pay capture can finalize",
  easyCapture.records.get("ORD-간편결제")?.status === "provider_done_pending_finalize"
    && await markFinalized(easyCapture, "ORD-간편결제") === "ok",
);
check("duplicate easy-pay finalize is refused", await markFinalized(easyCapture, "ORD-간편결제") === "refused");

const interrupted = await capture("EASY_PAY");
interrupted.failNextWrite = true;
check(
  "interrupted easy-pay finalize stays pending",
  await markFinalized(interrupted, "ORD-EASY_PAY") === "retry"
    && interrupted.records.get("ORD-EASY_PAY")?.status === "provider_done_pending_finalize",
);
check("easy-pay finalize recovers after the interrupted write", await markFinalized(interrupted, "ORD-EASY_PAY") === "ok");

const transferCapture = await capture("계좌이체");
check(
  "transfer stays a method mismatch",
  transferCapture.records.get("ORD-계좌이체")?.failureClass === "method_mismatch",
);
const transferCancel = await beginAlignedMismatchCancel(transferCapture, {
  orderNumber: "ORD-계좌이체",
  actorUserId: "admin-1",
  evidence: "unsupported",
});
check("unsupported method remains cancellation-eligible", transferCancel.ok === true);

const cardCapture = await capture("카드");
check("card capture can finalize", await markFinalized(cardCapture, "ORD-카드") === "ok");
check("duplicate card confirmation is refused", await markFinalized(cardCapture, "ORD-카드") === "refused");

function canceledPayment(orderNumber: string, paymentKey: string) {
  return {
    status: "CANCELED",
    orderId: orderNumber,
    paymentKey,
    totalAmount: 54900,
    balanceAmount: 0,
    cancels: [{
      cancelStatus: "DONE",
      transactionKey: "tx-cancel-easy",
      cancelAmount: 54900,
      refundableAmount: 0,
    }],
  };
}

let cancelPosts = 0;
let cancelStatus: CancellationRecord["status"] = "pending";
const cancelRow = (): CancellationRecord => ({
  id: "cancel-easy-1",
  orderNumber: "ORD-EASY-CANCEL",
  paymentKey: "pay_easy_cancel",
  idempotencyKey: "idem-easy-1",
  paidAmount: 54900,
  status: cancelStatus,
  providerAttemptedAt: null,
  transactionKey: cancelStatus === "confirmed" ? "tx-cancel-easy" : null,
});
const cancelPort: CancellationPort = {
  async begin() {
    return { ok: true, row: cancelRow() };
  },
  async claim() {
    return true;
  },
  async mark() {},
  async finalize() {
    cancelStatus = "confirmed";
    return "ok";
  },
};
const cancelProvider: CancellationProvider = {
  async cancel(input) {
    cancelPosts += 1;
    check("easy-pay cancel keeps the stored idempotency key", input.idempotencyKey === "idem-easy-1");
    return { ok: true, payment: canceledPayment(cancelRow().orderNumber, input.paymentKey) };
  },
  async lookup() {
    return { ok: true, payment: canceledPayment("ORD-EASY-CANCEL", "pay_easy_cancel") };
  },
};
const firstCancel = await executeFullOrderCancellation(cancelPort, cancelProvider, {
  orderId: "order-easy-1",
  actorUserId: "admin-1",
  cancelReason: "고객 요청",
});
check("easy-pay cancellation posts once", firstCancel.ok === true && firstCancel.alreadyComplete === false && cancelPosts === 1);
const repeatCancel = await executeFullOrderCancellation(cancelPort, cancelProvider, {
  orderId: "order-easy-1",
  actorUserId: "admin-1",
  cancelReason: "고객 요청",
});
check("repeated easy-pay cancellation does not post again", repeatCancel.ok === true && repeatCancel.alreadyComplete === true && cancelPosts === 1);

let blockedPosts = 0;
const blocked = await executeFullOrderCancellation({
  async begin() {
    return { ok: false, error: "method_unsupported" };
  },
  async claim() {
    return true;
  },
  async mark() {},
  async finalize() {
    return "ok";
  },
}, {
  async cancel() {
    blockedPosts += 1;
    return { ok: true, payment: canceledPayment("ORD-BLOCKED", "pay_blocked") };
  },
  async lookup() {
    return { ok: false, kind: "not_found" };
  },
}, {
  orderId: "order-blocked",
  actorUserId: "admin-1",
  cancelReason: "고객 요청",
});
check("unsupported cancellation does not reach Toss", blocked.ok === false && blocked.error === "method_unsupported" && blockedPosts === 0);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = fs.readFileSync(path.join(root, "server.ts"), "utf8");
const confirmAt = server.indexOf('app.post("/api/payment/confirm"');
const confirmBody = server.slice(confirmAt, server.indexOf("app.post(", confirmAt + 20));
check("confirm uses the shared method acceptance", confirmBody.includes("isAcceptedTossCheckoutMethod"));
check("confirm does not keep the card-only comparison", !confirmBody.includes("REQUIRED_CARD_METHOD"));
check("confirm does not default a missing method", !confirmBody.includes("|| '카드'") && !confirmBody.includes('|| "카드"'));

const sql = fs.readFileSync(path.join(root, "scripts/sql/easypay-method-acceptance.sql"), "utf8");
check("unapplied SQL accepts the documented method pair", sql.includes("p_payment_method IN ('카드', 'CARD', '간편결제', 'EASY_PAY')"));
check("unapplied SQL no longer treats only 카드 as finalizable", !sql.includes("IS DISTINCT FROM '카드'"));
check("unapplied SQL is marked not applied", sql.startsWith("-- NOT APPLIED."));
check(
  "unapplied cancellation accepts the same method set",
  sql.includes("coalesce(v_method, v_info_method) NOT IN ('카드', 'CARD', '간편결제', 'EASY_PAY')"),
);
check("unapplied cancellation returns an existing attempt before insert", sql.includes("IF v_existing.id IS NOT NULL THEN"));
check("unapplied SQL does not drop an index", !sql.includes("DROP INDEX"));
const cancellationMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/20261019120000_new7_full_order_cancellation.sql"),
  "utf8",
);
check("active cancellation unique index remains", cancellationMigration.includes("payment_cancellations_active_order_idx"));

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("TOSS_CHECKOUT_METHOD=PASS");
