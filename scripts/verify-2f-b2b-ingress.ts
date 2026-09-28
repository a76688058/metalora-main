/**
 * NEW 2F B2b payment-test auth ingress hardening.
 * Applies payment-test-only hook SQL + username-exists revoke.
 * Never prints secrets, OTP, e164, fingerprints, or DB URIs.
 * Does not apply production unique index or disable_signup.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isUsableMemberProfile } from "../src/lib/authIntegrity";
import { registerOtpAuthRoutes } from "../src/lib/otpAuthHandlers";
import { registerPasswordAuthRoutes } from "../src/lib/passwordAuthHandlers";
import { DevCaptureSmsAdapter, isPaymentTestDevCaptureEnv } from "../src/lib/smsAdapter";
import { configureExpressTrustProxy } from "../src/lib/trustedClientIp";
import {
  classifyPostgresConnection,
  isUsableSupabaseDbUrl,
  PRODUCTION_SUPABASE_REF,
} from "../src/lib/supabaseHosts";
import { memberAuthEmail } from "../src/lib/memberUsername";

const PAYMENT_TEST_REF = "bvihpoorwriejybixmoc";
const HOOK_URI = "pg-functions://postgres/public/hook_before_user_created";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOOK_SQL = path.join(root, "scripts/sql/payment-test-2f-b2b-before-user-created.sql");
const REVOKE_SQL = path.join(root, "scripts/sql/deferred-2f-b2-username-exists-revoke.sql");

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
    : spawnSync(
        process.platform === "win32" ? "npx.cmd" : "npx",
        ["--yes", "supabase", "db", "query", "--db-url", dbUrl, "--file", filePath],
        {
          encoding: "utf8",
          maxBuffer: 10_000_000,
          windowsHide: true,
          shell: process.platform === "win32",
          env: process.env,
        },
      );
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
    const tmp = path.join(os.tmpdir(), `metalora-2f-b2b-${randomBytes(6).toString("hex")}.sql`);
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
  const tmp = path.join(os.tmpdir(), `metalora-2f-b2b-${randomBytes(8).toString("hex")}.sql`);
  fs.writeFileSync(tmp, sql, "utf8");
  try {
    return dbQueryFile(dbUrl, tmp);
  } finally {
    fs.unlinkSync(tmp);
  }
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

function managementToken(extra: Record<string, string | undefined> = {}): string {
  return (
    extra.SUPABASE_ACCESS_TOKEN ??
    extra.SUPABASE_MANAGEMENT_TOKEN ??
    process.env.SUPABASE_ACCESS_TOKEN ??
    process.env.SUPABASE_MANAGEMENT_TOKEN ??
    ""
  ).trim();
}

async function fetchAuthConfig(
  ref: string,
  extra: Record<string, string | undefined> = {},
): Promise<Record<string, unknown> | null> {
  const token = managementToken(extra);
  if (!token) return null;
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });
  if (!res.ok) {
    console.log(`auth_config_get_status=${res.status}`);
    return null;
  }
  return (await res.json()) as Record<string, unknown>;
}

async function patchAuthConfig(
  ref: string,
  body: Record<string, unknown>,
  extra: Record<string, string | undefined> = {},
): Promise<Record<string, unknown> | null> {
  const token = managementToken(extra);
  if (!token) return null;
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.log(`auth_config_patch_status=${res.status}`);
    return null;
  }
  return (await res.json()) as Record<string, unknown>;
}

function policyFields(cfg: Record<string, unknown> | null): string {
  if (!cfg) return "unavailable";
  const keys = [
    "disable_signup",
    "external_email_enabled",
    "external_anonymous_users_enabled",
    "password_min_length",
    "password_required_characters",
    "hook_before_user_created_enabled",
    "hook_before_user_created_uri",
    "HOOK_BEFORE_USER_CREATED_ENABLED",
    "HOOK_BEFORE_USER_CREATED_URI",
  ];
  const parts: string[] = [];
  for (const key of keys) {
    if (key in cfg) parts.push(`${key}=${JSON.stringify(cfg[key])}`);
  }
  return parts.join(" ") || `keys=${Object.keys(cfg).filter((k) => /hook|password|signup|email|anonymous/i.test(k)).join(",")}`;
}

function hookAllows(raw: string): boolean {
  const trimmed = raw.replace(/\s+/g, "");
  return trimmed.includes("{}") && !trimmed.includes('"error"');
}

function hookRejects(raw: string): boolean {
  return raw.includes("http_code") || raw.includes('"error"');
}

function authErr(err: unknown): string {
  if (!err || typeof err !== "object") return "none";
  const value = err as { name?: unknown; code?: unknown; status?: unknown; message?: unknown };
  const name = typeof value.name === "string" ? value.name : "";
  const code = typeof value.code === "string" ? value.code : "";
  const status = typeof value.status === "number" ? String(value.status) : "";
  const message = typeof value.message === "string" ? redact(value.message).slice(0, 240) : "";
  return `name=${name} code=${code} status=${status} message=${message}`;
}

function authStatus(err: unknown): number {
  if (!err || typeof err !== "object") return 0;
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" && Number.isFinite(status) ? status : 0;
}

function authMessage(err: unknown): string {
  if (!err || typeof err !== "object") return "";
  const message = (err as { message?: unknown }).message;
  return typeof message === "string" ? message : "";
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
  assert("target db is payment-test not production", classified.ref === PAYMENT_TEST_REF && !classified.isProductionRef);
  const dbUrl = encodeDbUrl(dbUrlRaw);

  const supabaseUrl = apiEnv.VITE_SUPABASE_URL;
  const anonKey = apiEnv.VITE_SUPABASE_ANON_KEY;
  const serviceKey = apiEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl.includes(PAYMENT_TEST_REF) || supabaseUrl.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error("VITE_SUPABASE_URL is not payment-test");
  }
  assert("target api is payment-test not production", true);

  const hookInMigrations = fs
    .readdirSync(path.join(root, "supabase/migrations"))
    .some((name) => name.includes("before_user_created") || name.includes("before-user-created"));
  const revokeInMigrations = fs
    .readdirSync(path.join(root, "supabase/migrations"))
    .some((name) => name.includes("username_exists") || name.includes("username-exists"));
  assert("hook sql is not a shared migration", fs.existsSync(HOOK_SQL) && !hookInMigrations);
  assert("revoke sql is not a shared migration", fs.existsSync(REVOKE_SQL) && !revokeInMigrations);

  const hookSrc = fs.readFileSync(HOOK_SQL, "utf8");
  const hookBody = hookSrc.slice(hookSrc.indexOf("AS $$"), hookSrc.lastIndexOf("$$") + 2);
  assert(
    "hook rejects email/anonymous and does not use email domain",
    hookBody.includes("provider = 'email'") &&
      hookBody.includes("is_anonymous") &&
      !hookBody.toLowerCase().includes("metalora.me") &&
      !hookBody.includes("disable_signup") &&
      !hookBody.includes("external_email"),
  );
  assert("hook allows non-email providers by falling through", hookSrc.includes("RETURN '{}'::jsonb"));

  console.log("APPLY payment-test Before User Created function");
  dbQueryFile(dbUrl, HOOK_SQL);
  console.log("APPLY payment-test profiles_username_exists revoke");
  dbQueryFile(dbUrl, REVOKE_SQL);

  const emailHook = dbQuerySql(
    dbUrl,
    `SELECT public.hook_before_user_created('{"user":{"is_anonymous":false,"app_metadata":{"provider":"email"}}}'::jsonb);`,
  );
  const anonHook = dbQuerySql(
    dbUrl,
    `SELECT public.hook_before_user_created('{"user":{"is_anonymous":true,"app_metadata":{"provider":"email"}}}'::jsonb);`,
  );
  const googleHook = dbQuerySql(
    dbUrl,
    `SELECT public.hook_before_user_created('{"user":{"is_anonymous":false,"app_metadata":{"provider":"google"}}}'::jsonb);`,
  );
  const kakaoHook = dbQuerySql(
    dbUrl,
    `SELECT public.hook_before_user_created('{"user":{"is_anonymous":false,"app_metadata":{"provider":"kakao"}}}'::jsonb);`,
  );
  const naverHook = dbQuerySql(
    dbUrl,
    `SELECT public.hook_before_user_created('{"user":{"is_anonymous":false,"app_metadata":{"provider":"naver"}}}'::jsonb);`,
  );
  assert("D hook payload rejects provider=email", hookRejects(emailHook));
  assert("D hook payload rejects anonymous", hookRejects(anonHook));
  assert("D hook payload allows google", hookAllows(googleHook));
  assert("D hook payload allows kakao", hookAllows(kakaoHook));
  assert("D hook payload allows naver", hookAllows(naverHook));
  const authAdminExec = dbQuerySql(
    dbUrl,
    `SELECT has_function_privilege('supabase_auth_admin', 'public.hook_before_user_created(jsonb)', 'EXECUTE');`,
  );
  const anonExec = dbQuerySql(
    dbUrl,
    `SELECT has_function_privilege('anon', 'public.hook_before_user_created(jsonb)', 'EXECUTE');`,
  );
  const authedExec = dbQuerySql(
    dbUrl,
    `SELECT has_function_privilege('authenticated', 'public.hook_before_user_created(jsonb)', 'EXECUTE');`,
  );
  console.log(`hook_priv auth_admin=${authAdminExec.replace(/\s+/g, " ").slice(0, 80)} anon=${anonExec.replace(/\s+/g, " ").slice(0, 80)} authenticated=${authedExec.replace(/\s+/g, " ").slice(0, 80)}`);
  assert("supabase_auth_admin EXECUTE granted", /\bt\b|true/i.test(authAdminExec));
  assert("anon EXECUTE revoked", /\bf\b|false/i.test(anonExec));
  assert("authenticated EXECUTE revoked", /\bf\b|false/i.test(authedExec));

  console.log(`management_token=${managementToken({ ...apiEnv, ...dbEnv }) ? "present" : "absent"}`);
  let cfg = await fetchAuthConfig(PAYMENT_TEST_REF, { ...apiEnv, ...dbEnv });
  console.log(`auth_config_before ${policyFields(cfg)}`);
  if (cfg) {
    const patch: Record<string, unknown> = {
      password_min_length: 8,
      disable_signup: false,
      external_email_enabled: true,
    };
    if ("password_required_characters" in cfg) patch.password_required_characters = "";
    if ("external_anonymous_users_enabled" in cfg) patch.external_anonymous_users_enabled = false;
    if ("hook_before_user_created_enabled" in cfg || "hook_before_user_created_uri" in cfg) {
      patch.hook_before_user_created_enabled = true;
      patch.hook_before_user_created_uri = HOOK_URI;
    } else if ("HOOK_BEFORE_USER_CREATED_ENABLED" in cfg) {
      patch.HOOK_BEFORE_USER_CREATED_ENABLED = true;
      patch.HOOK_BEFORE_USER_CREATED_URI = HOOK_URI;
    }
    const patched = await patchAuthConfig(PAYMENT_TEST_REF, patch, { ...apiEnv, ...dbEnv });
    if (patched) cfg = patched;
    else cfg = (await fetchAuthConfig(PAYMENT_TEST_REF, { ...apiEnv, ...dbEnv })) ?? cfg;
    await new Promise((resolve) => setTimeout(resolve, 4000));
    console.log(`auth_config_after ${policyFields(cfg)}`);
    assert("hosted disable_signup remains false", cfg.disable_signup === false);
    assert("hosted email provider remains enabled", cfg.external_email_enabled === true);
    assert("hosted password_min_length is 8", Number(cfg.password_min_length) === 8);
    const hookOn =
      cfg.hook_before_user_created_enabled === true || cfg.HOOK_BEFORE_USER_CREATED_ENABLED === true;
    const hookUri = String(cfg.hook_before_user_created_uri ?? cfg.HOOK_BEFORE_USER_CREATED_URI ?? "");
    assert("hosted Before User Created hook enabled", hookOn && hookUri.includes("hook_before_user_created"));
  } else {
    console.log("auth_config_patch skipped: management token absent");
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const supabasePublic = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const suffix = randomBytes(3).toString("hex");
  const password8 = `Aa1!${randomBytes(8).toString("base64url")}xx`;
  const adminName = `b2ba${suffix}`;
  const rawName = `b2br${suffix}`;
  const trustedName = `b2bt${suffix}`;

  const adminCreated = await supabaseAdmin.auth.admin.createUser({
    email: memberAuthEmail(adminName),
    password: password8,
    email_confirm: true,
    user_metadata: { user_custom_id: adminName, full_name: "게이트" },
  });
  console.log(`admin_create ${authErr(adminCreated.error)}`);
  assert("F Admin createUser after hook wiring", !adminCreated.error && !!adminCreated.data.user?.id);
  if (adminCreated.data.user?.id) createdUserIds.push(adminCreated.data.user.id);
  if (adminCreated.error) {
    console.log("STOP: Before User Created hook rejected Admin createUser. Hook was not weakened.");
  }

  const rawDirect = await fetch(`${supabaseUrl}/auth/v1/signup`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email: memberAuthEmail(rawName), password: password8 }),
  });
  const rawDirectText = await rawDirect.text();
  console.log(`raw_signup_direct status=${rawDirect.status} body=${redact(rawDirectText).slice(0, 240)}`);

  const rawSignUp = await supabasePublic.auth.signUp({
    email: memberAuthEmail(rawName),
    password: password8,
  });
  const rawBlocked = Boolean(rawSignUp.error) && !rawSignUp.data.user && !rawSignUp.data.session;
  const rawStatus = authStatus(rawSignUp.error) || rawDirect.status;
  const rawMsg = authMessage(rawSignUp.error) || rawDirectText;
  console.log(`raw_signup ${authErr(rawSignUp.error)}`);
  assert("B raw public provider=email signUp BLOCKED", rawBlocked);
  assert(
    "B raw public signup is intentional 4xx policy reject",
    rawStatus >= 400 &&
      rawStatus < 500 &&
      rawMsg.includes("Public password signup is not allowed."),
  );
  if (rawSignUp.data.user?.id) {
    createdUserIds.push(rawSignUp.data.user.id);
    const leftover = await supabaseAdmin
      .from("profiles")
      .select("id, user_custom_id, verified_phone_fingerprint, phone_verified_at")
      .eq("id", rawSignUp.data.user.id)
      .maybeSingle();
    assert("B rejected raw signup is not a usable member", !isUsableMemberProfile(leftover.data));
  } else {
    const leftoverLogin = await supabasePublic.auth.signInWithPassword({
      email: memberAuthEmail(rawName),
      password: password8,
    });
    assert("B no leftover auth user from raw signup", Boolean(leftoverLogin.error) && !leftoverLogin.data.user);
  }

  const nonMemberEmail = `b2bnm${suffix}@example.com`;
  const nonMemberDirect = await fetch(`${supabaseUrl}/auth/v1/signup`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email: nonMemberEmail, password: password8 }),
  });
  const nonMemberDirectText = await nonMemberDirect.text();
  console.log(
    `nonmember_signup_direct status=${nonMemberDirect.status} body=${redact(nonMemberDirectText).slice(0, 240)}`,
  );
  const nonMemberSignUp = await supabasePublic.auth.signUp({
    email: nonMemberEmail,
    password: password8,
  });
  console.log(`nonmember_signup ${authErr(nonMemberSignUp.error)}`);
  const nonMemberBlocked =
    Boolean(nonMemberSignUp.error) && !nonMemberSignUp.data.user && !nonMemberSignUp.data.session;
  const nonMemberStatus = authStatus(nonMemberSignUp.error) || nonMemberDirect.status;
  const nonMemberMsg = authMessage(nonMemberSignUp.error) || nonMemberDirectText;
  assert("B non-member public provider=email signUp BLOCKED", nonMemberBlocked);
  assert(
    "B non-member public signup is intentional 4xx policy reject",
    nonMemberStatus >= 400 &&
      nonMemberStatus < 500 &&
      nonMemberMsg.includes("Public password signup is not allowed."),
  );
  if (nonMemberSignUp.data.user?.id) {
    createdUserIds.push(nonMemberSignUp.data.user.id);
  } else {
    try {
      const parsed = JSON.parse(nonMemberDirectText) as { id?: string; user?: { id?: string } };
      const leftoverId = parsed.id ?? parsed.user?.id;
      if (typeof leftoverId === "string" && leftoverId) createdUserIds.push(leftoverId);
    } catch {
      /* no leftover id in reject body */
    }
  }
  const nonMemberLogin = await supabasePublic.auth.signInWithPassword({
    email: nonMemberEmail,
    password: password8,
  });
  assert(
    "B no leftover auth user from non-member signup",
    Boolean(nonMemberLogin.error) && !nonMemberLogin.data.user && !nonMemberLogin.data.session,
  );

  const pwd7Admin = await supabaseAdmin.auth.admin.createUser({
    email: memberAuthEmail(`b2b7${suffix}`),
    password: "1234567",
    email_confirm: true,
  });
  console.log(`admin_create_7char ${authErr(pwd7Admin.error)}`);
  if (pwd7Admin.data.user?.id) {
    createdUserIds.push(pwd7Admin.data.user.id);
  }
  assert("H hosted password length 7 REJECTED", Boolean(pwd7Admin.error) && !pwd7Admin.data.user);

  const pwd7Public = await supabasePublic.auth.signUp({
    email: memberAuthEmail(`b2b7p${suffix}`),
    password: "1234567",
  });
  console.log(`signup_7char ${authErr(pwd7Public.error)}`);

  const anonAttempt = await supabasePublic.auth.signInAnonymously();
  console.log(`anonymous ${authErr(anonAttempt.error)}`);
  assert(
    "anonymous signup BLOCKED or not enabled",
    Boolean(anonAttempt.error) && !anonAttempt.data.user,
  );

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
  ]);

  try {
    const phone = `01077${String(2000 + (parseInt(suffix.slice(0, 4), 16) % 7000)).padStart(4, "0")}21`;
    const send = await postJson(base, "/api/auth/otp/send", { purpose: "signup", phone });
    const otp = adapter.peekForTests()?.otp ?? "";
    const verify = await postJson(base, "/api/auth/otp/verify", { purpose: "signup", phone, code: otp });
    const proof = typeof verify.json.proof_token === "string" ? verify.json.proof_token : "";
    const complete = await postJson(base, "/api/auth/signup/complete", {
      proof_token: proof,
      username: trustedName,
      password: password8,
      full_name: "홍길동",
      consents: { terms: true, privacy: true, cookie: true },
    });
    assert("A trusted /api/auth/signup/complete PASS", send.status === 200 && complete.status === 200 && complete.json.ok === true);

    const profile = await supabaseAdmin
      .from("profiles")
      .select("id, user_custom_id, verified_phone_fingerprint, phone_verified_at")
      .eq("user_custom_id", trustedName)
      .maybeSingle();
    if (profile.data?.id) createdUserIds.push(profile.data.id);
    assert("A trusted signup created usable member", isUsableMemberProfile(profile.data));

    const login = await supabasePublic.auth.signInWithPassword({
      email: memberAuthEmail(trustedName),
      password: password8,
    });
    assert("C existing password signInWithPassword PASS", !login.error && !!login.data.session);

    const check = await postJson(base, "/api/auth/signup/username-check", { username: trustedName });
    assert("G server username-check PASS", check.status === 200 && check.json.ok === true && check.json.available === false);

    const anonRpc = await supabasePublic.rpc("profiles_username_exists", { username: trustedName });
    assert("E anon profiles_username_exists BLOCKED", !!anonRpc.error);

    const authed = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    if (login.data.session?.access_token) {
      await authed.auth.setSession({
        access_token: login.data.session.access_token,
        refresh_token: login.data.session.refresh_token ?? "",
      });
    }
    const authedRpc = await authed.rpc("profiles_username_exists", { username: trustedName });
    assert("F authenticated direct profiles_username_exists BLOCKED", !!authedRpc.error);

    assert(
      "I hosted password length 8 permitted when otherwise valid",
      !adminCreated.error && !!adminCreated.data.user?.id,
    );
    const integritySrc = fs.readFileSync(path.join(root, "src/lib/authIntegrity.ts"), "utf8");
    const paymentSrc = fs.readFileSync(path.join(root, "src/lib/paymentMemberAuth.ts"), "utf8");
    const serverSrc = fs.readFileSync(path.join(root, "server.ts"), "utf8");
    const otpSrc = fs.readFileSync(path.join(root, "src/lib/otpAuthHandlers.ts"), "utf8");
    const smsSrc = fs.readFileSync(path.join(root, "src/lib/smsAdapter.ts"), "utf8");
    assert(
      "J verified-phone member gate UNCHANGED",
      integritySrc.includes("verified_phone_fingerprint") &&
        integritySrc.includes("phone_verified_at") &&
        integritySrc.includes("user_custom_id"),
    );
    assert(
      "K payment gate UNCHANGED",
      paymentSrc.includes("isUsableMemberProfile") &&
        serverSrc.includes("return verifyPaymentMember(supabaseAdmin, supabasePublic, authHeader)"),
    );
    assert(
      "L dest-capture OTP endpoint still gated",
      otpSrc.includes('app.get("/api/auth/dev/otp/latest"') &&
        otpSrc.includes("isPaymentTestDevCaptureEnv") &&
        smsSrc.includes("SMS_ADAPTER") &&
        isPaymentTestDevCaptureEnv(apiEnv) === true &&
        isPaymentTestDevCaptureEnv({ ...apiEnv, METALORA_ENV: "production" }) === false,
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    for (const id of createdUserIds) {
      await supabaseAdmin.auth.admin.deleteUser(id);
    }
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`RESULT ${failed.length === 0 ? "PASS" : "FAIL"} ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? redact(err.message) : "verify failed");
  process.exit(1);
});
