/**
 * NEW7 Gate A. Non-mutating. Does not print key material or call Toss.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CANONICAL_PAYMENT_HOST,
  LIVE_TOSS_MID,
  PAYMENT_HOST_SPOOFING_ASSESSMENT,
  REQUIRED_CARD_METHOD,
  capturedPaymentLocalMismatchDisposition,
  cartMayOpenCanonicalCheckout,
  evaluateCanonicalPaymentHost,
  refusePaymentTestProductionHost,
  refuseTossTestToProductionSupabase,
  validateTossDonePayment,
} from "../src/lib/paymentEnvGuard";
import { CARD_SCREENING_TEST_ENABLED } from "../src/lib/cardScreeningTest";
import { PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 } from "../src/lib/publicPaymentFreeze";
import { PRODUCTION_SUPABASE_URL } from "../src/lib/supabaseHosts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];

function assert(condition: boolean, message: string): void {
  if (!condition) failures.push(message);
}

const candidateHost = "candidate---metalora-direct-abc.a.run.app";
const revisionHost = "metalora-direct-00160-rix-xyz.a.run.app";

const canonical = evaluateCanonicalPaymentHost({
  hostHeader: CANONICAL_PAYMENT_HOST,
  forwardedHostHeader: undefined,
  paymentTestIsolated: false,
});
assert(canonical.refuse === false && canonical.mode === "canonical", "canonical host must be accepted");

const canonicalPort = evaluateCanonicalPaymentHost({
  hostHeader: "metalora.art:443",
  forwardedHostHeader: "metalora.art",
  paymentTestIsolated: false,
});
assert(canonicalPort.refuse === false, "canonical host with a numeric port and matching forwarded host must be accepted");

const candidate = evaluateCanonicalPaymentHost({
  hostHeader: candidateHost,
  forwardedHostHeader: undefined,
  paymentTestIsolated: false,
});
assert(candidate.refuse === true && candidate.reason === "non_canonical_host", "candidate run.app host must be rejected");

const revision = evaluateCanonicalPaymentHost({
  hostHeader: revisionHost,
  forwardedHostHeader: undefined,
  paymentTestIsolated: false,
});
assert(revision.refuse === true && revision.reason === "non_canonical_host", "revision run.app host must be rejected");

const forwardedMismatch = evaluateCanonicalPaymentHost({
  hostHeader: CANONICAL_PAYMENT_HOST,
  forwardedHostHeader: candidateHost,
  paymentTestIsolated: false,
});
assert(
  forwardedMismatch.refuse === true && forwardedMismatch.reason === "forwarded_host_mismatch",
  "X-Forwarded-Host mismatch must be rejected",
);

const spoofedForward = evaluateCanonicalPaymentHost({
  hostHeader: candidateHost,
  forwardedHostHeader: CANONICAL_PAYMENT_HOST,
  paymentTestIsolated: false,
});
assert(
  spoofedForward.refuse === true,
  "X-Forwarded-Host must not authorize a candidate host",
);

const missing = evaluateCanonicalPaymentHost({
  hostHeader: undefined,
  forwardedHostHeader: undefined,
  paymentTestIsolated: false,
});
assert(missing.refuse === true && missing.reason === "missing_host", "missing host must be rejected");

const blank = evaluateCanonicalPaymentHost({
  hostHeader: "   ",
  forwardedHostHeader: undefined,
  paymentTestIsolated: false,
});
assert(blank.refuse === true && blank.reason === "missing_host", "blank host must be rejected");

const chain = evaluateCanonicalPaymentHost({
  hostHeader: "metalora.art, evil.example",
  forwardedHostHeader: undefined,
  paymentTestIsolated: false,
});
assert(chain.refuse === true && chain.reason === "malformed_host", "comma-joined host must be rejected");

const multiForward = evaluateCanonicalPaymentHost({
  hostHeader: CANONICAL_PAYMENT_HOST,
  forwardedHostHeader: [CANONICAL_PAYMENT_HOST, candidateHost],
  paymentTestIsolated: false,
});
assert(multiForward.refuse === true && multiForward.reason === "malformed_host", "multiple forwarded hosts must be rejected");

assert(
  PAYMENT_HOST_SPOOFING_ASSESSMENT.classification === "LIMITATION"
    && PAYMENT_HOST_SPOOFING_ASSESSMENT.gateB === "BLOCKED"
    && PAYMENT_HOST_SPOOFING_ASSESSMENT.summary.includes("not prove"),
  "header spoofing assessment must stay a Gate B limitation",
);

const done = {
  status: "DONE",
  orderId: "ORD-GATE-A",
  totalAmount: 1000,
  paymentKey: "pay_gate_a",
  method: REQUIRED_CARD_METHOD,
  mId: LIVE_TOSS_MID,
};
const expected = {
  orderNumber: "ORD-GATE-A",
  totalPrice: 1000,
  paymentKey: "pay_gate_a",
  requireLiveMid: true,
};
assert(validateTossDonePayment(done, expected).ok === true, "production card payment for the live MID must pass");

const wrongMid = validateTossDonePayment({ ...done, mId: "othermid" }, expected);
assert(wrongMid.ok === false && wrongMid.reason === "mid_mismatch", "incorrect MID must be rejected");

const missingMid = validateTossDonePayment({ ...done, mId: undefined }, expected);
assert(missingMid.ok === false && missingMid.reason === "mid_missing", "missing production MID must be rejected");

const missingMethod = validateTossDonePayment({ ...done, method: undefined }, expected);
assert(missingMethod.ok === false && missingMethod.reason === "method_missing", "missing method must be rejected");

const otherMethod = validateTossDonePayment({ ...done, method: "계좌이체" }, expected);
assert(otherMethod.ok === false && otherMethod.reason === "method_not_card", "non-card method must be rejected");

const testPayment = validateTossDonePayment(
  { ...done, mId: "testmid" },
  { ...expected, requireLiveMid: false },
);
assert(testPayment.ok === true, "payment-test must keep card validation without requiring the live MID");

const testMissingMethod = validateTossDonePayment(
  { ...done, method: undefined, mId: "testmid" },
  { ...expected, requireLiveMid: false },
);
assert(testMissingMethod.ok === false && testMissingMethod.reason === "method_missing", "payment-test must still reject a missing method");

const captured = capturedPaymentLocalMismatchDisposition("mid_mismatch");
assert(
  captured.finalize === false
    && captured.retryProviderConfirm === false
    && captured.recoveryRequired === true
    && captured.adminCancelAutomaticallyAvailable === false,
  "provider success with local MID mismatch must not finalize or retry confirm",
);
const notDone = capturedPaymentLocalMismatchDisposition("status_not_done:READY");
assert(notDone.finalize === false && notDone.recoveryRequired === false, "non-DONE provider status must not be treated as a capture");

assert(CARD_SCREENING_TEST_ENABLED === false, "screening mode must be disabled");
assert(PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 === true, "public payment freeze must stay true");

const testCross = refuseTossTestToProductionSupabase({
  tossSecretKey: "test_sk_PLACEHOLDER_NOT_A_REAL_SECRET",
  supabaseUrl: PRODUCTION_SUPABASE_URL,
});
assert(testCross.refuse === true, "payment-test secret must still refuse the production Supabase host");
const testHost = refusePaymentTestProductionHost({
  metaloraEnv: "payment-test",
  supabaseUrl: "https://example-payment-test.supabase.co",
});
assert(testHost.refuse === false, "isolated payment-test host must remain allowed by the existing guard");

const paymentTestCart = cartMayOpenCanonicalCheckout({
  hostname: "localhost",
  paymentTestIsolated: true,
});
const candidateCart = cartMayOpenCanonicalCheckout({
  hostname: candidateHost,
  paymentTestIsolated: false,
});
const canonicalCart = cartMayOpenCanonicalCheckout({
  hostname: CANONICAL_PAYMENT_HOST,
  paymentTestIsolated: false,
});
assert(paymentTestCart && canonicalCart && !candidateCart, "cart host gate must allow only the canonical host outside payment-test");

const serverSrc = fs.readFileSync(path.join(root, "server.ts"), "utf8");
const prepareAt = serverSrc.indexOf('app.post("/api/payment/prepare"');
const confirmAt = serverSrc.indexOf('app.post("/api/payment/confirm"');
const prepareBody = serverSrc.slice(prepareAt, confirmAt);
const confirmEnd = serverSrc.indexOf("app.post(", confirmAt + 20);
const confirmBody = serverSrc.slice(confirmAt, confirmEnd === -1 ? undefined : confirmEnd);
const prepareHost = prepareBody.indexOf("publicPaymentHostGuard(req)");
const prepareInsert = prepareBody.indexOf(".from('payment_intents')");
assert(prepareHost >= 0 && prepareInsert > prepareHost, "prepare must apply the host guard before inserting a payment intent");
assert(prepareBody.includes("publicPaymentPrepareGuard()"), "prepare must keep the public freeze guard");
const confirmHost = confirmBody.indexOf("publicPaymentHostGuard(req)");
const confirmDispatch = confirmBody.indexOf("prepareDurableConfirmDispatch");
const confirmPost = confirmBody.indexOf("postWinningTossConfirm");
assert(
  confirmHost >= 0 && confirmDispatch > confirmHost && confirmPost > confirmDispatch,
  "confirm must apply the host guard before the durable dispatch",
);
assert(
  !confirmBody.includes("https://api.tosspayments.com/v1/payments/confirm"),
  "confirm handler must not call Toss confirm directly",
);
assert(!confirmBody.includes("publicPaymentPrepareGuard()"), "confirm must not take the prepare freeze");
assert(confirmBody.includes("requireLiveMid: !isPaymentTestMode"), "confirm must require the live MID outside payment-test");
assert(
  confirmBody.split("capturedPaymentLocalMismatchDisposition").length >= 3,
  "both confirm validation failures must use the mismatch disposition",
);
assert(
  confirmBody.includes("retryable: disposition.retryProviderConfirm"),
  "mismatch handling must not mark provider confirm as retryable",
);
const recoverySrc = fs.readFileSync(path.join(root, "src/lib/paymentCaptureRecovery.ts"), "utf8");
assert(
  (recoverySrc.match(/https:\/\/api\.tosspayments\.com\/v1\/payments\/confirm/g) ?? []).length === 1,
  "the Toss confirm URL must exist only on the winning dispatch helper",
);
assert(!confirmBody.includes("|| '카드'") && !confirmBody.includes('|| "카드"'), "confirm must not default a missing method to 카드");
assert(serverSrc.includes("registerFullOrderCancellationRoute(app,"), "admin cancellation route must stay registered");
assert(!serverSrc.includes("function publicPaymentHostGuard") || !serverSrc.slice(serverSrc.indexOf("function publicPaymentHostGuard"), serverSrc.indexOf("function publicPaymentHostGuard") + 700).includes("requestHostname("), "payment host guard must not delegate to requestHostname");

const cancelSrc = fs.readFileSync(path.join(root, "src/lib/paymentCancellation.ts"), "utf8");
assert(cancelSrc.includes("/api/admin/orders/:orderId/cancel"), "admin cancellation path must stay in place");

const cartSrc = fs.readFileSync(path.join(root, "src/components/Cart.tsx"), "utf8");
const tossInit = cartSrc.indexOf("loadTossPayments(resolvedClientKey.key)");
const cartGate = cartSrc.lastIndexOf("cartMayOpenCanonicalCheckout", tossInit);
assert(cartGate >= 0 && cartGate < tossInit, "cart must check the canonical host before opening Toss");
assert((cartSrc.match(/requestPayment\('카드'/g) ?? []).length === 2, "checkout must still request 카드 only");
assert(!cartSrc.includes("test_ck_") && !cartSrc.includes("live_ck_"), "cart source must not embed a Toss client key");
assert(
  cartSrc.includes("purpose: paymentTestIsolated ? 'payment-test' : 'production-checkout'"),
  "production checkout must select a separate client-key purpose from payment-test",
);
assert(
  cartSrc.includes("import.meta.env.VITE_TOSS_LIVE_CLIENT_KEY"),
  "production checkout must read only the live client-key env",
);
assert(
  cartSrc.includes("purpose: 'screening'") && cartSrc.includes("import.meta.env.VITE_TOSS_TEST_CLIENT_KEY"),
  "screening must keep the test client-key path",
);
const screeningFn = cartSrc.slice(cartSrc.indexOf("const handleScreeningPayment"));
assert(
  !screeningFn.includes("VITE_TOSS_LIVE_CLIENT_KEY"),
  "screening must not read the production client key",
);

const freezeSrc = fs.readFileSync(path.join(root, "src/lib/publicPaymentFreeze.ts"), "utf8");
assert(freezeSrc.includes("PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 = true"), "freeze source must stay true");
const screeningSrc = fs.readFileSync(path.join(root, "src/lib/cardScreeningTest.ts"), "utf8");
assert(screeningSrc.includes("CARD_SCREENING_TEST_ENABLED = false"), "screening source must stay false");

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}

console.log("GATE_A_HOST_CHECKS=PASS");
console.log(`HEADER_SPOOFING=${PAYMENT_HOST_SPOOFING_ASSESSMENT.classification}`);
console.log(`GATE_B=${PAYMENT_HOST_SPOOFING_ASSESSMENT.gateB}`);
console.log("MID_VALIDATION=PASS");
console.log("CARD_METHOD_VALIDATION=PASS");
console.log("RECONCILIATION=PRESERVED");
console.log("RECONCILIATION_LIMITATION=ops recovery_required only; admin cancel has no stored payment_key for an unfinalized capture");
console.log("SCREENING=DISABLED");
console.log("PAYMENT_FREEZE=TRUE");
console.log("PAYMENT_TEST_ISOLATION=PASS");
console.log("CANCELLATION=PRESERVED");
console.log("GATE_A_VERIFIER=PASS");
