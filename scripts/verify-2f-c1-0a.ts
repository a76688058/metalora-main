/**
 * NEW 2F C1-0A payment-test social backend foundation.
 * Applies capability migration. Creates/deletes payment-test Auth users.
 * Never prints secrets, OTP, e164, fingerprints, or DB URIs.
 * Does not enable Google/Kakao. Does not touch production.
 */
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import { classifyAccount } from "../src/lib/accountKind";
import {
  PROFILE_COLUMNS,
  USABLE_MEMBER_PROFILE_COLUMNS,
  isUsableMemberProfile,
} from "../src/lib/authIntegrity";
import { generateInternalSocialUsername } from "../src/lib/internalSocialUsername";
import {
  GENERATED_SOCIAL_USERNAME_RE,
  MEMBER_USERNAME_RE,
  memberAuthEmail,
} from "../src/lib/memberUsername";
import { registerOtpAuthRoutes } from "../src/lib/otpAuthHandlers";
import { otpTicketHmac } from "../src/lib/otpCrypto";
import { registerPasswordAuthRoutes } from "../src/lib/passwordAuthHandlers";
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
const MIGRATION = path.join(root, "supabase/migrations/20260928160000_2f_c1_0a_login_capability.sql");
const HOOK_SQL = path.join(root, "scripts/sql/payment-test-2f-b2b-before-user-created.sql");

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

function splitSqlStatements(sql: string): string[] {
  const stmts: string[] = [];
  let buf = "";
  let i = 0;
  let inSingle = false;
  let dollar: string | null = null;
  while (i < sql.length) {
    const ch = sql[i]!;
    if (dollar) {
      if (sql.startsWith(dollar, i)) {
        buf += dollar;
        i += dollar.length;
        dollar = null;
        continue;
      }
      buf += ch;
      i += 1;
      continue;
    }
    if (inSingle) {
      buf += ch;
      if (ch === "'" && sql[i + 1] === "'") {
        buf += sql[i + 1];
        i += 2;
        continue;
      }
      if (ch === "'") inSingle = false;
      i += 1;
      continue;
    }
    if (ch === "-" && sql[i + 1] === "-") {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? sql.length : nl;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      buf += ch;
      i += 1;
      continue;
    }
    if (ch === "$") {
      const tag = sql.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
      if (tag) {
        dollar = tag[0];
        buf += dollar;
        i += dollar.length;
        continue;
      }
    }
    if (ch === ";") {
      const stmt = buf.trim();
      if (stmt && !/^(BEGIN|COMMIT)$/i.test(stmt)) stmts.push(stmt);
      buf = "";
      i += 1;
      continue;
    }
    buf += ch;
    i += 1;
  }
  const tail = buf.trim();
  if (tail && !/^(BEGIN|COMMIT)$/i.test(tail)) stmts.push(tail);
  return stmts;
}

function dbQueryOne(dbUrl: string, filePath: string): string {
  const npxCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");
  const result = fs.existsSync(npxCli)
    ? spawnSync(
        process.execPath,
        [npxCli, "--yes", "supabase", "db", "query", "--db-url", dbUrl, "--file", filePath],
        { encoding: "utf8", maxBuffer: 10_000_000, windowsHide: true, env: process.env },
      )
    : spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", [
        "--yes",
        "supabase",
        "db",
        "query",
        "--db-url",
        dbUrl,
        "--file",
        filePath,
      ], {
        encoding: "utf8",
        maxBuffer: 10_000_000,
        windowsHide: true,
        shell: process.platform === "win32",
        env: process.env,
      });
  if (result.status !== 0) {
    throw new Error(redact(result.stderr || result.stdout || "db query failed"));
  }
  return result.stdout ?? "";
}

function dbQueryFile(dbUrl: string, filePath: string): string {
  const statements = splitSqlStatements(fs.readFileSync(filePath, "utf8"));
  let combined = "";
  for (let i = 0; i < statements.length; i += 1) {
    const stmt = statements[i]!;
    console.log(`SQL ${i + 1}/${statements.length} ${stmt.split(/\s+/).slice(0, 6).join(" ")}`);
    const tmp = path.join(os.tmpdir(), `metalora-c10a-${randomBytes(6).toString("hex")}.sql`);
    fs.writeFileSync(tmp, `${stmt};`, "utf8");
    try {
      combined += dbQueryOne(dbUrl, tmp);
    } finally {
      fs.unlinkSync(tmp);
    }
  }
  return combined;
}

function dbQuerySql(dbUrl: string, sql: string): string {
  const tmp = path.join(os.tmpdir(), `metalora-c10a-${randomBytes(8).toString("hex")}.sql`);
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
  const dbUrl = encodeDbUrl(dbUrlRaw);

  const supabaseUrl = apiEnv.VITE_SUPABASE_URL;
  const anonKey = apiEnv.VITE_SUPABASE_ANON_KEY;
  const serviceKey = apiEnv.SUPABASE_SERVICE_ROLE_KEY;
  const pepper = apiEnv.OTP_PEPPER;
  const identityKey = apiEnv.PHONE_IDENTITY_KEY;
  if (!supabaseUrl.includes(PAYMENT_TEST_REF) || supabaseUrl.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error("VITE_SUPABASE_URL is not payment-test");
  }
  assert("target api is payment-test not production", true);

  const generated = generateInternalSocialUsername();
  assert(
    "internal username is ml + 10 lowercase alphanumeric",
    generated.length === 12 &&
      GENERATED_SOCIAL_USERNAME_RE.test(generated) &&
      MEMBER_USERNAME_RE.test(generated),
  );

  const flagPassword = classifyAccount({
    userCustomId: "alice",
    passwordLoginEnabled: true,
    socialLoginEnabled: false,
  });
  const flagSocial = classifyAccount({
    userCustomId: generated,
    passwordLoginEnabled: false,
    socialLoginEnabled: true,
  });
  const flagLinked = classifyAccount({
    userCustomId: generated,
    passwordLoginEnabled: true,
    socialLoginEnabled: true,
  });
  assert(
    "capability flags drive recovery outcomes",
    flagPassword.kind === "password" &&
      flagPassword.passwordResetAllowed &&
      flagPassword.recoverableUsername === "alice" &&
      flagSocial.kind === "social" &&
      !flagSocial.passwordResetAllowed &&
      flagSocial.recoverableUsername === null &&
      flagLinked.kind === "password" &&
      flagLinked.passwordResetAllowed &&
      flagLinked.recoverableUsername === null,
  );

  const integritySrc = fs.readFileSync(path.join(root, "src/lib/authIntegrity.ts"), "utf8");
  const paymentSrc = fs.readFileSync(path.join(root, "src/lib/paymentMemberAuth.ts"), "utf8");
  const hookSrc = fs.readFileSync(HOOK_SQL, "utf8");
  const socialSrc = fs.readFileSync(path.join(root, "src/lib/socialAuthHandlers.ts"), "utf8");
  const usableFn = integritySrc.slice(
    integritySrc.indexOf("export function isUsableMemberProfile"),
    integritySrc.indexOf("export const C1_SOCIAL_PROVIDERS"),
  );
  assert(
    "J usable-member gate UNCHANGED",
    PROFILE_COLUMNS.includes("password_login_enabled") &&
      PROFILE_COLUMNS.includes("social_login_enabled") &&
      USABLE_MEMBER_PROFILE_COLUMNS ===
        "id, user_custom_id, verified_phone_fingerprint, phone_verified_at" &&
      !USABLE_MEMBER_PROFILE_COLUMNS.includes("social_login_enabled") &&
      !USABLE_MEMBER_PROFILE_COLUMNS.includes("password_login_enabled") &&
      usableFn.includes("user_custom_id") &&
      usableFn.includes("verified_phone_fingerprint") &&
      usableFn.includes("phone_verified_at") &&
      !usableFn.includes("social_login_enabled") &&
      !usableFn.includes("password_login_enabled") &&
      isUsableMemberProfile({
        id: "00000000-0000-0000-0000-000000000001",
        user_custom_id: "alice",
        verified_phone_fingerprint: "b".repeat(64),
        phone_verified_at: "2026-09-28T00:00:00.000Z",
      }) === true &&
      isUsableMemberProfile({
        id: "00000000-0000-0000-0000-000000000001",
        user_custom_id: null,
        verified_phone_fingerprint: "b".repeat(64),
        phone_verified_at: "2026-09-28T00:00:00.000Z",
      }) === false,
  );
  assert(
    "L payment helper still usable-member only",
    paymentSrc.includes("isUsableMemberProfile") && !paymentSrc.includes("social_login_enabled"),
  );
  assert(
    "hook still rejects email and allows google/kakao/custom:naver",
    hookSrc.includes("provider = 'email'") &&
      hookSrc.includes("provider = 'google'") &&
      hookSrc.includes("provider = 'kakao'") &&
      hookSrc.includes("provider = 'custom:naver'") &&
      hookSrc.includes("RETURN '{}'::jsonb") &&
      !hookSrc.toLowerCase().includes("disable_signup"),
  );
  assert("live OAuth activation HTTP proof deferred", socialSrc.includes("isC1SocialIdentityUser"));
  assert("dev-capture gate still payment-test only", isPaymentTestDevCaptureEnv(apiEnv) === true);

  const beforeEligible = parseCount(
    dbQuerySql(
      dbUrl,
      `SELECT count(*)::int AS n
       FROM public.profiles p
       JOIN auth.users u ON u.id = p.id
       WHERE p.user_custom_id IS NOT NULL AND btrim(p.user_custom_id) <> ''
         AND lower(coalesce(u.email, '')) LIKE '%@metalora.me'
         AND EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email')`,
    ),
  );
  const beforeNullAdmin = parseCount(
    dbQuerySql(
      dbUrl,
      `SELECT count(*)::int AS n
       FROM public.profiles p
       JOIN auth.users u ON u.id = p.id
       WHERE (p.user_custom_id IS NULL OR btrim(p.user_custom_id) = '')
         AND lower(coalesce(u.email, '')) LIKE '%@metalora.me'`,
    ),
  );
  console.log(`backfill_eligible_before=${beforeEligible} metalora_blank_username=${beforeNullAdmin}`);

  console.log("APPLY payment-test C1-0A capability migration");
  dbQueryFile(dbUrl, MIGRATION);

  const afterEnabled = parseCount(
    dbQuerySql(dbUrl, `SELECT count(*)::int AS n FROM public.profiles WHERE password_login_enabled = true`),
  );
  const afterBlankStillOff = parseCount(
    dbQuerySql(
      dbUrl,
      `SELECT count(*)::int AS n
       FROM public.profiles p
       JOIN auth.users u ON u.id = p.id
       WHERE password_login_enabled = true
         AND (p.user_custom_id IS NULL OR btrim(p.user_custom_id) = '')`,
    ),
  );
  console.log(`password_login_enabled_after=${afterEnabled} blank_username_marked=${afterBlankStillOff}`);
  assert("backfill marked eligible password identities", beforeEligible >= 0 && afterEnabled >= beforeEligible);
  assert("backfill did not mark blank-username metalora rows", afterBlankStillOff === 0);

  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const supabasePublic = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const suffix = randomBytes(3).toString("hex");
  const password = `Aa1!${randomBytes(8).toString("base64url")}xx`;
  const trustedName = `c10a${suffix}`;

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
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("listen failed");
  const base = `http://127.0.0.1:${addr.port}`;

  await supabaseAdmin.from("auth_rate_limits").delete().in("scope", [
    "otp_send_ip",
    "otp_send_phone",
    "otp_verify_ip",
    "signup_complete_ip",
    "signup_complete_ticket",
    "signup_complete_fingerprint",
    "signup_username_check_ip",
    "social_complete_ip",
    "recovery_resolve_ip",
  ]);

  try {
    const phone = `01066${String(2000 + (parseInt(suffix.slice(0, 4), 16) % 7000)).padStart(4, "0")}11`;
    const send = await postJson(base, "/api/auth/otp/send", { purpose: "signup", phone });
    const otp = adapter.peekForTests()?.otp ?? "";
    const verify = await postJson(base, "/api/auth/otp/verify", { purpose: "signup", phone, code: otp });
    const proof = typeof verify.json.proof_token === "string" ? verify.json.proof_token : "";
    const complete = await postJson(base, "/api/auth/signup/complete", {
      proof_token: proof,
      username: trustedName,
      password,
      full_name: "홍길동",
      consents: { terms: true, privacy: true, cookie: true },
    });
    assert("A trusted signup complete PASS", send.status === 200 && complete.status === 200);

    const trustedProfile = await supabaseAdmin
      .from("profiles")
      .select(
        "id, user_custom_id, verified_phone_fingerprint, phone_verified_at, password_login_enabled, social_login_enabled",
      )
      .eq("user_custom_id", trustedName)
      .maybeSingle();
    if (trustedProfile.data?.id) createdUserIds.push(trustedProfile.data.id);
    assert(
      "A password_login_enabled true social false and usable",
      trustedProfile.data?.password_login_enabled === true &&
        trustedProfile.data?.social_login_enabled === false &&
        isUsableMemberProfile(trustedProfile.data),
    );

    const login = await supabasePublic.auth.signInWithPassword({
      email: memberAuthEmail(trustedName),
      password,
    });
    assert("B existing password login PASS", !login.error && !!login.data.session);

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
    assert(
      "J password recovery path PASS",
      recoverySend.status === 200 &&
        recovery.status === 200 &&
        recovery.json.password_reset_allowed === true &&
        recovery.json.recoverable_username === trustedName,
    );

    const pendingCreated = await supabaseAdmin.auth.admin.createUser({
      email: `c10ap${suffix}@example.com`,
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
      email: `c10ap${suffix}@example.com`,
      password,
    });
    const pendingToken = pendingLogin.data.session?.access_token ?? "";
    const pendingPay = await verifyPaymentMember(
      supabaseAdmin,
      supabasePublic,
      pendingToken ? `Bearer ${pendingToken}` : undefined,
    );
    assert(
      "C pending-social-shaped profile unusable and payment rejected",
      !pendingCreated.error &&
        pendingProfile.data?.user_custom_id == null &&
        pendingProfile.data?.password_login_enabled === false &&
        pendingProfile.data?.social_login_enabled === false &&
        !isUsableMemberProfile(pendingProfile.data) &&
        pendingPay.ok === false,
    );

    const noBearer = await postJson(base, "/api/auth/social/complete", {
      proof_token: randomBytes(32).toString("hex"),
      consents: { terms: true, privacy: true, cookie: true },
    });
    assert("D social complete without bearer rejected", noBearer.status === 401);

    const passwordSocial = await postJson(
      base,
      "/api/auth/social/complete",
      {
        proof_token: randomBytes(32).toString("hex"),
        consents: { terms: true, privacy: true, cookie: true },
      },
      login.data.session?.access_token,
    );
    assert("E social complete without social identity rejected", passwordSocial.status === 400);

    const badProof = await postJson(
      base,
      "/api/auth/social/complete",
      {
        proof_token: randomBytes(32).toString("hex"),
        consents: { terms: true, privacy: true, cookie: true },
      },
      pendingToken,
    );
    assert("F pending HTTP social complete without google/kakao identity rejected", badProof.status === 400);

    const ownerFp = typeof trustedProfile.data?.verified_phone_fingerprint === "string"
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
    const invalidProof = await supabaseAdmin.rpc("social_activate_pending", {
      p_user_id: pendingCreated.data.user?.id ?? "",
      p_ticket_hmac: randomBytes(32).toString("hex"),
      p_username: generateInternalSocialUsername(),
    });
    const invalidRpc = (invalidProof.data ?? {}) as { ok?: boolean; reason?: string };
    assert(
      "F RPC invalid identity_link proof rejected",
      invalidRpc.ok === false && invalidRpc.reason === "invalid",
    );

    const r2 = await supabaseAdmin.rpc("social_activate_pending", {
      p_user_id: pendingCreated.data.user?.id ?? "",
      p_ticket_hmac: collisionHmac,
      p_username: generateInternalSocialUsername(),
    });
    const r2Rpc = (r2.data ?? {}) as { ok?: boolean; reason?: string };
    const pendingAfterR2 = await supabaseAdmin
      .from("profiles")
      .select("user_custom_id, social_login_enabled, verified_phone_fingerprint")
      .eq("id", pendingCreated.data.user?.id ?? "")
      .maybeSingle();
    const ownerAfterR2 = await supabaseAdmin
      .from("profiles")
      .select("user_custom_id, verified_phone_fingerprint")
      .eq("id", trustedProfile.data?.id ?? "")
      .maybeSingle();
    assert(
      "G R2 phone collision rejects and leaves owner/pending unchanged",
      r2Rpc.ok === false &&
        r2Rpc.reason === "phone_already_registered" &&
        pendingAfterR2.data?.user_custom_id == null &&
        pendingAfterR2.data?.social_login_enabled === false &&
        ownerAfterR2.data?.user_custom_id === trustedName,
    );

    const pendingB = await supabaseAdmin.auth.admin.createUser({
      email: `c10ab${suffix}@example.com`,
      password,
      email_confirm: true,
    });
    if (pendingB.data.user?.id) createdUserIds.push(pendingB.data.user.id);
    const freePhone = `01055${String(1000 + (parseInt(suffix.slice(0, 4), 16) % 8000)).padStart(4, "0")}22`;
    const freeE164 = `+82${freePhone.slice(1)}`;
    const freeFp = phoneFingerprint(freeE164, identityKey);
    const actToken = randomBytes(32).toString("hex");
    const actHmac = otpTicketHmac(pepper, actToken);
    if (pendingB.data.user?.id) {
      await supabaseAdmin.from("phone_verification_tickets").insert({
        ticket_hmac: actHmac,
        purpose: "identity_link",
        phone_fingerprint: freeFp,
        phone_e164: freeE164,
        user_id: pendingB.data.user.id,
        status: "issued",
        expires_at: new Date(Date.now() + 600_000).toISOString(),
        request_id: randomUUID(),
      });
    }
    const generatedName = generateInternalSocialUsername();
    const activate = await supabaseAdmin.rpc("social_activate_pending", {
      p_user_id: pendingB.data.user?.id ?? "",
      p_ticket_hmac: actHmac,
      p_username: generatedName,
    });
    const activateRpc = (activate.data ?? {}) as { ok?: boolean; already_complete?: boolean };
    const activated = await supabaseAdmin
      .from("profiles")
      .select(
        "id, user_custom_id, verified_phone_fingerprint, phone_verified_at, password_login_enabled, social_login_enabled",
      )
      .eq("id", pendingB.data.user?.id ?? "")
      .maybeSingle();
    assert(
      "H RPC social-first activation PASS (live OAuth HTTP deferred)",
      activateRpc.ok === true &&
        activateRpc.already_complete !== true &&
        activated.data?.user_custom_id === generatedName &&
        GENERATED_SOCIAL_USERNAME_RE.test(activated.data?.user_custom_id ?? "") &&
        activated.data?.password_login_enabled === false &&
        activated.data?.social_login_enabled === true &&
        isUsableMemberProfile(activated.data),
    );

    const already = await supabaseAdmin.rpc("social_activate_pending", {
      p_user_id: pendingB.data.user?.id ?? "",
      p_ticket_hmac: actHmac,
      p_username: generateInternalSocialUsername(),
    });
    const alreadyRpc = (already.data ?? {}) as { ok?: boolean; already_complete?: boolean };
    const afterAlready = await supabaseAdmin
      .from("profiles")
      .select("user_custom_id, verified_phone_fingerprint")
      .eq("id", pendingB.data.user?.id ?? "")
      .maybeSingle();
    assert(
      "already-active social RPC does not mint a second username",
      alreadyRpc.ok === true &&
        alreadyRpc.already_complete === true &&
        afterAlready.data?.user_custom_id === generatedName,
    );

    const pendingC = await supabaseAdmin.auth.admin.createUser({
      email: `c10ac${suffix}@example.com`,
      password,
      email_confirm: true,
    });
    const pendingD = await supabaseAdmin.auth.admin.createUser({
      email: `c10ad${suffix}@example.com`,
      password,
      email_confirm: true,
    });
    if (pendingC.data.user?.id) createdUserIds.push(pendingC.data.user.id);
    if (pendingD.data.user?.id) createdUserIds.push(pendingD.data.user.id);
    const racePhone = `01044${String(3000 + (parseInt(suffix.slice(0, 4), 16) % 6000)).padStart(4, "0")}33`;
    const raceE164 = `+82${racePhone.slice(1)}`;
    const raceFp = phoneFingerprint(raceE164, identityKey);
    const hmacC = otpTicketHmac(pepper, randomBytes(32).toString("hex"));
    const hmacD = otpTicketHmac(pepper, randomBytes(32).toString("hex"));
    if (pendingC.data.user?.id && pendingD.data.user?.id) {
      await supabaseAdmin.from("phone_verification_tickets").insert([
        {
          ticket_hmac: hmacC,
          purpose: "identity_link",
          phone_fingerprint: raceFp,
          phone_e164: raceE164,
          user_id: pendingC.data.user.id,
          status: "issued",
          expires_at: new Date(Date.now() + 600_000).toISOString(),
          request_id: randomUUID(),
        },
        {
          ticket_hmac: hmacD,
          purpose: "identity_link",
          phone_fingerprint: raceFp,
          phone_e164: raceE164,
          user_id: pendingD.data.user.id,
          status: "issued",
          expires_at: new Date(Date.now() + 600_000).toISOString(),
          request_id: randomUUID(),
        },
      ]);
    }
    const [race1, race2] = await Promise.all([
      supabaseAdmin.rpc("social_activate_pending", {
        p_user_id: pendingC.data.user?.id ?? "",
        p_ticket_hmac: hmacC,
        p_username: generateInternalSocialUsername(),
      }),
      supabaseAdmin.rpc("social_activate_pending", {
        p_user_id: pendingD.data.user?.id ?? "",
        p_ticket_hmac: hmacD,
        p_username: generateInternalSocialUsername(),
      }),
    ]);
    const okCount = [race1.data, race2.data].filter((row) => (row as { ok?: boolean } | null)?.ok === true).length;
    const owners = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("verified_phone_fingerprint", raceFp);
    assert("I concurrent same-phone activation at most one owner", okCount === 1 && (owners.data ?? []).length === 1);

    const rawSignUp = await supabasePublic.auth.signUp({
      email: memberAuthEmail(`c10ar${suffix}`),
      password,
    });
    assert(
      "K public password signUp remains 403",
      (rawSignUp.error as { status?: number } | null)?.status === 403 && !rawSignUp.data.user,
    );

    const reused = await supabaseAdmin.rpc("social_activate_pending", {
      p_user_id: pendingB.data.user?.id ?? "",
      p_ticket_hmac: actHmac,
      p_username: generateInternalSocialUsername(),
    });
    const reusedRpc = (reused.data ?? {}) as { ok?: boolean; already_complete?: boolean };
    assert(
      "F reused proof cannot re-bind phone after activation",
      reusedRpc.already_complete === true || reusedRpc.ok === false,
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    for (const id of [...new Set(createdUserIds)]) {
      await supabaseAdmin.auth.admin.deleteUser(id);
    }
  }

  const failed = results.filter((item) => !item.pass);
  console.log(`RESULT ${failed.length === 0 ? "PASS" : "FAIL"} ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? redact(err.message) : "verify failed");
  process.exit(1);
});
