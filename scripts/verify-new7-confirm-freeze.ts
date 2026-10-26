/**
 * Offline check for the confirm freeze. Does not start server.ts or call providers.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CARD_SCREENING_TEST_ENABLED } from "../src/lib/cardScreeningTest";
import {
  PUBLIC_PAYMENT_FROZEN_MESSAGE,
  PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7,
  confirmFreezeBlock,
} from "../src/lib/publicPaymentFreeze";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];

function assert(condition: boolean, message: string): void {
  if (!condition) failures.push(message);
}

const hostile = {
  paymentTestMode: true,
  headers: {
    "x-payment-test": "payment-test",
    "metalora-env": "payment-test",
    host: "metalora.art",
    "x-forwarded-host": "evil.example",
  },
};
const blocked = confirmFreezeBlock(hostile);
assert(blocked?.status === 503, "payment-test mode and request headers must still freeze confirm");
assert(blocked?.error === PUBLIC_PAYMENT_FROZEN_MESSAGE, "confirm freeze must use the existing freeze message");
assert(JSON.stringify(blocked) === JSON.stringify(confirmFreezeBlock()), "ignored caller context must not change the decision");
assert(!JSON.stringify(blocked).includes("payment-test"), "decision output must not echo caller context");
assert(!JSON.stringify(blocked).includes("evil.example"), "decision output must not echo caller hosts");

const serverSrc = fs.readFileSync(path.join(root, "server.ts"), "utf8");
const confirmAt = serverSrc.indexOf('app.post("/api/payment/confirm"');
const confirmEnd = serverSrc.indexOf("\n  app.", confirmAt + 20);
const confirmBody = serverSrc.slice(confirmAt, confirmEnd === -1 ? undefined : confirmEnd);
const freezeAt = confirmBody.indexOf("confirmFreezeBlock()");
const returnAt = confirmBody.indexOf("if (confirmFreeze)");
const markers = [
  "newPaymentRequestId()",
  "publicPaymentHostGuard(",
  "paymentCrossWriteGuard(",
  "logPaymentOpsFailure(",
  "verifyPaymentBearer(",
  ".from(",
  ".rpc(",
  "prepareDurableConfirmDispatch(",
  "postWinningTossConfirm(",
  "lookupTossPaymentByOrderId(",
];
assert(freezeAt >= 0 && returnAt > freezeAt, "STATIC_SOURCE_CHECK_ONLY confirm freeze return must be present");
for (const marker of markers) {
  const at = confirmBody.indexOf(marker);
  assert(at > returnAt, `STATIC_SOURCE_CHECK_ONLY ${marker} must follow the freeze return`);
}
assert(!confirmBody.slice(0, returnAt).includes("isPaymentTestMode"), "confirm freeze call must not read payment-test mode");
assert(!confirmBody.slice(0, returnAt).includes("req."), "confirm freeze call must not read the request");

const prepareAt = serverSrc.indexOf('app.post("/api/payment/prepare"');
const prepareBody = serverSrc.slice(prepareAt, confirmAt);
assert(prepareBody.includes("publicPaymentPrepareGuard()"), "prepare must keep its existing freeze guard");
assert(!prepareBody.includes("confirmFreezeBlock()"), "prepare must not use the confirm-only freeze");

assert(PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 === true, "public payment freeze must stay true");
assert(CARD_SCREENING_TEST_ENABLED === false, "screening mode must stay disabled");

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log("BEHAVIORAL_CONFIRM_FREEZE=PASS");
console.log("STATIC_SOURCE_CHECK_ONLY=PASS");
console.log("PREPARE_GUARD_UNCHANGED=PASS");
console.log("PAYMENT_FREEZE=TRUE");
console.log("SCREENING=DISABLED");
