/**
 * Reproduces ORD-9b20be59 production evidence:
 * method 카드, status DONE, amount 100, mid metalom5u3,
 * and failure_class transaction_key_missing.
 * The deprecated Payment.transactionKey is absent.
 * The current Payment.lastTransactionKey is present.
 * No network, no database, no Toss call, no production write.
 */
import { LIVE_TOSS_MID, validateTossDonePayment } from "../src/lib/paymentEnvGuard";
import {
  persistProviderObservation,
  readTossAcceptanceTransactionKey,
} from "../src/lib/paymentCaptureRecovery";

const failures: string[] = [];
function check(name: string, ok: boolean): void {
  if (!ok) failures.push(name);
}

const ORDER = "ORD-9b20be59-e361-422e-b42f-d16b47c06afd";
const PAYMENT_KEY = "pay_incident";
const LAST_KEY = "last-tx-100";
const ACCEPTED = new Set(["카드", "CARD", "간편결제", "EASY_PAY"]);

function incidentPayment(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    paymentKey: PAYMENT_KEY,
    orderId: ORDER,
    status: "DONE",
    totalAmount: 100,
    method: "카드",
    mId: LIVE_TOSS_MID,
    lastTransactionKey: LAST_KEY,
    card: { approveNo: "12345678" },
    cancels: null,
    ...overrides,
  };
}

function liveBranch(payment: Record<string, unknown>, acceptanceKey: string | null): {
  status: string;
  failureClass: string | null;
} {
  const observedKey = payment.paymentKey;
  if (typeof observedKey === "string" && observedKey !== PAYMENT_KEY) {
    return { status: "identity_conflict", failureClass: "payment_key_conflict" };
  }
  const method = payment.method;
  const aligned = payment.status === "DONE"
    && observedKey === PAYMENT_KEY
    && payment.orderId === ORDER
    && payment.totalAmount === 100
    && typeof method === "string"
    && ACCEPTED.has(method)
    && payment.mId === LIVE_TOSS_MID;
  if (aligned && acceptanceKey) return { status: "provider_done_pending_finalize", failureClass: null };
  if (aligned) return { status: "operator_review", failureClass: "transaction_key_missing" };
  if (payment.status === "DONE") {
    if (payment.mId == null || payment.mId === "") return { status: "provider_mismatch", failureClass: "mid_missing" };
    if (payment.mId !== LIVE_TOSS_MID) return { status: "provider_mismatch", failureClass: "mid_mismatch" };
    if (typeof method !== "string" || method.length === 0) return { status: "provider_mismatch", failureClass: "method_missing" };
    if (!ACCEPTED.has(method)) return { status: "provider_mismatch", failureClass: "method_mismatch" };
    return { status: "operator_review", failureClass: "provider_open" };
  }
  return { status: "operator_review", failureClass: "provider_open" };
}

async function persistedKey(payment: Record<string, unknown>, source: "confirm_body" | "get_lookup" = "get_lookup"): Promise<unknown> {
  let sent: unknown = "not-called";
  const stored = await persistProviderObservation(
    {
      async rpc(_name, args) {
        sent = args.p_transaction_key;
        return { data: args.p_transaction_key ? "provider_done_pending_finalize" : "operator_review", error: null };
      },
    },
    { orderNumber: ORDER, source, payment },
  );
  check("persist returns the rpc status", stored.ok === true);
  return sent;
}

const incident = incidentPayment();
const legacyKey = incident.transactionKey ?? null;
const read = readTossAcceptanceTransactionKey(incident);
check("legacy Payment.transactionKey is absent", legacyKey == null);
check("acceptance uses lastTransactionKey", read.reason === "accepted" && read.acceptanceKey === LAST_KEY);
check("approveNo is not the acceptance key", read.acceptanceKey !== "12345678");
check("paymentKey is not the acceptance key", read.acceptanceKey !== PAYMENT_KEY);
const incidentBranch = liveBranch(incident, read.acceptanceKey);
check("incident body becomes pending finalize", incidentBranch.status === "provider_done_pending_finalize" && incidentBranch.failureClass == null);
check("validator still accepts the card payment", validateTossDonePayment(incident, {
  orderNumber: ORDER,
  totalPrice: 100,
  paymentKey: PAYMENT_KEY,
  requireLiveMid: true,
}).ok === true);

const blank = incidentPayment({ lastTransactionKey: " \n\t" });
const blankRead = readTossAcceptanceTransactionKey(blank);
check("blank transaction fields stay missing", blankRead.reason === "missing" && blankRead.acceptanceKey == null);
const blankBranch = liveBranch(blank, blankRead.acceptanceKey);
check("missing key reproduces transaction_key_missing", blankBranch.status === "operator_review" && blankBranch.failureClass === "transaction_key_missing");

const padded = incidentPayment({ transactionKey: undefined, lastTransactionKey: `  ${LAST_KEY}\n` });
check("edge whitespace is trimmed", readTossAcceptanceTransactionKey(padded).acceptanceKey === LAST_KEY);

const both = incidentPayment({ transactionKey: LAST_KEY });
check("equal deprecated and current keys are accepted", readTossAcceptanceTransactionKey(both).acceptanceKey === LAST_KEY);

const conflict = incidentPayment({ transactionKey: "other-tx" });
const conflictRead = readTossAcceptanceTransactionKey(conflict);
check("disagreeing keys are not substituted", conflictRead.reason === "conflict" && conflictRead.acceptanceKey == null);
check("conflict stays fail-closed", liveBranch(conflict, conflictRead.acceptanceKey).failureClass === "transaction_key_missing");

const tooLong = incidentPayment({ lastTransactionKey: "x".repeat(65) });
check("overlong key is rejected", readTossAcceptanceTransactionKey(tooLong).reason === "invalid");

const wrongKey = incidentPayment({ paymentKey: "pay_other" });
check("wrong payment key is identity_conflict", liveBranch(wrongKey, LAST_KEY).status === "identity_conflict");
check("wrong payment key fails validation", validateTossDonePayment(wrongKey, {
  orderNumber: ORDER,
  totalPrice: 100,
  paymentKey: PAYMENT_KEY,
  requireLiveMid: true,
}).ok === false);

const wrongOrder = incidentPayment({ orderId: "ORD-other" });
check("wrong order id stays out of the missing-key branch", liveBranch(wrongOrder, LAST_KEY).failureClass === "provider_open");
const wrongAmount = incidentPayment({ totalAmount: 74900 });
check("wrong amount stays out of the missing-key branch", liveBranch(wrongAmount, LAST_KEY).failureClass === "provider_open");
const wrongMid = incidentPayment({ mId: "other-mid" });
check("wrong merchant is mid_mismatch", liveBranch(wrongMid, LAST_KEY).failureClass === "mid_mismatch");

const canceled = incidentPayment({
  status: "CANCELED",
  cancels: [{ transactionKey: "cancel-tx", cancelStatus: "DONE", cancelAmount: 100 }],
  lastTransactionKey: "cancel-tx",
});
const canceledRead = readTossAcceptanceTransactionKey(canceled);
check("cancel key is not an approval key", canceledRead.reason === "cancel_superseded" && canceledRead.acceptanceKey == null);
check("canceled payment is not pending finalize", liveBranch(canceled, canceledRead.acceptanceKey).status !== "provider_done_pending_finalize");

const partial = incidentPayment({
  cancels: [{ transactionKey: "partial-tx", cancelStatus: "DONE", cancelAmount: 40 }],
  lastTransactionKey: "partial-tx",
});
check("partial cancel does not finalize", readTossAcceptanceTransactionKey(partial).acceptanceKey == null);

const first = await persistedKey(incident, "confirm_body");
const second = await persistedKey(incident, "get_lookup");
check("confirm and lookup persist the same acceptance key", first === LAST_KEY && second === LAST_KEY);
const repeated = await persistedKey(incident, "get_lookup");
check("duplicate callback persists the same key", repeated === LAST_KEY);
const missingPersisted = await persistedKey(blank);
check("missing key is persisted as null", missingPersisted == null);

type CaptureState = {
  status: string;
  failureClass: string | null;
  transactionKey: string | null;
  amount: number;
  claimedPaymentKey: string;
};

function guardAllows(from: string, to: string): boolean {
  if (from === to) return true;
  return (from === "operator_review" || from === "operator_closed")
    && ["provider_done_pending_finalize", "provider_mismatch", "identity_conflict", "operator_closed"].includes(to);
}

function applyLiveObservation(row: CaptureState, payment: Record<string, unknown>): CaptureState {
  if (["cancel_pending", "local_cancel_uncertain", "provider_canceled", "finalized"].includes(row.status)) {
    return row;
  }
  const acceptance = readTossAcceptanceTransactionKey(payment).acceptanceKey;
  if (typeof payment.paymentKey === "string" && payment.paymentKey !== row.claimedPaymentKey) {
    if (!guardAllows(row.status, "identity_conflict")) throw new Error("guard blocked identity_conflict");
    return { ...row, status: "identity_conflict", failureClass: "payment_key_conflict" };
  }
  const aligned = payment.status === "DONE"
    && payment.orderId === ORDER
    && payment.totalAmount === row.amount
    && payment.method === "카드"
    && payment.mId === LIVE_TOSS_MID
    && payment.paymentKey === row.claimedPaymentKey;
  if (aligned && acceptance) {
    if (!guardAllows(row.status, "provider_done_pending_finalize")) {
      throw new Error("guard blocked provider_done_pending_finalize");
    }
    return {
      ...row,
      status: "provider_done_pending_finalize",
      failureClass: null,
      transactionKey: acceptance,
    };
  }
  if (aligned) {
    return { ...row, status: "operator_review", failureClass: "transaction_key_missing" };
  }
  return row;
}

function dispatchMode(status: string): "post" | "lookup" {
  return status === "key_recorded" ? "post" : "lookup";
}

type OrderRow = { id: string; finalized: boolean };

function finalizeOnce(
  orders: OrderRow[],
  capture: CaptureState,
  snapshotPresent: boolean,
): { orders: OrderRow[]; capture: CaptureState; alreadyFinalized: boolean } {
  if (!snapshotPresent) throw new Error("snapshot_missing");
  const existing = orders.find((order) => order.finalized);
  if (existing) return { orders, capture, alreadyFinalized: true };
  if (orders.length > 0) throw new Error("unfinalized_order");
  if (capture.status !== "provider_done_pending_finalize" || !capture.transactionKey || capture.amount !== 100) {
    throw new Error("not_eligible");
  }
  const nextOrders = [...orders, { id: "order-1", finalized: true }];
  return {
    orders: nextOrders,
    capture: { ...capture, status: "finalized", failureClass: null },
    alreadyFinalized: false,
  };
}

const incidentCapture: CaptureState = {
  status: "operator_review",
  failureClass: "transaction_key_missing",
  transactionKey: null,
  amount: 100,
  claimedPaymentKey: PAYMENT_KEY,
};
check("existing review uses lookup, not a second confirm", dispatchMode(incidentCapture.status) === "lookup");
const recovered = applyLiveObservation(incidentCapture, incident);
check(
  "operator_review accepts the stored lastTransactionKey",
  recovered.status === "provider_done_pending_finalize"
    && recovered.failureClass == null
    && recovered.transactionKey === LAST_KEY,
);
const firstFinal = finalizeOnce([], recovered, true);
const secondFinal = finalizeOnce(firstFinal.orders, firstFinal.capture, true);
check("one recovery creates one finalized order", firstFinal.orders.length === 1 && firstFinal.alreadyFinalized === false);
check("repeated recovery does not create another order", secondFinal.alreadyFinalized === true && secondFinal.orders.length === 1);

let concurrentOrders: OrderRow[] = [];
let concurrentCapture = recovered;
for (const _attempt of [1, 2]) {
  const step = finalizeOnce(concurrentOrders, concurrentCapture, true);
  concurrentOrders = step.orders;
  concurrentCapture = step.capture;
}
check("concurrent recovery still leaves one order", concurrentOrders.length === 1 && concurrentCapture.status === "finalized");

check("missing snapshot refuses finalization", (() => {
  try {
    finalizeOnce([], recovered, false);
    return false;
  } catch (error) {
    return error instanceof Error && error.message === "snapshot_missing";
  }
})());
check(
  "already finalized order stays a single row",
  finalizeOnce([{ id: "order-1", finalized: true }], recovered, true).alreadyFinalized === true,
);

const refunded = incidentPayment({
  status: "CANCELED",
  balanceAmount: 0,
  cancels: [{ cancelAmount: 100, cancelStatus: "DONE", transactionKey: "cancel-tx" }],
  lastTransactionKey: "cancel-tx",
});
const afterRefund = applyLiveObservation(incidentCapture, refunded);
check("refunded lookup does not leave review", afterRefund.status === "operator_review" && afterRefund.transactionKey == null);
check("refunded capture is not eligible", (() => {
  try {
    finalizeOnce([], afterRefund, true);
    return false;
  } catch (error) {
    return error instanceof Error && error.message === "not_eligible";
  }
})());

const mismatched = applyLiveObservation(incidentCapture, incidentPayment({ lastTransactionKey: "different-last-transaction-key" }));
check(
  "a different lastTransactionKey is not this incident's key",
  mismatched.transactionKey !== LAST_KEY,
);
check(
  "the verified incident key remains the only recovery key",
  recovered.transactionKey === LAST_KEY && mismatched.transactionKey !== recovered.transactionKey,
);

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("TRANSACTION_KEY_INCIDENT=PASS");
