/**
 * NEW 2F C2-1 payment-test Naver trusted backend.
 * Applies Before User Created hardening. Creates/deletes disposable fixtures only.
 * Does not mutate live custom:naver Auth users (activated member + pending
 * Hosted-OAuth identity). Does not touch production.
 */
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { customerVisibleLinkedProviders } from "../src/lib/accountKind";
import { isUsableMemberProfile } from "../src/lib/authIntegrity";
import { GENERATED_SOCIAL_USERNAME_RE, memberAuthEmail } from "../src/lib/memberUsername";
import { registerOtpAuthRoutes } from "../src/lib/otpAuthHandlers";
import { registerPasswordAuthRoutes } from "../src/lib/passwordAuthHandlers";
import { verifyPaymentMember } from "../src/lib/paymentMemberAuth";
import { registerSocialAuthRoutes } from "../src/lib/socialAuthHandlers";
import { DevCaptureSmsAdapter, isPaymentTestDevCaptureEnv } from "../src/lib/smsAdapter";
import { configureExpressTrustProxy } from "../src/lib/trustedClientIp";
import {
  classifyPostgresConnection,
  isUsableSupabaseDbUrl,
  PRODUCTION_SUPABASE_REF,
} from "../src/lib/supabaseHosts";
import { isTrustedSocialIdentityProvider } from "../src/lib/trustedSocialProviders";

const PAYMENT_TEST_REF = "bvihpoorwriejybixmoc";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
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
    let value = trimmed.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[trimmed.slice(0, eq).trim()] = value;
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

function dbQueryOne(dbUrl: string, filePath: string, outputJson: boolean): string {
  const npxCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");
  const args = ["--yes", "supabase", "db", "query", "--db-url", dbUrl, "--file", filePath];
  if (outputJson) args.push("--output-format", "json");
  const result = fs.existsSync(npxCli)
    ? spawnSync(process.execPath, [npxCli, ...args], {
        encoding: "utf8",
        maxBuffer: 10_000_000,
        windowsHide: true,
        env: process.env,
        cwd: root,
      })
    : spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", args, {
        encoding: "utf8",
        maxBuffer: 10_000_000,
        windowsHide: true,
        shell: process.platform === "win32",
        env: process.env,
        cwd: root,
      });
  if (result.status !== 0) {
    throw new Error(redact(`${result.stderr || ""}\n${result.stdout || ""}`.trim() || "db query failed"));
  }
  return result.stdout ?? "";
}

function dbQueryFile(dbUrl: string, filePath: string, outputJson: boolean): string {
  const statements = splitSqlStatements(fs.readFileSync(filePath, "utf8"));
  let combined = "";
  for (let i = 0; i < statements.length; i += 1) {
    const stmt = statements[i]!;
    const tmp = path.join(os.tmpdir(), `metalora-c21-${randomBytes(6).toString("hex")}.sql`);
    fs.writeFileSync(tmp, `${stmt};`, "utf8");
    try {
      combined += dbQueryOne(dbUrl, tmp, outputJson);
    } finally {
      fs.unlinkSync(tmp);
    }
  }
  return combined;
}

function dbQuerySql(dbUrl: string, sql: string, outputJson = true): string {
  const tmp = path.join(os.tmpdir(), `metalora-c21-${randomBytes(8).toString("hex")}.sql`);
  fs.writeFileSync(tmp, sql, "utf8");
  try {
    return dbQueryFile(dbUrl, tmp, outputJson);
  } finally {
    fs.unlinkSync(tmp);
  }
}

function parseCount(raw: string): number {
  try {
    const parsed = JSON.parse(raw.trim()) as { rows?: Array<{ n?: unknown }> };
    const n = parsed.rows?.[0]?.n;
    if (typeof n === "number" && Number.isInteger(n) && n >= 0) return n;
  } catch {
    /* fall through */
  }
  const json = raw.match(/"n"\s*:\s*(\d+)/);
  if (json) return Number(json[1]);
  return -1;
}

function hookAllows(raw: string): boolean {
  const trimmed = raw.replace(/\s+/g, "");
  return trimmed.includes("{}") && !trimmed.includes('"error"');
}

function hookRejects(raw: string): boolean {
  return /"http_code"\s*:\s*403/.test(raw) || /http_code.:403/.test(raw.replace(/\s+/g, ""));
}

function liveNaverUserIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw.trim()) as { rows?: Array<{ user_id?: string }> };
    return (parsed.rows ?? [])
      .map((row) => (typeof row.user_id === "string" ? row.user_id : ""))
      .filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  } catch {
    return [...raw.matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi)].map(
      (m) => m[0],
    );
  }
}

function recoveryLeaksSecrets(json: Record<string, unknown>): boolean {
  const blob = JSON.stringify(json);
  return (
    "identity_data" in json ||
    "provider_id" in json ||
    "access_token" in json ||
    blob.includes("custom:naver") ||
    /identity_data|provider_id|access_token/.test(blob)
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

function insertIdentity(dbUrl: string, userId: string, provider: "google" | "kakao" | "custom:naver"): void {
  const sub = randomUUID();
  const emailVerified = provider === "custom:naver" ? "false" : "true";
  const withProviderId = `INSERT INTO auth.identities (
      id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      '${sub}',
      '${userId}'::uuid,
      jsonb_build_object('sub', '${sub}', 'email_verified', ${emailVerified}),
      '${provider}',
      now(),
      now(),
      now()
    );`;
  try {
    dbQuerySql(dbUrl, withProviderId, false);
  } catch {
    dbQuerySql(
      dbUrl,
      `INSERT INTO auth.identities (
          id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
        ) VALUES (
          '${sub}',
          '${userId}'::uuid,
          jsonb_build_object('sub', '${sub}', 'email_verified', ${emailVerified}),
          '${provider}',
          now(),
          now(),
          now()
        );`,
      false,
    );
  }
}

async function attachTrustedIdentity(
  admin: SupabaseClient,
  dbUrl: string,
  userId: string,
  provider: "google" | "kakao" | "custom:naver",
): Promise<void> {
  insertIdentity(dbUrl, userId, provider);
  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { provider, providers: [provider] },
  });
  if (error) throw new Error("fixture metadata update failed");
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

  const supabaseUrl = apiEnv.VITE_SUPABASE_URL ?? "";
  const anonKey = apiEnv.VITE_SUPABASE_ANON_KEY ?? "";
  const serviceKey = apiEnv.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const pepper = apiEnv.OTP_PEPPER ?? "";
  if (!supabaseUrl.includes(PAYMENT_TEST_REF) || supabaseUrl.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error("VITE_SUPABASE_URL is not payment-test");
  }
  assert("target api is payment-test not production", true);
  assert("dev-capture gate still payment-test only", isPaymentTestDevCaptureEnv(apiEnv) === true);

  const integritySrc = fs.readFileSync(path.join(root, "src/lib/authIntegrity.ts"), "utf8");
  const paymentSrc = fs.readFileSync(path.join(root, "src/lib/paymentMemberAuth.ts"), "utf8");
  const hookSrc = fs.readFileSync(HOOK_SQL, "utf8");
  const socialSrc = fs.readFileSync(path.join(root, "src/lib/socialAuthHandlers.ts"), "utf8");
  assert(
    "G member/payment gates unchanged",
    integritySrc.includes("user_custom_id") &&
      integritySrc.includes("verified_phone_fingerprint") &&
      integritySrc.includes("phone_verified_at") &&
      !paymentSrc.includes("social_login_enabled") &&
      paymentSrc.includes("isUsableMemberProfile"),
  );
  assert(
    "A trusted identity set is explicit google/kakao/custom:naver",
    isTrustedSocialIdentityProvider("google") &&
      isTrustedSocialIdentityProvider("kakao") &&
      isTrustedSocialIdentityProvider("custom:naver") &&
      !isTrustedSocialIdentityProvider("naver") &&
      !isTrustedSocialIdentityProvider("custom:anything") &&
      !isTrustedSocialIdentityProvider("unknown") &&
      socialSrc.includes("isTrustedSocialIdentityProvider") &&
      !hookSrc.includes("LIKE 'custom:"),
  );
  assert(
    "D recovery maps custom:naver → naver and drops bare naver",
    JSON.stringify(customerVisibleLinkedProviders(["email", "kakao", "naver", "google", "custom:naver"])) ===
      JSON.stringify(["google", "kakao", "naver"]) &&
      JSON.stringify(customerVisibleLinkedProviders(["naver"])) === JSON.stringify([]) &&
      JSON.stringify(customerVisibleLinkedProviders(["custom:anything"])) === JSON.stringify([]),
  );

  const dbUrl = encodeDbUrl(dbUrlRaw);
  const liveNaverBeforeRaw = dbQuerySql(
    dbUrl,
    `SELECT user_id FROM auth.identities WHERE provider = 'custom:naver' ORDER BY user_id;`,
  );
  const liveNaverBefore = liveNaverUserIds(liveNaverBeforeRaw);
  assert(
    "live custom:naver identities present (activated + pending)",
    liveNaverBefore.length >= 2,
  );

  console.log("APPLY payment-test Before User Created allow-list");
  dbQueryFile(dbUrl, HOOK_SQL, false);

  const probes: Array<[string, string, "allow" | "reject"]> = [
    ["email", '{"user":{"is_anonymous":false,"app_metadata":{"provider":"email"}}}', "reject"],
    ["empty", '{"user":{"is_anonymous":false,"app_metadata":{"provider":""}}}', "reject"],
    ["anonymous", '{"user":{"is_anonymous":true,"app_metadata":{"provider":"google"}}}', "reject"],
    ["google", '{"user":{"is_anonymous":false,"app_metadata":{"provider":"google"}}}', "allow"],
    ["kakao", '{"user":{"is_anonymous":false,"app_metadata":{"provider":"kakao"}}}', "allow"],
    ["custom:naver", '{"user":{"is_anonymous":false,"app_metadata":{"provider":"custom:naver"}}}', "allow"],
    ["naver", '{"user":{"is_anonymous":false,"app_metadata":{"provider":"naver"}}}', "reject"],
    ["custom:anything", '{"user":{"is_anonymous":false,"app_metadata":{"provider":"custom:anything"}}}', "reject"],
    ["unknown-provider", '{"user":{"is_anonymous":false,"app_metadata":{"provider":"unknown-provider"}}}', "reject"],
  ];
  for (const [label, payload, expected] of probes) {
    const raw = dbQuerySql(dbUrl, `SELECT public.hook_before_user_created('${payload}'::jsonb);`);
    const pass = expected === "allow" ? hookAllows(raw) : hookRejects(raw);
    assert(`A hook ${label} ${expected.toUpperCase()}`, pass);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const supabasePublic = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const suffix = randomBytes(3).toString("hex");
  const password = `Aa1!${randomBytes(8).toString("base64url")}xx`;
  const trustedName = `c21p${suffix}`;
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
    "social_complete_ip",
    "recovery_resolve_ip",
  ]);

  try {
    const ownerPhone = `01077${String(2000 + (parseInt(suffix.slice(0, 4), 16) % 7000)).padStart(4, "0")}11`;
    const send = await postJson(base, "/api/auth/otp/send", { purpose: "signup", phone: ownerPhone });
    const otp = adapter.peekForTests()?.otp ?? "";
    const verify = await postJson(base, "/api/auth/otp/verify", { purpose: "signup", phone: ownerPhone, code: otp });
    const proof = typeof verify.json.proof_token === "string" ? verify.json.proof_token : "";
    const complete = await postJson(base, "/api/auth/signup/complete", {
      proof_token: proof,
      username: trustedName,
      password,
      full_name: "홍길동",
      consents: { terms: true, privacy: true, cookie: true },
    });
    assert("password fixture signup PASS", send.status === 200 && complete.status === 200);
    const ownerProfile = await supabaseAdmin
      .from("profiles")
      .select("id, user_custom_id, verified_phone_fingerprint")
      .eq("user_custom_id", trustedName)
      .maybeSingle();
    if (ownerProfile.data?.id) createdUserIds.push(ownerProfile.data.id);

    const pending = await supabaseAdmin.auth.admin.createUser({
      email: `c21an${suffix}@example.com`,
      password,
      email_confirm: true,
    });
    if (pending.data.user?.id) createdUserIds.push(pending.data.user.id);
    if (pending.data.user?.id) {
      await attachTrustedIdentity(supabaseAdmin, dbUrl, pending.data.user.id, "custom:naver");
    }
    const pendingLogin = await supabasePublic.auth.signInWithPassword({
      email: `c21an${suffix}@example.com`,
      password,
    });
    const pendingToken = pendingLogin.data.session?.access_token ?? "";
    const pendingPay = await verifyPaymentMember(
      supabaseAdmin,
      supabasePublic,
      pendingToken ? `Bearer ${pendingToken}` : undefined,
    );
    const pendingProfile = await supabaseAdmin
      .from("profiles")
      .select("id, user_custom_id, verified_phone_fingerprint, phone_verified_at, password_login_enabled, social_login_enabled")
      .eq("id", pending.data.user?.id ?? "")
      .maybeSingle();
    assert(
      "G pending custom:naver unusable and payment REJECTED",
      !!pending.data.user?.id &&
        pendingProfile.data?.user_custom_id == null &&
        !isUsableMemberProfile(pendingProfile.data) &&
        pendingPay.ok === false,
    );

    const freePhone = `01055${String(1000 + (parseInt(suffix.slice(0, 4), 16) % 8000)).padStart(4, "0")}22`;
    const linkSend = await postJson(
      base,
      "/api/auth/otp/send",
      { purpose: "identity_link", phone: freePhone },
      pendingToken,
    );
    const linkOtp = adapter.peekForTests()?.otp ?? "";
    const linkVerify = await postJson(
      base,
      "/api/auth/otp/verify",
      { purpose: "identity_link", phone: freePhone, code: linkOtp },
      pendingToken,
    );
    const linkProof = typeof linkVerify.json.proof_token === "string" ? linkVerify.json.proof_token : "";
    const activated = await postJson(
      base,
      "/api/auth/social/complete",
      {
        proof_token: linkProof,
        consents: { terms: true, privacy: true, cookie: true },
      },
      pendingToken,
    );
    const afterActivate = await supabaseAdmin
      .from("profiles")
      .select(
        "id, user_custom_id, verified_phone_fingerprint, phone_verified_at, password_login_enabled, social_login_enabled",
      )
      .eq("id", pending.data.user?.id ?? "")
      .maybeSingle();
    const username = typeof afterActivate.data?.user_custom_id === "string" ? afterActivate.data.user_custom_id : "";
    assert(
      "B/F/H custom:naver HTTP social-complete PASS without identity email",
      linkSend.status === 200 &&
        activated.status === 200 &&
        activated.json.ok === true &&
        GENERATED_SOCIAL_USERNAME_RE.test(username) &&
        username.startsWith("ml") &&
        afterActivate.data?.password_login_enabled === false &&
        afterActivate.data?.social_login_enabled === true &&
        isUsableMemberProfile(afterActivate.data),
    );
    const activatedPay = await verifyPaymentMember(
      supabaseAdmin,
      supabasePublic,
      pendingToken ? `Bearer ${pendingToken}` : undefined,
    );
    assert("activated custom:naver payment PASS via existing usable-member gate", activatedPay.ok === true);

    const recoverySend = await postJson(base, "/api/auth/otp/send", { purpose: "recovery", phone: freePhone });
    const recoveryOtp = adapter.peekForTests()?.otp ?? "";
    const recoveryVerify = await postJson(base, "/api/auth/otp/verify", {
      purpose: "recovery",
      phone: freePhone,
      code: recoveryOtp,
    });
    const recoveryProof =
      typeof recoveryVerify.json.proof_token === "string" ? recoveryVerify.json.proof_token : "";
    const recovery = await postJson(base, "/api/auth/recovery/resolve", { proof_token: recoveryProof });
    const linked = Array.isArray(recovery.json.linked_providers) ? recovery.json.linked_providers : [];
    const recoveryBlob = JSON.stringify(recovery.json);
    assert(
      "E Naver social-only recovery: no username, no password reset",
      recovery.status === 200 &&
        recovery.json.account_kind === "social" &&
        recovery.json.password_reset_allowed === false &&
        recovery.json.recoverable_username == null &&
        !recoveryBlob.includes(username),
    );
    assert(
      "D live recovery linked_providers=['naver'] from custom:naver identity",
      linked.length === 1 && linked[0] === "naver" && !recoveryLeaksSecrets(recovery.json),
    );

    const r2Pending = await supabaseAdmin.auth.admin.createUser({
      email: `c21r2${suffix}@example.com`,
      password,
      email_confirm: true,
    });
    if (r2Pending.data.user?.id) createdUserIds.push(r2Pending.data.user.id);
    if (r2Pending.data.user?.id) {
      await attachTrustedIdentity(supabaseAdmin, dbUrl, r2Pending.data.user.id, "custom:naver");
    }
    const r2Login = await supabasePublic.auth.signInWithPassword({
      email: `c21r2${suffix}@example.com`,
      password,
    });
    const r2Token = r2Login.data.session?.access_token ?? "";
    const r2Send = await postJson(
      base,
      "/api/auth/otp/send",
      { purpose: "identity_link", phone: ownerPhone },
      r2Token,
    );
    const r2Otp = adapter.peekForTests()?.otp ?? "";
    const r2Verify = await postJson(
      base,
      "/api/auth/otp/verify",
      { purpose: "identity_link", phone: ownerPhone, code: r2Otp },
      r2Token,
    );
    const r2Proof = typeof r2Verify.json.proof_token === "string" ? r2Verify.json.proof_token : "";
    const r2Complete = await postJson(
      base,
      "/api/auth/social/complete",
      {
        proof_token: r2Proof,
        consents: { terms: true, privacy: true, cookie: true },
      },
      r2Token,
    );
    const r2After = await supabaseAdmin
      .from("profiles")
      .select("user_custom_id, social_login_enabled, verified_phone_fingerprint")
      .eq("id", r2Pending.data.user?.id ?? "")
      .maybeSingle();
    const ownerAfter = await supabaseAdmin
      .from("profiles")
      .select("user_custom_id")
      .eq("id", ownerProfile.data?.id ?? "")
      .maybeSingle();
    assert(
      "C custom:naver R2 HTTP 409 phone_already_registered",
      r2Send.status === 200 &&
        r2Complete.status === 409 &&
        r2Complete.json.code === "phone_already_registered" &&
        r2After.data?.user_custom_id == null &&
        r2After.data?.social_login_enabled === false &&
        ownerAfter.data?.user_custom_id === trustedName,
    );

    const googlePending = await supabaseAdmin.auth.admin.createUser({
      email: `c21gg${suffix}@example.com`,
      password,
      email_confirm: true,
    });
    if (googlePending.data.user?.id) createdUserIds.push(googlePending.data.user.id);
    if (googlePending.data.user?.id) {
      await attachTrustedIdentity(supabaseAdmin, dbUrl, googlePending.data.user.id, "google");
    }
    const googleLogin = await supabasePublic.auth.signInWithPassword({
      email: `c21gg${suffix}@example.com`,
      password,
    });
    const googleToken = googleLogin.data.session?.access_token ?? "";
    const googlePhone = `01044${String(3000 + (parseInt(suffix.slice(0, 4), 16) % 6000)).padStart(4, "0")}33`;
    const gSend = await postJson(
      base,
      "/api/auth/otp/send",
      { purpose: "identity_link", phone: googlePhone },
      googleToken,
    );
    const gOtp = adapter.peekForTests()?.otp ?? "";
    const gVerify = await postJson(
      base,
      "/api/auth/otp/verify",
      { purpose: "identity_link", phone: googlePhone, code: gOtp },
      googleToken,
    );
    const gProof = typeof gVerify.json.proof_token === "string" ? gVerify.json.proof_token : "";
    const gComplete = await postJson(
      base,
      "/api/auth/social/complete",
      { proof_token: gProof, consents: { terms: true, privacy: true, cookie: true } },
      googleToken,
    );
    assert("H Google social-complete still PASS", gSend.status === 200 && gComplete.status === 200);

    const kakaoPending = await supabaseAdmin.auth.admin.createUser({
      email: `c21kk${suffix}@example.com`,
      password,
      email_confirm: true,
    });
    if (kakaoPending.data.user?.id) createdUserIds.push(kakaoPending.data.user.id);
    if (kakaoPending.data.user?.id) {
      await attachTrustedIdentity(supabaseAdmin, dbUrl, kakaoPending.data.user.id, "kakao");
    }
    const kakaoLogin = await supabasePublic.auth.signInWithPassword({
      email: `c21kk${suffix}@example.com`,
      password,
    });
    const kakaoToken = kakaoLogin.data.session?.access_token ?? "";
    const kakaoPhone = `01033${String(4000 + (parseInt(suffix.slice(0, 4), 16) % 5000)).padStart(4, "0")}44`;
    const kSend = await postJson(
      base,
      "/api/auth/otp/send",
      { purpose: "identity_link", phone: kakaoPhone },
      kakaoToken,
    );
    const kOtp = adapter.peekForTests()?.otp ?? "";
    const kVerify = await postJson(
      base,
      "/api/auth/otp/verify",
      { purpose: "identity_link", phone: kakaoPhone, code: kOtp },
      kakaoToken,
    );
    const kProof = typeof kVerify.json.proof_token === "string" ? kVerify.json.proof_token : "";
    const kComplete = await postJson(
      base,
      "/api/auth/social/complete",
      { proof_token: kProof, consents: { terms: true, privacy: true, cookie: true } },
      kakaoToken,
    );
    assert("H Kakao social-complete still PASS", kSend.status === 200 && kComplete.status === 200);

    const passwordLogin = await supabasePublic.auth.signInWithPassword({
      email: memberAuthEmail(trustedName),
      password,
    });
    assert("I password login still PASS", !passwordLogin.error && !!passwordLogin.data.session);

    const rawSignUp = await supabasePublic.auth.signUp({
      email: memberAuthEmail(`c21rs${suffix}`),
      password,
    });
    assert(
      "I public password signUp remains 403",
      (rawSignUp.error as { status?: number } | null)?.status === 403 && !rawSignUp.data.user,
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    for (const id of [...new Set(createdUserIds)]) {
      if (liveNaverBefore.includes(id)) continue;
      await supabaseAdmin.auth.admin.deleteUser(id);
    }
  }

  const liveNaverAfterRaw = dbQuerySql(
    dbUrl,
    `SELECT user_id FROM auth.identities WHERE provider = 'custom:naver' ORDER BY user_id;`,
  );
  const liveNaverAfter = liveNaverUserIds(liveNaverAfterRaw);
  assert(
    "live custom:naver identities UNCHANGED",
    liveNaverAfter.length === liveNaverBefore.length &&
      liveNaverAfter.every((id, i) => id === liveNaverBefore[i]),
  );

  const failed = results.filter((item) => !item.pass);
  console.log(`RESULT ${failed.length === 0 ? "PASS" : "FAIL"} ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(redact(err instanceof Error ? err.message : "verify failed"));
  process.exit(1);
});
