/**
 * NEW 2F C1-3 payment-test recovery linked_providers + live Google inspect.
 * Creates/deletes disposable payment-test Auth fixtures only.
 * Does not delete live Google/Kakao identities. Does not activate membership.
 * Does not print secrets, OTP, e164, emails, provider subjects, or tokens.
 */
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import {
  classifyAccount,
  customerVisibleLinkedProviders,
} from "../src/lib/accountKind";
import { isUsableMemberProfile } from "../src/lib/authIntegrity";
import { generateInternalSocialUsername } from "../src/lib/internalSocialUsername";
import {
  GENERATED_SOCIAL_USERNAME_RE,
  memberAuthEmail,
} from "../src/lib/memberUsername";
import { registerOtpAuthRoutes } from "../src/lib/otpAuthHandlers";
import { otpTicketHmac } from "../src/lib/otpCrypto";
import { registerPasswordAuthRoutes } from "../src/lib/passwordAuthHandlers";
import { MEMBER_PASSWORD_MIN_LEN, memberPasswordError } from "../src/lib/passwordPolicy";
import { verifyPaymentMember } from "../src/lib/paymentMemberAuth";
import { phoneFingerprint } from "../src/lib/phoneHmac";
import { registerSocialAuthRoutes } from "../src/lib/socialAuthHandlers";
import { DevCaptureSmsAdapter, isPaymentTestDevCaptureEnv } from "../src/lib/smsAdapter";
import { configureExpressTrustProxy } from "../src/lib/trustedClientIp";
import {
  classifyPostgresConnection,
  isUsableSupabaseDbUrl,
  PRODUCTION_SUPABASE_REF,
} from "../src/lib/supabaseHosts";

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
    .replace(/\b[0-9a-f]{64}\b/gi, "[hex64]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]");
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

function encodeDbUrl(raw: string): string {
  const schemeIdx = raw.indexOf("://");
  if (schemeIdx < 0) return raw;
  const scheme = raw.slice(0, schemeIdx + 3);
  const rest = raw.slice(schemeIdx + 3);
  const at = rest.lastIndexOf("@");
  if (at < 0) return raw;
  const userinfo = rest.slice(0, at);
  const hostpart = rest.slice(at + 1);
  const colon = userinfo.indexOf(":");
  if (colon < 0) return raw;
  const encodePart = (part: string): string => {
    try {
      return encodeURIComponent(decodeURIComponent(part));
    } catch {
      return encodeURIComponent(part);
    }
  };
  return `${scheme}${encodePart(userinfo.slice(0, colon))}:${encodePart(userinfo.slice(colon + 1))}@${hostpart}`;
}

function dbQueryFile(dbUrl: string, filePath: string): string {
  const npxCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");
  const result = fs.existsSync(npxCli)
    ? spawnSync(
        process.execPath,
        [npxCli, "--yes", "supabase", "db", "query", "--db-url", dbUrl, "--file", filePath],
        { encoding: "utf8", maxBuffer: 10_000_000, windowsHide: true, env: process.env, cwd: root },
      )
    : spawnSync(
        process.platform === "win32" ? "npx.cmd" : "npx",
        ["--yes", "supabase", "db", "query", "--db-url", dbUrl, "--file", filePath],
        {
          encoding: "utf8",
          maxBuffer: 10_000_000,
          windowsHide: true,
          shell: process.platform === "win32",
          env: process.env,
          cwd: root,
        },
      );
  if (result.status !== 0) {
    throw new Error(redact(result.stderr || result.stdout || "db query failed"));
  }
  return result.stdout ?? "";
}

function dbQuerySql(dbUrl: string, sql: string): string {
  const tmp = path.join(os.tmpdir(), `metalora-c13-${randomBytes(8).toString("hex")}.sql`);
  fs.writeFileSync(tmp, sql, "utf8");
  try {
    return dbQueryFile(dbUrl, tmp);
  } finally {
    fs.unlinkSync(tmp);
  }
}

function parseCount(raw: string): number {
  const json = raw.match(/"n"\s*:\s*(\d+)/);
  if (json) return Number(json[1]);
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d+$/.test(line));
  if (lines.length === 1) return Number(lines[0]);
  return -1;
}

function countLive(dbUrl: string): {
  googleUsers: number;
  kakaoUsers: number;
  googlePending: number;
  googleActivated: number;
} {
  const googleUsers = parseCount(
    dbQuerySql(dbUrl, `SELECT count(DISTINCT user_id)::int AS n FROM auth.identities WHERE provider = 'google';`),
  );
  const kakaoUsers = parseCount(
    dbQuerySql(dbUrl, `SELECT count(DISTINCT user_id)::int AS n FROM auth.identities WHERE provider = 'kakao';`),
  );
  const googlePending = parseCount(
    dbQuerySql(
      dbUrl,
      `SELECT count(DISTINCT i.user_id)::int AS n
       FROM auth.identities i
       JOIN public.profiles p ON p.id = i.user_id
       WHERE i.provider = 'google'
         AND p.password_login_enabled = false
         AND p.social_login_enabled = false
         AND p.user_custom_id IS NULL
         AND p.verified_phone_fingerprint IS NULL
         AND p.phone_verified_at IS NULL;`,
    ),
  );
  const googleActivated = parseCount(
    dbQuerySql(
      dbUrl,
      `SELECT count(DISTINCT i.user_id)::int AS n
       FROM auth.identities i
       JOIN public.profiles p ON p.id = i.user_id
       WHERE i.provider = 'google'
         AND p.social_login_enabled = true
         AND p.user_custom_id IS NOT NULL
         AND btrim(p.user_custom_id) <> ''
         AND p.verified_phone_fingerprint IS NOT NULL
         AND p.phone_verified_at IS NOT NULL;`,
    ),
  );
  return { googleUsers, kakaoUsers, googlePending, googleActivated };
}

function recoveryLeaksSecrets(json: Record<string, unknown>): boolean {
  const blob = JSON.stringify(json);
  return (
    "email" in json ||
    "identities" in json ||
    "identity_data" in json ||
    "provider_id" in json ||
    "access_token" in json ||
    "refresh_token" in json ||
    blob.includes("@") ||
    /provider_id|identity_data|access_token|refresh_token/.test(blob)
  );
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

function insertIdentitySql(userId: string, provider: "google" | "kakao", mode: "provider_id" | "legacy_id"): string {
  const sub = randomUUID();
  if (mode === "legacy_id") {
    return `INSERT INTO auth.identities (
        id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
      ) VALUES (
        '${sub}',
        '${userId}'::uuid,
        jsonb_build_object('sub', '${sub}', 'email_verified', true),
        '${provider}',
        now(),
        now(),
        now()
      );`;
  }
  return `INSERT INTO auth.identities (
      id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      '${sub}',
      '${userId}'::uuid,
      jsonb_build_object('sub', '${sub}', 'email_verified', true),
      '${provider}',
      now(),
      now(),
      now()
    );`;
}

function insertFixtureIdentity(dbUrl: string, userId: string, provider: "google" | "kakao"): void {
  try {
    dbQuerySql(dbUrl, insertIdentitySql(userId, provider, "provider_id"));
  } catch {
    dbQuerySql(dbUrl, insertIdentitySql(userId, provider, "legacy_id"));
  }
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
  if (!isUsableSupabaseDbUrl(dbUrlRaw)) throw new Error("PAYMENT_TEST_DB_URL missing");
  const classified = classifyPostgresConnection(dbUrlRaw);
  if (classified.isProductionRef || classified.ref !== PAYMENT_TEST_REF) {
    throw new Error("PAYMENT_TEST_DB_URL is not payment-test");
  }
  assert("target db is payment-test not production", classified.ref === PAYMENT_TEST_REF);

  const supabaseUrl = apiEnv.VITE_SUPABASE_URL;
  const anonKey = apiEnv.VITE_SUPABASE_ANON_KEY;
  const serviceKey = apiEnv.SUPABASE_SERVICE_ROLE_KEY;
  const pepper = apiEnv.OTP_PEPPER;
  const identityKey = apiEnv.PHONE_IDENTITY_KEY;
  if (!supabaseUrl.includes(PAYMENT_TEST_REF) || supabaseUrl.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error("VITE_SUPABASE_URL is not payment-test");
  }
  assert("target api is payment-test not production", true);
  assert("dev-capture gate still payment-test only", isPaymentTestDevCaptureEnv(apiEnv) === true);

  const handlerSrc = fs.readFileSync(path.join(root, "src/lib/passwordAuthHandlers.ts"), "utf8");
  const accountSrc = fs.readFileSync(path.join(root, "src/lib/accountKind.ts"), "utf8");
  const loginModal = fs.readFileSync(path.join(root, "src/components/LoginModal.tsx"), "utf8");
  const headerSrc = fs.readFileSync(path.join(root, "src/components/Header.tsx"), "utf8");
  assert(
    "recovery resolve returns linked_providers from identities helper",
    handlerSrc.includes("linked_providers: userId ? classification.linkedProviders : []") &&
      handlerSrc.includes("customerVisibleLinkedProviders(identityProviders)") &&
      accountSrc.includes("REAL `auth.identities`") &&
      !handlerSrc.includes("identity_data") &&
      !accountSrc.includes("ml-prefix"),
  );
  assert(
    "A3 already consumes trusted linked_providers",
    loginModal.includes("readLinkedProviders(resolved.json.linked_providers)"),
  );
  assert(
    "Header member chrome still usable-member gated",
    headerSrc.includes("isUsableMemberProfile(profile)") && headerSrc.includes("hasMemberChrome"),
  );

  assert(
    "linked_providers allow-list drops email/naver and keeps google/kakao order",
    JSON.stringify(customerVisibleLinkedProviders(["email", "kakao", "naver", "google", "google"])) ===
      JSON.stringify(["google", "kakao"]) &&
      customerVisibleLinkedProviders([]).length === 0 &&
      customerVisibleLinkedProviders(["email"]).length === 0,
  );

  const generated = generateInternalSocialUsername();
  const socialClass = classifyAccount({
    userCustomId: generated,
    passwordLoginEnabled: false,
    socialLoginEnabled: true,
    providers: ["google"],
    authEmail: "user@gmail.com",
  });
  const passwordClass = classifyAccount({
    userCustomId: "alice",
    passwordLoginEnabled: true,
    socialLoginEnabled: false,
  });
  assert(
    "social-only never exposes ml username; flags beat email/ml",
    socialClass.kind === "social" &&
      socialClass.recoverableUsername === null &&
      !socialClass.passwordResetAllowed &&
      passwordClass.kind === "password" &&
      passwordClass.recoverableUsername === "alice" &&
      GENERATED_SOCIAL_USERNAME_RE.test(generated),
  );
  assert(
    "password policy min is 8",
    MEMBER_PASSWORD_MIN_LEN === 8 &&
      memberPasswordError("1234567") !== null &&
      memberPasswordError("12345678") === null,
  );

  const dbUrl = encodeDbUrl(dbUrlRaw);
  const liveBefore = countLive(dbUrl);
  const { googleUsers, kakaoUsers, googlePending, googleActivated } = liveBefore;
  console.log(
    `live_google_users=${googleUsers} live_google_pending=${googlePending} live_google_activated=${googleActivated} live_kakao_users=${kakaoUsers}`,
  );
  assert("live Google identity exists on payment-test", googleUsers === 1);
  assert(
    "live Google member is activated (completed C1 lifecycle)",
    googlePending === 0 && googleActivated === 1,
  );

  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const supabasePublic = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const suffix = randomBytes(3).toString("hex");
  const password = `Aa1!${randomBytes(8).toString("base64url")}xx`;
  const trustedName = `c13p${suffix}`;

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
  registerSocialAuthRoutes(app, {
    supabaseAdmin,
    supabasePublic,
    getEnv: () => apiEnv,
  });
  const server: http.Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("listen failed");
  const base = `http://127.0.0.1:${address.port}`;

  try {
    const phone = `01077${String(2000 + (parseInt(suffix.slice(0, 4), 16) % 7000)).padStart(4, "0")}11`;
    const send = await postJson(base, "/api/auth/otp/send", { purpose: "signup", phone });
    const otp = adapter.peekForTests()?.otp ?? "";
    const verify = await postJson(base, "/api/auth/otp/verify", { purpose: "signup", phone, code: otp });
    const proof = typeof verify.json.proof_token === "string" ? verify.json.proof_token : "";
    const tooShort = await postJson(base, "/api/auth/signup/complete", {
      proof_token: proof,
      username: trustedName,
      password: "1234567",
      full_name: "홍길동",
      consents: { terms: true, privacy: true, cookie: true },
    });
    assert("password min 7 rejected", tooShort.status === 400);

    const complete = await postJson(base, "/api/auth/signup/complete", {
      proof_token: proof,
      username: trustedName,
      password,
      full_name: "홍길동",
      consents: { terms: true, privacy: true, cookie: true },
    });
    assert("trusted password signup complete PASS", send.status === 200 && complete.status === 200);

    const trustedProfile = await supabaseAdmin
      .from("profiles")
      .select(
        "id, user_custom_id, verified_phone_fingerprint, phone_verified_at, password_login_enabled, social_login_enabled",
      )
      .eq("user_custom_id", trustedName)
      .maybeSingle();
    if (trustedProfile.data?.id) createdUserIds.push(trustedProfile.data.id);
    assert(
      "password flags true/false and usable",
      trustedProfile.data?.password_login_enabled === true &&
        trustedProfile.data?.social_login_enabled === false &&
        isUsableMemberProfile(trustedProfile.data),
    );

    const login = await supabasePublic.auth.signInWithPassword({
      email: memberAuthEmail(trustedName),
      password,
    });
    assert("password login PASS", !login.error && !!login.data.session);

    const taken = await postJson(base, "/api/auth/signup/username-check", { username: trustedName });
    const freshName = `c13u${suffix}`;
    const free = await postJson(base, "/api/auth/signup/username-check", { username: freshName });
    assert(
      "username availability path PASS",
      taken.status === 200 &&
        taken.json.available === false &&
        free.status === 200 &&
        free.json.available === true,
    );

    const preOtp = await postJson(base, "/api/auth/recovery/resolve", { proof_token: "a".repeat(64) });
    assert(
      "linked_providers withheld before valid recovery proof",
      preOtp.status === 400 && !("linked_providers" in preOtp.json) && !("account_kind" in preOtp.json),
    );

    const recoverySend = await postJson(base, "/api/auth/otp/send", { purpose: "recovery", phone });
    const recoveryOtp = adapter.peekForTests()?.otp ?? "";
    const recoveryVerify = await postJson(base, "/api/auth/otp/verify", {
      purpose: "recovery",
      phone,
      code: recoveryOtp,
    });
    const recoveryProof =
      typeof recoveryVerify.json.proof_token === "string" ? recoveryVerify.json.proof_token : "";
    const recovery = await postJson(base, "/api/auth/recovery/resolve", { proof_token: recoveryProof });
    const passwordProviders = Array.isArray(recovery.json.linked_providers)
      ? recovery.json.linked_providers
      : null;
    assert(
      "password recovery: reset allowed, username returned, linked_providers []",
      recovery.status === 200 &&
        recovery.json.password_reset_allowed === true &&
        recovery.json.recoverable_username === trustedName &&
        Array.isArray(passwordProviders) &&
        passwordProviders.length === 0 &&
        !recoveryLeaksSecrets(recovery.json),
    );

    const reset = await postJson(base, "/api/auth/password-reset", {
      recovery_session_token: recovery.json.recovery_session_token,
      new_password: `${password}Zz`,
    });
    const loginAfterReset = await supabasePublic.auth.signInWithPassword({
      email: memberAuthEmail(trustedName),
      password: `${password}Zz`,
    });
    assert("password recovery/reset PASS", reset.status === 200 && !loginAfterReset.error);

    const pendingCreated = await supabaseAdmin.auth.admin.createUser({
      email: `c13ap${suffix}@example.com`,
      password,
      email_confirm: true,
    });
    if (pendingCreated.data.user?.id) createdUserIds.push(pendingCreated.data.user.id);
    const pendingProfile = await supabaseAdmin
      .from("profiles")
      .select(
        "id, user_custom_id, verified_phone_fingerprint, phone_verified_at, password_login_enabled, social_login_enabled",
      )
      .eq("id", pendingCreated.data.user?.id ?? "")
      .maybeSingle();
    const pendingLogin = await supabasePublic.auth.signInWithPassword({
      email: `c13ap${suffix}@example.com`,
      password,
    });
    const pendingPay = await verifyPaymentMember(
      supabaseAdmin,
      supabasePublic,
      pendingLogin.data.session?.access_token ? `Bearer ${pendingLogin.data.session.access_token}` : undefined,
    );
    assert(
      "pending-shaped profile unusable and payment rejected",
      pendingProfile.data?.user_custom_id == null &&
        pendingProfile.data?.password_login_enabled === false &&
        pendingProfile.data?.social_login_enabled === false &&
        !isUsableMemberProfile(pendingProfile.data) &&
        pendingPay.ok === false,
    );

    const ownerFp =
      typeof trustedProfile.data?.verified_phone_fingerprint === "string"
        ? trustedProfile.data.verified_phone_fingerprint
        : "";
    const ownerE164 = (
      await supabaseAdmin
        .from("profiles")
        .select("verified_phone_e164")
        .eq("id", trustedProfile.data?.id ?? "")
        .maybeSingle()
    ).data?.verified_phone_e164 as string | undefined;
    const collisionToken = randomBytes(32).toString("hex");
    const collisionHmac = otpTicketHmac(pepper, collisionToken);
    if (pendingCreated.data.user?.id && ownerFp && ownerE164) {
      await supabaseAdmin.from("phone_verification_tickets").insert({
        ticket_hmac: collisionHmac,
        purpose: "identity_link",
        phone_fingerprint: ownerFp,
        phone_e164: ownerE164,
        user_id: pendingCreated.data.user.id,
        status: "issued",
        expires_at: new Date(Date.now() + 600_000).toISOString(),
        request_id: randomUUID(),
      });
    }
    const r2 = await supabaseAdmin.rpc("social_activate_pending", {
      p_user_id: pendingCreated.data.user?.id ?? "",
      p_ticket_hmac: collisionHmac,
      p_username: generateInternalSocialUsername(),
    });
    const r2Rpc = (r2.data ?? {}) as { ok?: boolean; reason?: string };
    const pendingAfterR2 = await supabaseAdmin
      .from("profiles")
      .select("user_custom_id, social_login_enabled")
      .eq("id", pendingCreated.data.user?.id ?? "")
      .maybeSingle();
    assert(
      "R2 fixture: phone owned by password member rejects",
      r2Rpc.ok === false &&
        r2Rpc.reason === "phone_already_registered" &&
        pendingAfterR2.data?.user_custom_id == null &&
        pendingAfterR2.data?.social_login_enabled === false,
    );

    const pendingB = await supabaseAdmin.auth.admin.createUser({
      email: `c13ab${suffix}@example.com`,
      password,
      email_confirm: true,
    });
    if (pendingB.data.user?.id) createdUserIds.push(pendingB.data.user.id);
    const socialPhone = `01055${String(1000 + (parseInt(suffix.slice(0, 4), 16) % 8000)).padStart(4, "0")}22`;
    const socialE164 = `+82${socialPhone.slice(1)}`;
    const socialFp = phoneFingerprint(socialE164, identityKey);
    const actToken = randomBytes(32).toString("hex");
    const actHmac = otpTicketHmac(pepper, actToken);
    if (pendingB.data.user?.id) {
      await supabaseAdmin.from("phone_verification_tickets").insert({
        ticket_hmac: actHmac,
        purpose: "identity_link",
        phone_fingerprint: socialFp,
        phone_e164: socialE164,
        user_id: pendingB.data.user.id,
        status: "issued",
        expires_at: new Date(Date.now() + 600_000).toISOString(),
        request_id: randomUUID(),
      });
    }
    const socialName = generateInternalSocialUsername();
    const activate = await supabaseAdmin.rpc("social_activate_pending", {
      p_user_id: pendingB.data.user?.id ?? "",
      p_ticket_hmac: actHmac,
      p_username: socialName,
    });
    const activated = await supabaseAdmin
      .from("profiles")
      .select(
        "id, user_custom_id, verified_phone_fingerprint, phone_verified_at, password_login_enabled, social_login_enabled",
      )
      .eq("id", pendingB.data.user?.id ?? "")
      .maybeSingle();
    const socialLogin = await supabasePublic.auth.signInWithPassword({
      email: `c13ab${suffix}@example.com`,
      password,
    });
    const activatedPay = await verifyPaymentMember(
      supabaseAdmin,
      supabasePublic,
      socialLogin.data.session?.access_token ? `Bearer ${socialLogin.data.session.access_token}` : undefined,
    );
    assert(
      "RPC social-first activation sets social flag, usable, payment PASS",
      (activate.data as { ok?: boolean } | null)?.ok === true &&
        activated.data?.user_custom_id === socialName &&
        activated.data?.password_login_enabled === false &&
        activated.data?.social_login_enabled === true &&
        isUsableMemberProfile(activated.data) &&
        activatedPay.ok === true,
    );

    let identityInsertOk = false;
    if (pendingB.data.user?.id) {
      try {
        insertFixtureIdentity(dbUrl, pendingB.data.user.id, "google");
        insertFixtureIdentity(dbUrl, pendingB.data.user.id, "kakao");
        identityInsertOk = true;
      } catch (err) {
        console.log(`identity_insert=${redact(err instanceof Error ? err.message : "failed")}`);
      }
    }

    const socialSend = await postJson(base, "/api/auth/otp/send", { purpose: "recovery", phone: socialPhone });
    const socialOtp = adapter.peekForTests()?.otp ?? "";
    const socialVerify = await postJson(base, "/api/auth/otp/verify", {
      purpose: "recovery",
      phone: socialPhone,
      code: socialOtp,
    });
    const socialProof =
      typeof socialVerify.json.proof_token === "string" ? socialVerify.json.proof_token : "";
    const socialRecovery = await postJson(base, "/api/auth/recovery/resolve", { proof_token: socialProof });
    const socialProviders = Array.isArray(socialRecovery.json.linked_providers)
      ? (socialRecovery.json.linked_providers as unknown[])
      : [];
    const socialBlob = JSON.stringify(socialRecovery.json);
    assert(
      "social-only recovery: no password reset, no ml username, no secret leak",
      socialSend.status === 200 &&
        socialRecovery.status === 200 &&
        socialRecovery.json.password_reset_allowed === false &&
        socialRecovery.json.recoverable_username == null &&
        socialRecovery.json.account_kind === "social" &&
        !socialBlob.includes(socialName) &&
        !recoveryLeaksSecrets(socialRecovery.json),
    );
    assert(
      "social-only recovery linked_providers from real identities",
      identityInsertOk &&
        socialProviders.length === 2 &&
        socialProviders[0] === "google" &&
        socialProviders[1] === "kakao",
    );

    const trustedPay = await verifyPaymentMember(
      supabaseAdmin,
      supabasePublic,
      loginAfterReset.data.session?.access_token
        ? `Bearer ${loginAfterReset.data.session.access_token}`
        : undefined,
    );
    assert("usable password member payment gate PASS", trustedPay.ok === true);

    const rawSignUp = await supabasePublic.auth.signUp({
      email: memberAuthEmail(`c13ar${suffix}`),
      password,
    });
    assert(
      "public password signUp remains 403",
      (rawSignUp.error as { status?: number } | null)?.status === 403 && !rawSignUp.data.user,
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    for (const id of [...new Set(createdUserIds)]) {
      await supabaseAdmin.auth.admin.deleteUser(id);
    }
  }

  const liveAfter = countLive(dbUrl);
  assert(
    "live Google/Kakao lifecycle preserved after fixture cleanup",
    liveAfter.googleUsers === googleUsers &&
      liveAfter.googlePending === googlePending &&
      liveAfter.googleActivated === googleActivated &&
      liveAfter.kakaoUsers === kakaoUsers,
  );

  const failed = results.filter((item) => !item.pass);
  console.log(`RESULT ${failed.length === 0 ? "PASS" : "FAIL"} ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? redact(err.message) : "verify failed");
  process.exit(1);
});
