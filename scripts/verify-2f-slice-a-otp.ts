/**
 * NEW 2F Slice A payment-test verification.
 * Applies A1/A2 + payment-test-only unique index (never production).
 * Never prints secrets, OTP, e164, fingerprints, or DB URIs.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import { registerOtpAuthRoutes } from "../src/lib/otpAuthHandlers";
import { phoneFingerprint } from "../src/lib/phoneHmac";
import { normalizeKrMobilePhone } from "../src/lib/phoneNormalize";
import { DevCaptureSmsAdapter, resolveSmsAdapter } from "../src/lib/smsAdapter";
import { fixedWindowBucketStart, otpRateKeyHmac, otpTicketHmac } from "../src/lib/otpCrypto";
import {
  PRODUCTION_SUPABASE_REF,
  PRODUCTION_SUPABASE_URL,
  classifyPostgresConnection,
  isUsableSupabaseDbUrl,
} from "../src/lib/supabaseHosts";

const PAYMENT_TEST_REF = "bvihpoorwriejybixmoc";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const A1 = path.join(root, "supabase/migrations/20260923220000_2f_a1_verified_phone_columns.sql");
const A2 = path.join(root, "supabase/migrations/20260923220100_2f_a2_otp_foundation.sql");
const UNIQUE_SQL = path.join(root, "scripts/sql/payment-test-2f-a-verified-phone-unique.sql");

type TestResult = { name: string; pass: boolean; detail?: string };
const results: TestResult[] = [];
const fingerprints: string[] = [];
const createdUserIds: string[] = [];

function assert(name: string, condition: boolean, detail?: string): void {
  results.push({ name, pass: condition, detail });
  console.log(`${condition ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
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

function dbQueryFile(dbUrl: string, filePath: string): string {
  const sql = fs.readFileSync(filePath, "utf8");
  const statements = splitSqlStatements(sql);
  let combined = "";
  for (let i = 0; i < statements.length; i += 1) {
    const stmt = statements[i]!;
    const kind = stmt.split(/\s+/).slice(0, 4).join(" ");
    console.log(`SQL ${i + 1}/${statements.length} ${kind}`);
    const tmp = path.join(os.tmpdir(), `metalora-2f-a-stmt-${randomBytes(6).toString("hex")}.sql`);
    fs.writeFileSync(tmp, `${stmt};`, "utf8");
    try {
      combined += dbQueryOne(dbUrl, tmp);
    } finally {
      fs.unlinkSync(tmp);
    }
  }
  return combined;
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
    const err = redact(result.stderr || "");
    const out = redact(result.stdout || "");
    throw new Error(
      `db query failed status=${result.status} spawn=${result.error?.message ?? "ok"} npxCli=${fs.existsSync(npxCli) ? "yes" : "no"} stderrLen=${(result.stderr || "").length} stdoutLen=${(result.stdout || "").length} stderr=${err.slice(0, 800)} stdout=${out.slice(0, 800)}`,
    );
  }
  return result.stdout ?? "";
}

function dbQuerySql(dbUrl: string, sql: string): string {
  const tmp = path.join(os.tmpdir(), `metalora-2f-a-${randomBytes(8).toString("hex")}.sql`);
  fs.writeFileSync(tmp, sql, "utf8");
  try {
    return dbQueryFile(dbUrl, tmp);
  } finally {
    fs.unlinkSync(tmp);
  }
}

function ensureOtpSecrets(
  envPath: string,
  env: Record<string, string>,
): Record<string, string> {
  const next = { ...env };
  let append = "";
  if (!next.PHONE_IDENTITY_KEY || next.PHONE_IDENTITY_KEY.trim().length < 32) {
    next.PHONE_IDENTITY_KEY = randomBytes(32).toString("hex");
    append += `\nPHONE_IDENTITY_KEY=${next.PHONE_IDENTITY_KEY}\n`;
  }
  if (!next.OTP_PEPPER || next.OTP_PEPPER.trim().length < 32) {
    next.OTP_PEPPER = randomBytes(32).toString("hex");
    append += `\nOTP_PEPPER=${next.OTP_PEPPER}\n`;
  }
  if ((next.SMS_ADAPTER ?? "").trim() !== "dev-capture") {
    next.SMS_ADAPTER = "dev-capture";
    append += `\nSMS_ADAPTER=dev-capture\n`;
  }
  if (append) fs.appendFileSync(envPath, append, "utf8");
  return next;
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

function capturedLogHasLeak(logs: string[], secrets: string[]): boolean {
  const blob = logs.join("\n");
  return secrets.some((s) => s && blob.includes(s));
}

async function main(): Promise<void> {
  const apiEnvPath = path.join(root, ".env.payment-test.local");
  const dbEnvPath = path.join(root, ".env.payment-test.db.local");
  if (!fs.existsSync(apiEnvPath) || !fs.existsSync(dbEnvPath)) {
    throw new Error("payment-test env files missing");
  }

  let apiEnv = parseEnvFileRaw(apiEnvPath);
  const dbEnv = parseEnvFileRaw(dbEnvPath);
  apiEnv = ensureOtpSecrets(apiEnvPath, apiEnv);
  apiEnv.METALORA_ENV = "payment-test";
  apiEnv.VITE_METALORA_ENV = "payment-test";

  console.log(
    `db env keys present: ${Object.keys(dbEnv).sort().join(",") || "(none)"}`,
  );
  const dbUrlRaw = (process.env.PAYMENT_TEST_DB_URL ?? dbEnv.PAYMENT_TEST_DB_URL ?? "").trim();
  if (!isUsableSupabaseDbUrl(dbUrlRaw)) {
    throw new Error("PAYMENT_TEST_DB_URL missing or unusable");
  }
  const classified = classifyPostgresConnection(dbUrlRaw);
  if (classified.isProductionRef || classified.ref !== PAYMENT_TEST_REF) {
    throw new Error(
      `PAYMENT_TEST_DB_URL is not the payment-test project (parseable=${classified.parseable} host=${classified.host} ref=${classified.ref} prod=${classified.isProductionRef})`,
    );
  }
  const dbUrl = encodeDbUrl(dbUrlRaw);
  const encodedClass = classifyPostgresConnection(dbUrl);
  let ctorOk = false;
  let ctorHost: string | null = null;
  try {
    const parsed = new URL(dbUrl.replace(/^postgres(?:ql)?:/i, "http:"));
    ctorOk = true;
    ctorHost = parsed.hostname;
  } catch {
    ctorOk = false;
  }
  console.log(
    `encoded_db parseable=${encodedClass.parseable} host=${encodedClass.host} ref=${encodedClass.ref} prod=${encodedClass.isProductionRef} ctor=${ctorOk} ctorHost=${ctorHost} lenDelta=${dbUrl.length - dbUrlRaw.length}`,
  );

  const uniqueInMigrations = fs
    .readdirSync(path.join(root, "supabase/migrations"))
    .some((name) => name.includes("verified_phone_fingerprint") || name.includes("verified-phone-unique"));
  assert(
    "unique index is not a shared migration file",
    !uniqueInMigrations && fs.existsSync(UNIQUE_SQL),
  );

  console.log("APPLY A1 verified-phone columns (payment-test only)");
  dbQueryFile(dbUrl, A1);
  console.log("APPLY A2 OTP foundation (payment-test only)");
  dbQueryFile(dbUrl, A2);
  console.log("APPLY payment-test-only unique fingerprint index");
  dbQueryFile(dbUrl, UNIQUE_SQL);

  const n010 = normalizeKrMobilePhone("01012345678");
  const nHyphen = normalizeKrMobilePhone("010-1234-5678");
  const nPlus = normalizeKrMobilePhone("+821012345678");
  const n82 = normalizeKrMobilePhone("821012345678");
  assert(
    "normalization equivalence",
    n010.ok && nHyphen.ok && nPlus.ok && n82.ok &&
      n010.ok && n010.e164 === "+821012345678" &&
      nHyphen.ok && nHyphen.e164 === n010.e164 &&
      nPlus.ok && nPlus.e164 === n010.e164 &&
      n82.ok && n82.e164 === n010.e164,
  );
  assert("reject landline 02", normalizeKrMobilePhone("02-123-4567").ok === false);
  assert("reject 070", normalizeKrMobilePhone("070-1234-5678").ok === false);
  assert("reject 080", normalizeKrMobilePhone("080-123-4567").ok === false);
  assert("reject ambiguous 10-digit", normalizeKrMobilePhone("1012345678").ok === false);
  assert("reject extra digits", normalizeKrMobilePhone("010123456789").ok === false);
  assert("reject letters", normalizeKrMobilePhone("010-abcd-5678").ok === false);
  assert("reject US number", normalizeKrMobilePhone("+14155552671").ok === false);

  const fpKey = apiEnv.PHONE_IDENTITY_KEY;
  const fp1 = phoneFingerprint("+821012345678", fpKey);
  const fp2 = phoneFingerprint(nHyphen.ok ? nHyphen.e164 : "", fpKey);
  assert("stable fingerprint determinism", fp1.length === 64 && fp1 === fp2 && /^[0-9a-f]{64}$/.test(fp1));

  const bucketA = fixedWindowBucketStart(1_700_000_000_000, 3600);
  const bucketB = fixedWindowBucketStart(1_700_000_000_000 + 59_000, 3600);
  const bucketC = fixedWindowBucketStart(1_700_003_600_000, 3600);
  assert(
    "deterministic rate-limit window",
    bucketA.getTime() === bucketB.getTime() && bucketC.getTime() !== bucketA.getTime(),
  );

  const prodSms = resolveSmsAdapter({
    METALORA_ENV: "production",
    SMS_ADAPTER: "dev-capture",
    VITE_SUPABASE_URL: PRODUCTION_SUPABASE_URL,
    NODE_ENV: "production",
  });
  assert("DevCapture forbidden on production host", prodSms.ok === false);

  const ordinarySms = resolveSmsAdapter({
    METALORA_ENV: "",
    VITE_SUPABASE_URL: "https://example-payment-test.supabase.co",
  });
  assert("ordinary runtime without real SMS adapter fails closed", ordinarySms.ok === false);

  const paymentSms = resolveSmsAdapter({
    METALORA_ENV: "payment-test",
    SMS_ADAPTER: "dev-capture",
    VITE_SUPABASE_URL: apiEnv.VITE_SUPABASE_URL,
  });
  assert("DevCapture allowed for payment-test + dev-capture", paymentSms.ok === true);

  const fallbackSms = resolveSmsAdapter({
    METALORA_ENV: "payment-test",
    SMS_ADAPTER: "dev-capture",
    VITE_SUPABASE_URL: PRODUCTION_SUPABASE_URL,
  });
  assert("DevCapture forbidden when URL is production even in payment-test env", fallbackSms.ok === false);

  const supabaseUrl = apiEnv.VITE_SUPABASE_URL;
  const anonKey = apiEnv.VITE_SUPABASE_ANON_KEY;
  const serviceKey = apiEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl.includes(PAYMENT_TEST_REF)) {
    throw new Error("VITE_SUPABASE_URL is not payment-test");
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const supabasePublic = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const profileProbe = await supabaseAdmin
    .from("profiles")
    .select("phone_number, verified_phone_e164, verified_phone_fingerprint, phone_verified_at")
    .limit(1);
  assert("verified phone columns present", !profileProbe.error);
  assert("phone_number column still present", !profileProbe.error);

  const tablesOk = (
    await Promise.all([
      supabaseAdmin.from("otp_challenges").select("id").limit(1),
      supabaseAdmin.from("phone_verification_tickets").select("id").limit(1),
      supabaseAdmin.from("auth_rate_limits").select("id").limit(1),
    ])
  ).every((r) => !r.error);
  assert("otp foundation tables present", tablesOk);

  const indexOut = dbQuerySql(
    dbUrl,
    `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'profiles_verified_phone_fingerprint_uidx'`,
  );
  assert("payment-test unique fingerprint index exists", indexOut.includes("profiles_verified_phone_fingerprint_uidx"));

  const adapter = new DevCaptureSmsAdapter();
  const logs: string[] = [];
  const origLog = console.log.bind(console);
  const origInfo = console.info.bind(console);
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);
  const tap = (fn: typeof console.log) =>
    (...args: unknown[]) => {
      logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
      fn(...args);
    };
  console.log = tap(origLog);
  console.info = tap(origInfo);
  console.warn = tap(origWarn);
  console.error = tap(origError);

  const app = express();
  app.use(express.json());
  registerOtpAuthRoutes(app, {
    supabaseAdmin,
    supabasePublic,
    getEnv: () => apiEnv,
    smsAdapter: adapter,
  });

  const server: http.Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("listen failed");
  const base = `http://127.0.0.1:${addr.port}`;

  const password = `Aa1!${randomBytes(12).toString("base64url")}`;
  const suffix = randomBytes(3).toString("hex");
  const userAName = `slca${suffix}`;
  const userBName = `slcb${suffix}`;

  async function createMember(username: string): Promise<{ id: string; token: string }> {
    const email = `${username}@metalora.me`;
    const created = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { user_custom_id: username },
    });
    if (created.error || !created.data.user) {
      throw new Error("createUser failed");
    }
    createdUserIds.push(created.data.user.id);
    const session = await supabasePublic.auth.signInWithPassword({ email, password });
    const token = session.data.session?.access_token;
    if (session.error || !token) throw new Error("signIn failed");
    return { id: created.data.user.id, token };
  }

  try {
    const userA = await createMember(userAName);
    const userB = await createMember(userBName);

    const contactA = "010-1111-2222";
    await supabaseAdmin.from("profiles").update({ phone_number: contactA }).eq("id", userA.id);
    await supabaseAdmin.from("profiles").update({ phone_number: "010-3333-4444" }).eq("id", userB.id);

    const phoneBind = "01099990001";
    const phoneSignup = "01099990002";
    const phoneRecovery = "01099990003";
    const phoneLink = "01099990004";
    const phoneConcurrent = "01099990005";
    const phoneWrong = "01099990006";
    const phoneExpiry = "01099990007";
    const phoneThrottle = "01099990008";
    const e164Bind = "+821099990001";
    fingerprints.push(
      phoneFingerprint(e164Bind, fpKey),
      phoneFingerprint("+821099990002", fpKey),
      phoneFingerprint("+821099990003", fpKey),
      phoneFingerprint("+821099990004", fpKey),
      phoneFingerprint("+821099990005", fpKey),
      phoneFingerprint("+821099990006", fpKey),
      phoneFingerprint("+821099990007", fpKey),
      phoneFingerprint("+821099990008", fpKey),
    );

    const sendBind = await postJson(base, "/api/auth/otp/send", { purpose: "change_phone", phone: phoneBind });
    assert("change_phone send requires auth", sendBind.status === 401);

    const sendA = await postJson(
      base,
      "/api/auth/otp/send",
      { purpose: "change_phone", phone: phoneBind },
      userA.token,
    );
    assert("generic send response", sendA.status === 200 && sendA.json.ok === true);
    assert("send hides challenge id", sendA.json.challenge_id == null && sendA.json.otp == null);
    const otpA = adapter.peekForTests()?.otp ?? "";
    assert("dev capture has otp", /^\d{6}$/.test(otpA));

    const sendA2 = await postJson(
      base,
      "/api/auth/otp/send",
      { purpose: "change_phone", phone: phoneBind },
      userA.token,
    );
    assert("resend cooldown", sendA2.status === 429);

    const verifyBadAuth = await postJson(base, "/api/auth/otp/verify", {
      purpose: "change_phone",
      phone: phoneBind,
      code: otpA,
    });
    assert("change_phone verify requires auth", verifyBadAuth.status === 401);

    const verifyWrong = await postJson(
      base,
      "/api/auth/otp/verify",
      { purpose: "change_phone", phone: phoneBind, code: otpA === "000000" ? "000001" : "000000" },
      userA.token,
    );
    assert("wrong code generic", verifyWrong.status === 200 && verifyWrong.json.ok === false);

    const verifyA = await postJson(
      base,
      "/api/auth/otp/verify",
      { purpose: "change_phone", phone: phoneBind, code: otpA },
      userA.token,
    );
    const proofA = typeof verifyA.json.proof_token === "string" ? verifyA.json.proof_token : "";
    assert(
      "successful verification",
      verifyA.status === 200 && verifyA.json.ok === true && /^[0-9a-f]{64}$/.test(proofA),
    );

    const replayChallenge = await postJson(
      base,
      "/api/auth/otp/verify",
      { purpose: "change_phone", phone: phoneBind, code: otpA },
      userA.token,
    );
    assert("OTP challenge replay rejected", replayChallenge.status === 200 && replayChallenge.json.ok === false);

    const bindA = await postJson(base, "/api/auth/phone/bind", { proof_token: proofA }, userA.token);
    assert("change_phone bind succeeds", bindA.status === 200 && bindA.json.ok === true);

    const profileA = await supabaseAdmin
      .from("profiles")
      .select("phone_number, verified_phone_e164, verified_phone_fingerprint, phone_verified_at")
      .eq("id", userA.id)
      .maybeSingle();
    assert(
      "bind writes verified-phone only",
      profileA.data?.verified_phone_e164 === e164Bind &&
        typeof profileA.data?.verified_phone_fingerprint === "string" &&
        profileA.data?.phone_verified_at != null,
    );
    assert("contact phone_number unchanged after bind", profileA.data?.phone_number === contactA);

    const replayProof = await postJson(base, "/api/auth/phone/bind", { proof_token: proofA }, userA.token);
    assert("proof replay rejected", replayProof.status === 400 && replayProof.json.ok === false);

    const signA = await createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }).auth.signInWithPassword({
      email: `${userAName}@metalora.me`,
      password,
    });
    const jwtA = signA.data.session?.access_token;
    const authedClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    if (jwtA && signA.data.session) {
      await authedClient.auth.setSession({
        access_token: jwtA,
        refresh_token: signA.data.session.refresh_token,
      });
    }
    await authedClient
      .from("profiles")
      .update({
        verified_phone_e164: "+821011111111",
        verified_phone_fingerprint: "a".repeat(64),
        phone_verified_at: new Date().toISOString(),
      })
      .eq("id", userA.id);
    const afterClientWrite = await supabaseAdmin
      .from("profiles")
      .select("verified_phone_e164, verified_phone_fingerprint")
      .eq("id", userA.id)
      .maybeSingle();
    assert(
      "client PostgREST cannot modify verified phone fields",
      afterClientWrite.data?.verified_phone_e164 === e164Bind &&
        afterClientWrite.data?.verified_phone_fingerprint === profileA.data?.verified_phone_fingerprint,
    );

    const sendSignup = await postJson(base, "/api/auth/otp/send", { purpose: "signup", phone: phoneSignup });
    assert("signup send anonymous", sendSignup.status === 200 && sendSignup.json.ok === true);
    const otpSignup = adapter.peekForTests()?.otp ?? "";
    const verifySignup = await postJson(base, "/api/auth/otp/verify", {
      purpose: "signup",
      phone: phoneSignup,
      code: otpSignup,
    });
    const proofSignup = typeof verifySignup.json.proof_token === "string" ? verifySignup.json.proof_token : "";
    const bindSignup = await postJson(base, "/api/auth/phone/bind", { proof_token: proofSignup }, userB.token);
    assert("signup proof cannot bind", bindSignup.status === 400);

    const sendRecovery = await postJson(base, "/api/auth/otp/send", { purpose: "recovery", phone: phoneRecovery });
    const otpRecovery = adapter.peekForTests()?.otp ?? "";
    const verifyRecovery = await postJson(base, "/api/auth/otp/verify", {
      purpose: "recovery",
      phone: phoneRecovery,
      code: otpRecovery,
    });
    const proofRecovery =
      typeof verifyRecovery.json.proof_token === "string" ? verifyRecovery.json.proof_token : "";
    const bindRecovery = await postJson(base, "/api/auth/phone/bind", { proof_token: proofRecovery }, userB.token);
    assert("recovery proof cannot bind", bindRecovery.status === 400);

    const sendLink = await postJson(
      base,
      "/api/auth/otp/send",
      { purpose: "identity_link", phone: phoneLink },
      userB.token,
    );
    const otpLink = adapter.peekForTests()?.otp ?? "";
    const verifyLink = await postJson(
      base,
      "/api/auth/otp/verify",
      { purpose: "identity_link", phone: phoneLink, code: otpLink },
      userB.token,
    );
    const proofLink = typeof verifyLink.json.proof_token === "string" ? verifyLink.json.proof_token : "";
    const bindLink = await postJson(base, "/api/auth/phone/bind", { proof_token: proofLink }, userB.token);
    assert("identity_link proof cannot bind", bindLink.status === 400);
    assert(
      "purpose isolation send/verify",
      sendSignup.json.ok === true &&
        verifySignup.json.ok === true &&
        sendRecovery.status === 200 &&
        verifyRecovery.json.ok === true &&
        sendLink.status === 200 &&
        verifyLink.json.ok === true,
    );

    const sendB = await postJson(
      base,
      "/api/auth/otp/send",
      { purpose: "change_phone", phone: phoneBind },
      userB.token,
    );
    const otpB = adapter.peekForTests()?.otp ?? "";
    const verifyB = await postJson(
      base,
      "/api/auth/otp/verify",
      { purpose: "change_phone", phone: phoneBind, code: otpB },
      userB.token,
    );
    const proofB = typeof verifyB.json.proof_token === "string" ? verifyB.json.proof_token : "";
    const bindConflict = await postJson(base, "/api/auth/phone/bind", { proof_token: proofB }, userB.token);
    assert("same verified fingerprint cannot bind two profiles", bindConflict.status === 409);

    const ticketHmacB = otpTicketHmac(apiEnv.OTP_PEPPER, proofB);
    const ticketRow = await supabaseAdmin
      .from("phone_verification_tickets")
      .select("status")
      .eq("ticket_hmac", ticketHmacB)
      .maybeSingle();
    assert(
      "failed unique bind rolls back proof claim",
      ticketRow.data?.status === "issued",
    );
    const profileB = await supabaseAdmin
      .from("profiles")
      .select("verified_phone_e164, phone_number")
      .eq("id", userB.id)
      .maybeSingle();
    assert(
      "losing bind leaves verified phone null and contact unchanged",
      profileB.data?.verified_phone_e164 == null && profileB.data?.phone_number === "010-3333-4444",
    );

    const concurrent = await Promise.all([
      postJson(base, "/api/auth/otp/send", { purpose: "signup", phone: phoneConcurrent }),
      postJson(base, "/api/auth/otp/send", { purpose: "signup", phone: phoneConcurrent }),
    ]);
    const concurrentOk = concurrent.filter((r) => r.status === 200).length;
    const concurrentBusy = concurrent.filter((r) => r.status === 429).length;
    const activeRows = await supabaseAdmin
      .from("otp_challenges")
      .select("id")
      .eq("phone_fingerprint", phoneFingerprint("+821099990005", fpKey))
      .eq("status", "active");
    assert(
      "concurrent send keeps one active challenge",
      concurrentOk === 1 && concurrentBusy === 1 && (activeRows.data?.length ?? 0) === 1,
    );

    const sendWrong = await postJson(base, "/api/auth/otp/send", { purpose: "signup", phone: phoneWrong });
    const otpWrong = adapter.peekForTests()?.otp ?? "999999";
    let lastWrong = { status: 0, json: {} as Record<string, unknown> };
    for (let i = 0; i < 5; i += 1) {
      lastWrong = await postJson(base, "/api/auth/otp/verify", {
        purpose: "signup",
        phone: phoneWrong,
        code: "111111",
      });
    }
    assert("5-attempt burn generic failure", lastWrong.status === 200 && lastWrong.json.ok === false);
    const burned = await postJson(base, "/api/auth/otp/verify", {
      purpose: "signup",
      phone: phoneWrong,
      code: otpWrong,
    });
    assert("burned challenge rejects correct code", burned.status === 200 && burned.json.ok === false);
    const failedRow = await supabaseAdmin
      .from("otp_challenges")
      .select("status")
      .eq("phone_fingerprint", phoneFingerprint("+821099990006", fpKey))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    assert("5th wrong marks failed", failedRow.data?.status === "failed");
    assert("wrong-code path used", sendWrong.status === 200);

    const sendExp = await postJson(base, "/api/auth/otp/send", { purpose: "signup", phone: phoneExpiry });
    const otpExp = adapter.peekForTests()?.otp ?? "";
    await supabaseAdmin
      .from("otp_challenges")
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("phone_fingerprint", phoneFingerprint("+821099990007", fpKey))
      .eq("status", "active");
    const verifyExp = await postJson(base, "/api/auth/otp/verify", {
      purpose: "signup",
      phone: phoneExpiry,
      code: otpExp,
    });
    assert("expiry rejects verify", sendExp.status === 200 && verifyExp.status === 200 && verifyExp.json.ok === false);
    const expRow = await supabaseAdmin
      .from("otp_challenges")
      .select("status")
      .eq("phone_fingerprint", phoneFingerprint("+821099990007", fpKey))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    assert("expired active converted at request time", expRow.data?.status === "expired");

    const throttleFp = phoneFingerprint("+821099990008", fpKey);
    const throttleKey = otpRateKeyHmac(apiEnv.OTP_PEPPER, "otp_send_phone", throttleFp);
    const bucket = fixedWindowBucketStart(Date.now(), 3600);
    const bucketIso = bucket.toISOString();
    for (let i = 0; i < 5; i += 1) {
      await supabaseAdmin.rpc("auth_rate_limit_hit", {
        p_scope: "otp_send_phone",
        p_key_hmac: throttleKey,
        p_window_seconds: 3600,
        p_bucket_started_at: bucketIso,
      });
    }
    const throttledSend = await postJson(base, "/api/auth/otp/send", {
      purpose: "signup",
      phone: phoneThrottle,
    });
    assert("hourly phone throttle", throttledSend.status === 429);

    const leakSecrets = [
      otpA,
      otpSignup,
      otpRecovery,
      otpLink,
      otpB,
      e164Bind,
      "+821099990002",
      fp1,
      profileA.data?.verified_phone_fingerprint ?? "",
      apiEnv.PHONE_IDENTITY_KEY,
      apiEnv.OTP_PEPPER,
      proofA,
    ];
    assert(
      "no OTP/fingerprint/e164/key leakage to logs",
      !capturedLogHasLeak(logs, leakSecrets),
    );

    const forbiddenBind = await authedClient.rpc("phone_bind_change_phone", {
      p_user_id: userA.id,
      p_ticket_hmac: "a".repeat(64),
    });
    assert("bind RPC not granted to anon/authenticated", !!forbiddenBind.error);
  } finally {
    console.log = origLog;
    console.info = origInfo;
    console.warn = origWarn;
    console.error = origError;
    server.close();
    if (fingerprints.length > 0) {
      await supabaseAdmin.from("phone_verification_tickets").delete().in("phone_fingerprint", fingerprints);
      await supabaseAdmin.from("otp_challenges").delete().in("phone_fingerprint", fingerprints);
    }
    for (const id of createdUserIds) {
      await supabaseAdmin.auth.admin.deleteUser(id);
    }
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`verify-2f-slice-a ${failed.length === 0 ? "PASS" : "FAIL"} (${results.length - failed.length}/${results.length})`);
  if (failed.length > 0) {
    for (const item of failed) {
      console.error(`- ${item.name}${item.detail ? `: ${item.detail}` : ""}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("verify-2f-slice-a aborted:", redact(error instanceof Error ? error.message : "unknown"));
  process.exit(1);
});
