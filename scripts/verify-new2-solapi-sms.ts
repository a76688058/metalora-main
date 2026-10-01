/**
 * NEW2 P0.6 — SOLAPI SMS adapter. Mocked transport only. No real SMS.
 * Never prints secrets, OTP codes, or full provider payloads.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isDevCaptureSmsAdapter,
  isPaymentTestDevCaptureEnv,
  resolveSmsAdapter,
} from "../src/lib/smsAdapter";
import {
  otpGenericSmsText,
  readSolapiConfig,
  SolapiSmsAdapter,
  toSolapiPhoneDigits,
  type SolapiMessagePayload,
} from "../src/lib/solapiSmsAdapter";
import { PRODUCTION_SUPABASE_URL } from "../src/lib/supabaseHosts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FAKE_KEY = "test-solapi-api-key-not-real";
const FAKE_SECRET = "super-secret-solapi-value-do-not-leak";
const FAKE_SENDER = "15771603";
const DOC_TO = "01012345678";

type TestResult = { name: string; pass: boolean };
const results: TestResult[] = [];

function assert(name: string, condition: boolean): void {
  results.push({ name, pass: condition });
  console.log(`${condition ? "PASS" : "FAIL"}: ${name}`);
}

function containsSensitive(value: unknown): boolean {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.includes(FAKE_SECRET) || text.includes("Authorization") || /eyJ[A-Za-z0-9_-]+\./.test(text);
}

function completeSolapiEnv(
  extra: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    NODE_ENV: "production",
    METALORA_ENV: "production",
    SMS_ADAPTER: "solapi",
    SOLAPI_API_KEY: FAKE_KEY,
    SOLAPI_API_SECRET: FAKE_SECRET,
    SMS_SENDER_NUMBER: FAKE_SENDER,
    VITE_SUPABASE_URL: PRODUCTION_SUPABASE_URL,
    ...extra,
  };
}

function captureLogs(fn: () => Promise<unknown>): Promise<string> {
  const chunks: string[] = [];
  const original = console.info;
  console.info = (...args: unknown[]) => {
    chunks.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  return fn()
    .catch(() => undefined)
    .finally(() => {
      console.info = original;
    })
    .then(() => chunks.join("\n"));
}

const successResult = {
  groupInfo: { groupId: "G-test", count: { registeredSuccess: 1, registeredFailed: 0, total: 1 } },
  resultList: [{ messageId: "M-test", statusCode: "2000" }],
};

async function main(): Promise<void> {
  const resolvedOk = resolveSmsAdapter(completeSolapiEnv());
  assert("A SMS_ADAPTER=solapi + complete config resolves Solapi", resolvedOk.ok === true && resolvedOk.kind === "solapi");
  assert(
    "A resolved adapter is SolapiSmsAdapter",
    resolvedOk.ok === true && resolvedOk.adapter instanceof SolapiSmsAdapter,
  );

  assert(
    "B missing API key fail closed",
    resolveSmsAdapter(completeSolapiEnv({ SOLAPI_API_KEY: "" })).ok === false,
  );
  assert(
    "C missing API secret fail closed",
    resolveSmsAdapter(completeSolapiEnv({ SOLAPI_API_SECRET: "   " })).ok === false,
  );
  assert(
    "D missing sender number fail closed",
    resolveSmsAdapter(completeSolapiEnv({ SMS_SENDER_NUMBER: "" })).ok === false,
  );
  assert(
    "D invalid sender format fail closed",
    resolveSmsAdapter(completeSolapiEnv({ SMS_SENDER_NUMBER: "+1-555-0000" })).ok === false,
  );

  let sent: SolapiMessagePayload | null = null;
  const successAdapter = new SolapiSmsAdapter({
    apiKey: FAKE_KEY,
    apiSecret: FAKE_SECRET,
    senderNumber: FAKE_SENDER,
    transport: {
      send: async (message) => {
        sent = message;
        return successResult;
      },
    },
  });
  const success = await successAdapter.send({
    e164: "+821012345678",
    templateId: "otp_generic",
    otp: "123456",
    requestId: "req-success",
    ttlSec: 300,
  });
  assert("E provider success → adapter success", success.ok === true && success.ok && success.providerMessageId === "M-test");
  assert(
    "E SOLAPI national digits for to/from",
    sent?.to === DOC_TO && sent?.from === FAKE_SENDER && sent?.text.includes("123456") === true,
  );

  const rejectedAdapter = new SolapiSmsAdapter({
    apiKey: FAKE_KEY,
    apiSecret: FAKE_SECRET,
    senderNumber: FAKE_SENDER,
    transport: {
      send: async () => {
        const err = new Error("provider rejected");
        err.name = "MessageNotReceivedError";
        throw err;
      },
    },
  });
  const rejected = await rejectedAdapter.send({
    e164: "+821012345678",
    templateId: "otp_generic",
    otp: "123456",
    requestId: "req-rej",
    ttlSec: 300,
  });
  assert("F provider rejection → fail closed", rejected.ok === false && rejected.class === "rejected");

  const zeroSuccessAdapter = new SolapiSmsAdapter({
    apiKey: FAKE_KEY,
    apiSecret: FAKE_SECRET,
    senderNumber: FAKE_SENDER,
    transport: {
      send: async () => ({
        groupInfo: { count: { registeredSuccess: 0, registeredFailed: 1, total: 1 } },
        resultList: [{ messageId: "M-fail", statusCode: "4000" }],
      }),
    },
  });
  const zero = await zeroSuccessAdapter.send({
    e164: "+821012345678",
    templateId: "otp_generic",
    otp: "123456",
    requestId: "req-zero",
    ttlSec: 300,
  });
  assert("F registeredSuccess 0 → fail closed", zero.ok === false && zero.class === "rejected");

  const networkAdapter = new SolapiSmsAdapter({
    apiKey: FAKE_KEY,
    apiSecret: FAKE_SECRET,
    senderNumber: FAKE_SENDER,
    transport: {
      send: async () => {
        const err = new Error("connect failed");
        (err as NodeJS.ErrnoException).code = "ECONNRESET";
        throw err;
      },
    },
  });
  const network = await networkAdapter.send({
    e164: "+821012345678",
    templateId: "otp_generic",
    otp: "654321",
    requestId: "req-net",
    ttlSec: 300,
  });
  assert("G network error → fail closed", network.ok === false && network.class === "network");

  const timeoutAdapter = new SolapiSmsAdapter({
    apiKey: FAKE_KEY,
    apiSecret: FAKE_SECRET,
    senderNumber: FAKE_SENDER,
    transport: {
      send: async () => {
        const err = new Error("aborted");
        err.name = "TimeoutError";
        throw err;
      },
    },
  });
  const timeout = await timeoutAdapter.send({
    e164: "+821012345678",
    templateId: "otp_generic",
    otp: "111111",
    requestId: "req-to",
    ttlSec: 300,
  });
  assert("G timeout → fail closed", timeout.ok === false && timeout.class === "timeout");

  const leakAdapter = new SolapiSmsAdapter({
    apiKey: FAKE_KEY,
    apiSecret: FAKE_SECRET,
    senderNumber: FAKE_SENDER,
    transport: {
      send: async () => {
        throw new Error(`HMAC failed secret=${FAKE_SECRET}`);
      },
    },
  });
  const leakLogs = await captureLogs(async () => leakAdapter.send({
    e164: "+821012345678",
    templateId: "otp_generic",
    otp: "999999",
    requestId: "req-leak",
    ttlSec: 300,
  }));
  const leakResult = await leakAdapter.send({
    e164: "+821012345678",
    templateId: "otp_generic",
    otp: "999999",
    requestId: "req-leak2",
    ttlSec: 300,
  });
  assert(
    "H no secret in result or logs",
    leakResult.ok === false && !containsSensitive(leakResult) && !containsSensitive(leakLogs) && !leakLogs.includes("999999"),
  );

  const paymentTestEnv = {
    METALORA_ENV: "payment-test",
    SMS_ADAPTER: "dev-capture",
    VITE_SUPABASE_URL: "https://bvihpoorwriejybixmoc.supabase.co",
  };
  const paymentResolved = resolveSmsAdapter(paymentTestEnv);
  assert(
    "I dev-capture still works in payment-test gate",
    paymentResolved.ok === true &&
      paymentResolved.kind === "dev-capture" &&
      isDevCaptureSmsAdapter(paymentResolved.adapter) &&
      isPaymentTestDevCaptureEnv(paymentTestEnv) === true,
  );

  const prodHostDev = resolveSmsAdapter({
    NODE_ENV: "production",
    METALORA_ENV: "payment-test",
    SMS_ADAPTER: "dev-capture",
    VITE_SUPABASE_URL: PRODUCTION_SUPABASE_URL,
  });
  assert("J production host cannot resolve dev-capture", prodHostDev.ok === false);
  assert(
    "J peek gate blocks production host",
    isPaymentTestDevCaptureEnv({
      METALORA_ENV: "payment-test",
      SMS_ADAPTER: "dev-capture",
      VITE_SUPABASE_URL: PRODUCTION_SUPABASE_URL,
    }) === false,
  );
  assert(
    "J production NODE_ENV blocks dev-capture even off prod host",
    resolveSmsAdapter({
      NODE_ENV: "production",
      METALORA_ENV: "production",
      SMS_ADAPTER: "dev-capture",
      VITE_SUPABASE_URL: "https://bvihpoorwriejybixmoc.supabase.co",
    }).ok === false,
  );

  assert(
    "credentials without SMS_ADAPTER=solapi do not select solapi",
    resolveSmsAdapter({
      NODE_ENV: "production",
      SOLAPI_API_KEY: FAKE_KEY,
      SOLAPI_API_SECRET: FAKE_SECRET,
      SMS_SENDER_NUMBER: FAKE_SENDER,
      VITE_SUPABASE_URL: PRODUCTION_SUPABASE_URL,
    }).ok === false,
  );

  const otpSrc = fs.readFileSync(path.join(root, "src/lib/otpAuthHandlers.ts"), "utf8");
  const sendIdx = otpSrc.indexOf("async function handleOtpSend");
  const sendFn = sendIdx >= 0 ? otpSrc.slice(sendIdx, otpSrc.indexOf("async function handleOtpVerify")) : "";
  assert("K OTP send still rate-limits phone before adapter", sendFn.includes("otp_send_phone") && sendFn.indexOf("otp_send_phone") < sendFn.indexOf("resolveAdapter"));
  assert("K OTP send still rate-limits IP before adapter", sendFn.includes("otp_send_ip") && sendFn.indexOf("otp_send_ip") < sendFn.indexOf("adapter.send"));
  assert("K challenge is created then SMS is sent", sendFn.indexOf("otp_create_active_challenge") < sendFn.indexOf("adapter.send"));
  assert(
    "K failed SMS marks challenge failed",
    sendFn.includes('sms.ok === false') && sendFn.includes('status: "failed"'),
  );
  const purposeSrc = fs.readFileSync(path.join(root, "src/lib/otpCrypto.ts"), "utf8");
  assert(
    "K OTP purposes unchanged",
    purposeSrc.includes('"signup"') &&
      purposeSrc.includes('"recovery"') &&
      purposeSrc.includes('"change_phone"') &&
      purposeSrc.includes('"identity_link"'),
  );
  assert(
    "K dest-capture peek still gated",
    otpSrc.includes('app.get("/api/auth/dev/otp/latest"') && otpSrc.includes("isPaymentTestDevCaptureEnv"),
  );

  assert("sender digits accept hyphenated national", toSolapiPhoneDigits("010-1234-5678") === "01012345678");
  assert("sender digits accept +82 mobile", toSolapiPhoneDigits("+821012345678") === "01012345678");
  assert("OTP SMS text is transactional not marketing", otpGenericSmsText("123456", 300) === "[METALORA] 인증번호 123456 (5분)");
  assert("readSolapiConfig null when incomplete", readSolapiConfig({ SOLAPI_API_KEY: FAKE_KEY }) === null);

  const failed = results.filter((row) => !row.pass);
  console.log(`\n${results.length - failed.length}/${results.length} PASS`);
  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "verify failed");
  process.exit(1);
});
