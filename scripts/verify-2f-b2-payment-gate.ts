/**
 * NEW 2F B2 server payment verified-phone gate.
 * Payment-test only. No live Toss. No production mutation. No DB migration.
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import { registerOtpAuthRoutes } from "../src/lib/otpAuthHandlers";
import { registerPasswordAuthRoutes } from "../src/lib/passwordAuthHandlers";
import { DevCaptureSmsAdapter } from "../src/lib/smsAdapter";
import { configureExpressTrustProxy } from "../src/lib/trustedClientIp";
import { classifyPostgresConnection, isUsableSupabaseDbUrl } from "../src/lib/supabaseHosts";
import { verifyPaymentMember } from "../src/lib/paymentMemberAuth";
import { isUsableMemberProfile } from "../src/lib/authIntegrity";

const PAYMENT_TEST_REF = "bvihpoorwriejybixmoc";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

type TestResult = { name: string; pass: boolean };
const results: TestResult[] = [];
const createdUserIds: string[] = [];

function assert(name: string, condition: boolean): void {
  results.push({ name, pass: condition });
  console.log(`${condition ? "PASS" : "FAIL"}: ${name}`);
}

function redact(text: string): string {
  return text
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgres://[redacted]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+/g, "[jwt]")
    .replace(/\+82[0-9]{9,12}/g, "[e164]")
    .replace(/\b[0-9a-f]{64}\b/gi, "[hex64]");
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

async function postJson(
  base: string,
  route: string,
  body: unknown,
  token?: string,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${base}${route}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, json };
}

function bearer(token: string): string {
  return `Bearer ${token}`;
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
  const dbEnv = parseEnvFileRaw(path.join(root, ".env.payment-test.db.local"));
  const dbUrlRaw = (process.env.PAYMENT_TEST_DB_URL ?? dbEnv.PAYMENT_TEST_DB_URL ?? "").trim();
  if (dbUrlRaw && isUsableSupabaseDbUrl(dbUrlRaw)) {
    const classified = classifyPostgresConnection(dbUrlRaw);
    if (classified.isProductionRef || classified.ref !== PAYMENT_TEST_REF) {
      throw new Error("PAYMENT_TEST_DB_URL is not payment-test");
    }
  }

  const supabaseUrl = apiEnv.VITE_SUPABASE_URL;
  const anonKey = apiEnv.VITE_SUPABASE_ANON_KEY;
  const serviceKey = apiEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl.includes(PAYMENT_TEST_REF)) throw new Error("not payment-test API");

  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const supabasePublic = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const serverSrc = fs.readFileSync(path.join(root, "server.ts"), "utf8");
  const helperSrc = fs.readFileSync(path.join(root, "src/lib/paymentMemberAuth.ts"), "utf8");
  const adminLoginSrc = fs.readFileSync(path.join(root, "src/pages/AdminLogin.tsx"), "utf8");
  const workshopSrc = fs.readFileSync(path.join(root, "src/components/Workshop/WorkshopView.tsx"), "utf8");

  assert(
    "prepare and confirm both use verifyPaymentBearer",
    (serverSrc.match(/verifyPaymentBearer\(/g) ?? []).length === 3
      && serverSrc.includes('app.post("/api/payment/prepare"')
      && serverSrc.includes('app.post("/api/payment/confirm"')
      && serverSrc.includes("return verifyPaymentMember(supabaseAdmin, supabasePublic, authHeader)"),
  );
  assert(
    "H payment amount/business logic still after member auth",
    serverSrc.includes("validateCheckoutItems")
      && serverSrc.includes("total_price: total")
      && serverSrc.indexOf("verifyPaymentBearer") < serverSrc.indexOf("validateCheckoutItems"),
  );
  assert(
    "G AdminLogin still uses is_admin only",
    adminLoginSrc.includes(".select('id, is_admin')")
      && adminLoginSrc.includes("if (!profileData.is_admin)")
      && !adminLoginSrc.includes("verified_phone"),
  );
  assert(
    "payment helper does not use contact phone as authority",
    helperSrc.includes("isUsableMemberProfile")
      && helperSrc.includes("USABLE_MEMBER_PROFILE_COLUMNS")
      && !helperSrc.includes("shipping_phone")
      && !/select\([^)]*phone_number/.test(helperSrc),
  );
  assert(
    "I this test does not call Toss",
    !fileURLToPath(import.meta.url).includes("toss")
      && !helperSrc.includes("/v1/payments"),
  );

  const suffix = randomBytes(3).toString("hex");
  const password = `Aa1!${randomBytes(12).toString("base64url")}xx`;

  async function createPasswordUser(username: string): Promise<{ id: string; token: string }> {
    const email = `${username}@metalora.me`;
    const created = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { user_custom_id: username, full_name: "게이트" },
    });
    if (created.error || !created.data.user) throw new Error("createUser failed");
    createdUserIds.push(created.data.user.id);
    const session = await supabasePublic.auth.signInWithPassword({ email, password });
    const token = session.data.session?.access_token;
    if (!token) throw new Error("signIn failed");
    return { id: created.data.user.id, token };
  }

  const adapter = new DevCaptureSmsAdapter();
  const app = express();
  configureExpressTrustProxy(app, "local");
  app.use(express.json());
  registerOtpAuthRoutes(app, {
    supabaseAdmin,
    supabasePublic,
    getEnv: () => apiEnv,
    smsAdapter: adapter,
  });
  registerPasswordAuthRoutes(app, {
    supabaseAdmin,
    supabasePublic,
    getEnv: () => apiEnv,
  });
  app.post("/api/payment/prepare", async (req, res) => {
    const authResult = await verifyPaymentMember(
      supabaseAdmin,
      supabasePublic,
      req.headers.authorization,
    );
    if (authResult.ok === false) {
      return res.status(authResult.status).json({ error: authResult.error });
    }
    return res.status(200).json({ payment_member: true });
  });
  const server: http.Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("listen failed");
  const base = `http://127.0.0.1:${addr.port}`;

  try {
    const userA = await createPasswordUser(`pgta${suffix}`);
    const fpA = randomBytes(32).toString("hex");
    await supabaseAdmin
      .from("profiles")
      .update({
        verified_phone_fingerprint: fpA,
        phone_verified_at: new Date().toISOString(),
      })
      .eq("id", userA.id);
    const gateA = await verifyPaymentMember(supabaseAdmin, supabasePublic, bearer(userA.token));
    const prepA = await postJson(base, "/api/payment/prepare", {}, userA.token);
    assert("A username+fingerprint+verified_at payment auth PASS", gateA.ok === true);
    assert("A prepare boundary PASS", prepA.status === 200 && prepA.json.payment_member === true);

    const userB = await createPasswordUser(`pgtb${suffix}`);
    const gateB = await verifyPaymentMember(supabaseAdmin, supabasePublic, bearer(userB.token));
    assert("B username + NO fingerprint FAIL", gateB.ok === false && gateB.status === 400);
    assert(
      "B failure is generic",
      gateB.ok === false && gateB.error === "회원 정보를 확인할 수 없습니다." && !("verified_phone_fingerprint" in gateB),
    );

    const userC = await createPasswordUser(`pgtc${suffix}`);
    await supabaseAdmin
      .from("profiles")
      .update({ verified_phone_fingerprint: randomBytes(32).toString("hex"), phone_verified_at: null })
      .eq("id", userC.id);
    const gateC = await verifyPaymentMember(supabaseAdmin, supabasePublic, bearer(userC.token));
    assert("C fingerprint + NO verified_at FAIL", gateC.ok === false && gateC.status === 400);

    const userD = await createPasswordUser(`pgtd${suffix}`);
    await supabaseAdmin.from("profiles").update({ phone_number: "010-9999-0000" }).eq("id", userD.id);
    const gateD = await verifyPaymentMember(supabaseAdmin, supabasePublic, bearer(userD.token));
    assert("D contact phone only FAIL", gateD.ok === false && gateD.status === 400);
    const profileD = await supabaseAdmin
      .from("profiles")
      .select("phone_number, verified_phone_fingerprint, phone_verified_at")
      .eq("id", userD.id)
      .maybeSingle();
    assert(
      "D contact exists but is not authority",
      profileD.data?.phone_number === "010-9999-0000"
        && !profileD.data.verified_phone_fingerprint
        && !profileD.data.phone_verified_at,
    );

    const trustedName = `pgte${suffix}`;
    const phoneSeed = 3000 + (parseInt(suffix.slice(0, 4), 16) % 6000);
    const phone = `01088${String(phoneSeed).padStart(4, "0")}01`;
    const send = await postJson(base, "/api/auth/otp/send", { purpose: "signup", phone });
    const otp = adapter.peekForTests()?.otp ?? "";
    const verify = await postJson(base, "/api/auth/otp/verify", { purpose: "signup", phone, code: otp });
    const proof = typeof verify.json.proof_token === "string" ? verify.json.proof_token : "";
    const complete = await postJson(base, "/api/auth/signup/complete", {
      proof_token: proof,
      username: trustedName,
      password,
      full_name: "신뢰가입",
      consents: { terms: true, privacy: true, cookie: true },
    });
    const trustedLogin = await supabasePublic.auth.signInWithPassword({
      email: `${trustedName}@metalora.me`,
      password,
    });
    const trustedToken = trustedLogin.data.session?.access_token ?? "";
    const trustedId = trustedLogin.data.user?.id;
    if (trustedId) createdUserIds.push(trustedId);
    const gateE = await verifyPaymentMember(supabaseAdmin, supabasePublic, bearer(trustedToken));
    const prepE = await postJson(base, "/api/payment/prepare", {}, trustedToken);
    const trustedProfile = await supabaseAdmin
      .from("profiles")
      .select("id, user_custom_id, verified_phone_fingerprint, phone_verified_at")
      .eq("id", trustedId ?? "")
      .maybeSingle();
    assert(
      "E trusted signup complete payment auth PASS",
      send.status === 200 && complete.status === 200 && gateE.ok === true && prepE.status === 200,
    );
    assert(
      "E helper parity with isUsableMemberProfile",
      gateE.ok === true && isUsableMemberProfile(trustedProfile.data) === true,
    );

    const rawName = `pgtf${suffix}`;
    const rawSignUp = await supabasePublic.auth.signUp({
      email: `${rawName}@metalora.me`,
      password,
    });
    const rawErr = rawSignUp.error as { status?: number; message?: string } | null;
    if (rawSignUp.data.user?.id) createdUserIds.push(rawSignUp.data.user.id);
    const leftoverLogin = await supabasePublic.auth.signInWithPassword({
      email: `${rawName}@metalora.me`,
      password,
    });
    assert(
      "F raw public provider=email signup BLOCKED by B2b",
      Boolean(rawSignUp.error)
        && !rawSignUp.data.user
        && !rawSignUp.data.session
        && rawErr?.status === 403
        && (rawErr?.message ?? "").includes("Public password signup is not allowed."),
    );
    assert(
      "F no leftover auth user from blocked public signup",
      Boolean(leftoverLogin.error) && !leftoverLogin.data.user && !leftoverLogin.data.session,
    );
    assert(
      "F incomplete member payment reject still proven by admin fixture",
      gateB.ok === false
        && gateB.status === 400
        && gateC.ok === false
        && gateC.status === 400
        && gateD.ok === false
        && gateD.status === 400,
    );

    const adminUser = await createPasswordUser(`pgtg${suffix}`);
    await supabaseAdmin.from("profiles").update({ is_admin: true }).eq("id", adminUser.id);
    const gateAdminShopper = await verifyPaymentMember(
      supabaseAdmin,
      supabasePublic,
      bearer(adminUser.token),
    );
    assert(
      "G admin without verified phone cannot use customer payment",
      gateAdminShopper.ok === false && gateAdminShopper.status === 400,
    );

    assert(
      "Workshop uses raw session getUser and has no payment endpoint",
      workshopSrc.includes("supabase.auth.getUser()")
        && !workshopSrc.includes("/api/payment/")
        && !serverSrc.includes("/api/workshop"),
    );
  } finally {
    server.close();
    for (const id of [...new Set(createdUserIds)]) {
      await supabaseAdmin.auth.admin.deleteUser(id);
    }
  }

  const failed = results.filter((item) => !item.pass);
  console.log(
    `verify-2f-b2-payment-gate ${failed.length === 0 ? "PASS" : "FAIL"} (${results.length - failed.length}/${results.length})`,
  );
  if (failed.length > 0) {
    for (const item of failed) console.error(`- ${item.name}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("verify-2f-b2-payment-gate aborted:", redact(error instanceof Error ? error.message : "unknown"));
  process.exit(1);
});
