/**
 * Payment-test dest-capture OTP observability.
 * No real SMS. No production mutation. Never prints OTP or secrets.
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { registerOtpAuthRoutes } from "../src/lib/otpAuthHandlers";
import {
  DevCaptureSmsAdapter,
  isPaymentTestDevCaptureEnv,
} from "../src/lib/smsAdapter";
import { PRODUCTION_SUPABASE_URL } from "../src/lib/supabaseHosts";
import { configureExpressTrustProxy } from "../src/lib/trustedClientIp";

const PAYMENT_TEST_REF = "bvihpoorwriejybixmoc";
const DEV_OTP_LATEST = "/api/auth/dev/otp/latest";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

type TestResult = { name: string; pass: boolean };
const results: TestResult[] = [];

function assert(name: string, condition: boolean): void {
  results.push({ name, pass: condition });
  console.log(`${condition ? "PASS" : "FAIL"}: ${name}`);
}

function parseEnvFileRaw(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function testPhone(): string {
  const n = randomBytes(4).readUInt32BE(0) % 100_000_000;
  return `010${String(n).padStart(8, "0")}`;
}

async function postJson(
  base: string,
  route: string,
  body: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${base}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, json };
}

async function getJson(
  base: string,
  route: string,
): Promise<{ status: number; json: Record<string, unknown> | null; text: string }> {
  const res = await fetch(`${base}${route}`);
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

function isSixDigit(value: unknown): value is string {
  return typeof value === "string" && /^\d{6}$/.test(value);
}

async function listenApp(
  env: Record<string, string>,
  adapter: DevCaptureSmsAdapter,
  clients: {
    supabaseAdmin: SupabaseClient | null;
    supabasePublic: SupabaseClient | null;
  },
): Promise<{ base: string; close: () => Promise<void> }> {
  const app = express();
  configureExpressTrustProxy(app, "local");
  app.use(express.json());
  registerOtpAuthRoutes(app, {
    supabaseAdmin: clients.supabaseAdmin,
    supabasePublic: clients.supabasePublic,
    getEnv: () => env,
    smsAdapter: adapter,
  });
  const server: http.Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("listen failed");
  return {
    base: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

async function main(): Promise<void> {
  const apiEnv = parseEnvFileRaw(path.join(root, ".env.payment-test.local"));
  apiEnv.METALORA_ENV = "payment-test";
  apiEnv.VITE_METALORA_ENV = "payment-test";
  if ((apiEnv.PHONE_IDENTITY_KEY ?? "").trim().length < 32 || (apiEnv.OTP_PEPPER ?? "").trim().length < 32) {
    throw new Error("payment-test OTP secrets missing");
  }
  if ((apiEnv.SMS_ADAPTER ?? "").trim() !== "dev-capture") {
    apiEnv.SMS_ADAPTER = "dev-capture";
  }
  const supabaseUrl = apiEnv.VITE_SUPABASE_URL;
  const anonKey = apiEnv.VITE_SUPABASE_ANON_KEY;
  const serviceKey = apiEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl.includes(PAYMENT_TEST_REF)) throw new Error("not payment-test API");

  assert(
    "env gate allows payment-test + dest-capture",
    isPaymentTestDevCaptureEnv(apiEnv) === true,
  );
  assert(
    "env gate blocks non-payment-test",
    isPaymentTestDevCaptureEnv({ ...apiEnv, METALORA_ENV: "production" }) === false,
  );
  assert(
    "env gate blocks non-dev-capture",
    isPaymentTestDevCaptureEnv({ ...apiEnv, SMS_ADAPTER: "" }) === false,
  );
  assert(
    "env gate blocks production supabase host",
    isPaymentTestDevCaptureEnv({ ...apiEnv, VITE_SUPABASE_URL: PRODUCTION_SUPABASE_URL }) === false,
  );

  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const supabasePublic = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const clients = { supabaseAdmin, supabasePublic };
  const adapter = new DevCaptureSmsAdapter();
  const live = await listenApp(apiEnv, adapter, clients);

  try {
    const phone = testPhone();
    const send = await postJson(live.base, "/api/auth/otp/send", { purpose: "signup", phone });
    assert("A signup OTP send", send.status === 200 && send.json.ok === true && send.json.code === undefined);

    const captured = await getJson(live.base, `${DEV_OTP_LATEST}?phone=${encodeURIComponent(phone)}`);
    const code = captured.json?.code;
    assert(
      "A dest endpoint returns captured 6-digit code only",
      captured.status === 200
        && captured.json?.ok === true
        && isSixDigit(code)
        && Object.keys(captured.json ?? {}).sort().join(",") === "code,ok",
    );

    const otherPhone = testPhone();
    const mismatch = await getJson(live.base, `${DEV_OTP_LATEST}?phone=${encodeURIComponent(otherPhone)}`);
    assert(
      "phone filter mismatch is 404",
      mismatch.status === 404 && mismatch.json?.ok === false && mismatch.json?.code === undefined,
    );

    const verify = await postJson(live.base, "/api/auth/otp/verify", {
      purpose: "signup",
      phone,
      code,
    });
    assert("B normal verify with captured code", verify.status === 200 && verify.json.ok === true);

    const phoneWrong = testPhone();
    const sendWrong = await postJson(live.base, "/api/auth/otp/send", {
      purpose: "signup",
      phone: phoneWrong,
    });
    const capturedWrong = await getJson(
      live.base,
      `${DEV_OTP_LATEST}?phone=${encodeURIComponent(phoneWrong)}`,
    );
    const realCode = capturedWrong.json?.code;
    const forged = isSixDigit(realCode) && realCode !== "000000" ? "000000" : "111111";
    const verifyWrong = await postJson(live.base, "/api/auth/otp/verify", {
      purpose: "signup",
      phone: phoneWrong,
      code: forged,
    });
    assert(
      "C wrong OTP still fails",
      sendWrong.status === 200
        && capturedWrong.status === 200
        && verifyWrong.status === 200
        && verifyWrong.json.ok === false
        && verifyWrong.json.proof_token === undefined,
    );
  } finally {
    await live.close();
  }

  const blockedProd = await listenApp(
    { ...apiEnv, METALORA_ENV: "production", VITE_METALORA_ENV: "production" },
    new DevCaptureSmsAdapter(),
    { supabaseAdmin: null, supabasePublic: null },
  );
  try {
    const blocked = await getJson(blockedProd.base, DEV_OTP_LATEST);
    assert(
      "D non-payment-test dest endpoint unavailable",
      blocked.status === 404 && blocked.json?.ok === false && blocked.json?.code === undefined,
    );
  } finally {
    await blockedProd.close();
  }

  const blockedAdapter = await listenApp(
    { ...apiEnv, SMS_ADAPTER: "" },
    new DevCaptureSmsAdapter(),
    { supabaseAdmin: null, supabasePublic: null },
  );
  try {
    const blocked = await getJson(blockedAdapter.base, DEV_OTP_LATEST);
    assert(
      "E non-dev-capture dest endpoint unavailable",
      blocked.status === 404 && blocked.json?.ok === false && blocked.json?.code === undefined,
    );
  } finally {
    await blockedAdapter.close();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`RESULT ${failed.length === 0 ? "PASS" : "FAIL"} ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "verify failed");
  process.exit(1);
});
