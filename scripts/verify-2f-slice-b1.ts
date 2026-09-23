/**
 * NEW 2F Slice B1 payment-test verification.
 * Applies B1-1 recovery/password foundation only.
 * Does NOT apply deferred username-exists revoke.
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
import { classifyAccountKind, recoverableUsernameForKind } from "../src/lib/accountKind";
import { OTP_TICKET_TTL_SECONDS } from "../src/lib/otpCrypto";
import { MEMBER_PASSWORD_MIN_LEN, memberPasswordError } from "../src/lib/passwordPolicy";
import { registerOtpAuthRoutes } from "../src/lib/otpAuthHandlers";
import { registerPasswordAuthRoutes } from "../src/lib/passwordAuthHandlers";
import { DevCaptureSmsAdapter } from "../src/lib/smsAdapter";
import {
  configureExpressTrustProxy,
  trustedClientIp,
  UNKNOWN_CLIENT_IP,
} from "../src/lib/trustedClientIp";
import { classifyPostgresConnection, isUsableSupabaseDbUrl } from "../src/lib/supabaseHosts";

const PAYMENT_TEST_REF = "bvihpoorwriejybixmoc";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const B1 = path.join(root, "supabase/migrations/20260923223000_2f_b1_recovery_password_foundation.sql");
const DEFERRED = path.join(root, "scripts/sql/deferred-2f-b2-username-exists-revoke.sql");

type TestResult = { name: string; pass: boolean };
const results: TestResult[] = [];
const fingerprints: string[] = [];
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
  const result = spawnSync(
    process.execPath,
    [npxCli, "--yes", "supabase", "db", "query", "--db-url", dbUrl, "--file", filePath],
    { encoding: "utf8", maxBuffer: 10_000_000, windowsHide: true, env: process.env },
  );
  if (result.status !== 0) {
    throw new Error(redact(result.stderr || result.stdout || "db query failed"));
  }
  return result.stdout ?? "";
}

function dbQueryFile(dbUrl: string, filePath: string): void {
  const statements = splitSqlStatements(fs.readFileSync(filePath, "utf8"));
  for (let i = 0; i < statements.length; i += 1) {
    const stmt = statements[i]!;
    console.log(`SQL ${i + 1}/${statements.length} ${stmt.split(/\s+/).slice(0, 4).join(" ")}`);
    const tmp = path.join(os.tmpdir(), `metalora-2f-b1-${randomBytes(6).toString("hex")}.sql`);
    fs.writeFileSync(tmp, `${stmt};`, "utf8");
    try {
      dbQueryOne(dbUrl, tmp);
    } finally {
      fs.unlinkSync(tmp);
    }
  }
}

async function postJson(
  base: string,
  route: string,
  body: unknown,
  token?: string,
  extraHeaders?: Record<string, string>,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${base}${route}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
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
  const dbUrl = encodeDbUrl(dbUrlRaw);

  const deferredInMigrations = fs
    .readdirSync(path.join(root, "supabase/migrations"))
    .some((name) => name.includes("username_exists") || name.includes("username-exists"));
  assert("deferred revoke is not a shared migration", fs.existsSync(DEFERRED) && !deferredInMigrations);
  assert("deferred revoke file exists", fs.readFileSync(DEFERRED, "utf8").includes("REVOKE ALL"));

  assert("password policy min is 8", MEMBER_PASSWORD_MIN_LEN === 8 && memberPasswordError("1234567") !== null);
  assert("password policy accepts 8", memberPasswordError("12345678") === null);

  assert("recovery session TTL is 10 minutes", OTP_TICKET_TTL_SECONDS === 600);
  assert(
    "classifier uses metalora email as password evidence; never recover ml…",
    classifyAccountKind({
      userCustomId: "alice",
      authEmail: "alice@metalora.me",
      providers: ["email"],
    }) === "password" &&
      classifyAccountKind({
        userCustomId: "mlabcd12",
        authEmail: "mlabcd12@example.com",
        providers: ["email"],
      }) === "social" &&
      classifyAccountKind({
        userCustomId: "mlabcd12",
        authEmail: "mlabcd12@metalora.me",
        providers: ["email"],
      }) === "password" &&
      recoverableUsernameForKind("password", "mlabcd12") === null &&
      recoverableUsernameForKind("social", "mlabcd12") === null,
  );

  assert(
    "local spoofed XFF ignored",
    trustedClientIp(
      {
        ip: "8.8.8.8",
        headers: { "x-forwarded-for": "8.8.8.8, 1.1.1.1" },
        socket: { remoteAddress: "127.0.0.1" },
      },
      "local",
    ) === "127.0.0.1",
  );
  assert(
    "production uses req.ip not leftmost XFF",
    trustedClientIp(
      {
        ip: "203.0.113.9",
        headers: { "x-forwarded-for": "8.8.8.8, 203.0.113.9" },
        socket: { remoteAddress: "10.0.0.2" },
      },
      "production",
    ) === "203.0.113.9",
  );
  assert(
    "unknown IP fallback",
    trustedClientIp({ headers: { "x-forwarded-for": "8.8.8.8" } }, "local") === UNKNOWN_CLIENT_IP,
  );
  assert(
    "ipv4-mapped ipv6 normalized",
    trustedClientIp({ socket: { remoteAddress: "::ffff:127.0.0.1" } }, "local") === "127.0.0.1",
  );
  assert(
    "local ipv6 uses socket not XFF",
    trustedClientIp(
      {
        ip: "8.8.8.8",
        headers: { "x-forwarded-for": "8.8.8.8" },
        socket: { remoteAddress: "2001:db8::1" },
      },
      "local",
    ) === "2001:db8::1",
  );
  assert(
    "production ipv6 uses req.ip",
    trustedClientIp(
      {
        ip: "2001:db8::9",
        headers: { "x-forwarded-for": "2001:db8::1, 2001:db8::9" },
        socket: { remoteAddress: "10.0.0.2" },
      },
      "production",
    ) === "2001:db8::9",
  );

  console.log("APPLY B1-1 recovery/password foundation (payment-test only)");
  dbQueryFile(dbUrl, B1);

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

  const stillOpen = await supabasePublic.rpc("profiles_username_exists", { username: "nobody-xyz" });
  assert("anonymous username enumeration STILL OPEN TEMPORARILY", stillOpen.error == null);

  await supabaseAdmin
    .from("auth_rate_limits")
    .delete()
    .in("scope", [
      "otp_send_ip",
      "otp_send_phone",
      "otp_verify_ip",
      "recovery_resolve_ip",
      "password_reset_ip",
      "password_change_ip_user",
      "signup_username_check_ip",
    ]);

  const tablesOk = (
    await Promise.all([
      supabaseAdmin.from("recovery_sessions").select("id").limit(1),
      supabaseAdmin.from("password_reset_tickets").select("id").limit(1),
      supabaseAdmin.from("auth_security_events").select("id").limit(1),
    ])
  ).every((r) => !r.error);
  assert("B1 tables present for service_role", tablesOk);

  const rlsSession = await supabasePublic.from("recovery_sessions").select("id").limit(1);
  const rlsTicket = await supabasePublic.from("password_reset_tickets").select("id").limit(1);
  const rlsEvents = await supabasePublic.from("auth_security_events").select("id").limit(1);
  assert(
    "anon RLS denies recovery/reset/events",
    !!rlsSession.error && !!rlsTicket.error && !!rlsEvents.error,
  );
  const anonClaim = await supabasePublic.rpc("password_reset_claim_by_session", {
    p_session_hmac: "a".repeat(64),
  });
  assert("anon cannot execute password_reset_claim_by_session", !!anonClaim.error);
  const anonResolveRpc = await supabasePublic.rpc("recovery_consume_and_open_session", {
    p_proof_ticket_hmac: "a".repeat(64),
    p_session_hmac: "b".repeat(64),
    p_reset_ticket_hmac: null,
    p_user_id: null,
    p_account_kind: "none",
    p_request_id: "00000000-0000-0000-0000-000000000000",
    p_expires_at: new Date().toISOString(),
  });
  assert("anon cannot execute recovery_consume_and_open_session", !!anonResolveRpc.error);

  const adapter = new DevCaptureSmsAdapter();
  const logs: string[] = [];
  const orig = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  const tap = (fn: typeof console.log) =>
    (...args: unknown[]) => {
      logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
      fn(...args);
    };
  console.log = tap(orig.log);
  console.info = tap(orig.info);
  console.warn = tap(orig.warn);
  console.error = tap(orig.error);

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

  const password = `Aa1!${randomBytes(12).toString("base64url")}xx`;
  const suffix = randomBytes(3).toString("hex");

  async function createMember(username: string, email?: string): Promise<{ id: string; token: string; email: string }> {
    const mail = email ?? `${username}@metalora.me`;
    const created = await supabaseAdmin.auth.admin.createUser({
      email: mail,
      password,
      email_confirm: true,
      user_metadata: { user_custom_id: username },
    });
    if (created.error || !created.data.user) throw new Error("createUser failed");
    createdUserIds.push(created.data.user.id);
    const session = await supabasePublic.auth.signInWithPassword({ email: mail, password });
    const token = session.data.session?.access_token;
    if (!token) throw new Error("signIn failed");
    return { id: created.data.user.id, token, email: mail };
  }

  async function bindPhone(token: string, phone: string): Promise<void> {
    const send = await postJson(base, "/api/auth/otp/send", { purpose: "change_phone", phone }, token);
    if (send.status !== 200) throw new Error("bind send failed");
    const otp = adapter.peekForTests()?.otp ?? "";
    const verify = await postJson(
      base,
      "/api/auth/otp/verify",
      { purpose: "change_phone", phone, code: otp },
      token,
    );
    const proof = typeof verify.json.proof_token === "string" ? verify.json.proof_token : "";
    const bind = await postJson(base, "/api/auth/phone/bind", { proof_token: proof }, token);
    if (bind.status !== 200) throw new Error("bind failed");
  }

  async function recoveryProof(phone: string): Promise<string> {
    await postJson(base, "/api/auth/otp/send", { purpose: "recovery", phone });
    const otp = adapter.peekForTests()?.otp ?? "";
    const verify = await postJson(base, "/api/auth/otp/verify", {
      purpose: "recovery",
      phone,
      code: otp,
    });
    return typeof verify.json.proof_token === "string" ? verify.json.proof_token : "";
  }

  try {
    const userA = await createMember(`slba${suffix}`);
    const socialName = `ml${suffix}aa`;
    const social = await createMember(socialName, `ml${suffix}@example.com`);
    const phoneSeed = 1000 + (parseInt(suffix.slice(0, 4), 16) % 8000);
    const phoneA = `01066${String(phoneSeed).padStart(4, "0")}01`;
    const phoneSocial = `01066${String(phoneSeed).padStart(4, "0")}02`;
    const phoneNone = `01066${String(phoneSeed).padStart(4, "0")}03`;
    const phoneFail = `01066${String(phoneSeed).padStart(4, "0")}04`;
    const phoneStale = `01066${String(phoneSeed).padStart(4, "0")}05`;
    const phoneExp = `01066${String(phoneSeed).padStart(4, "0")}06`;
    await bindPhone(userA.token, phoneA);
    await bindPhone(social.token, phoneSocial);

    const checkAvail = await postJson(base, "/api/auth/signup/username-check", { username: `newu${suffix}` });
    const checkTaken = await postJson(base, "/api/auth/signup/username-check", { username: `slba${suffix}` });
    assert("username-check available", checkAvail.status === 200 && checkAvail.json.available === true);
    assert("username-check unavailable", checkTaken.status === 200 && checkTaken.json.available === false);
    assert(
      "username-check returns only availability",
      checkAvail.json.ok === true &&
        Object.keys(checkAvail.json).sort().join(",") === "available,ok",
    );

    const preOtp = await postJson(base, "/api/auth/recovery/resolve", { proof_token: "a".repeat(64) });
    assert(
      "recovery pre-OTP / invalid proof does not reveal account",
      preOtp.status === 400 && preOtp.json.account_kind == null && preOtp.json.recoverable_username == null,
    );

    const proofA = await recoveryProof(phoneA);
    const resolveA = await postJson(base, "/api/auth/recovery/resolve", { proof_token: proofA });
    assert(
      "recovery resolve password account",
      resolveA.status === 200 &&
        resolveA.json.account_kind === "password" &&
        resolveA.json.recoverable_username === `slba${suffix}` &&
        resolveA.json.password_reset_allowed === true &&
        resolveA.json.user_id == null,
    );
    const replay = await postJson(base, "/api/auth/recovery/resolve", { proof_token: proofA });
    assert("recovery proof replay rejected", replay.status === 400);
    const sessionA = typeof resolveA.json.recovery_session_token === "string" ? resolveA.json.recovery_session_token : "";

    const shortReset = await postJson(base, "/api/auth/password-reset", {
      recovery_session_token: sessionA,
      new_password: "1234567",
    });
    assert("reset rejects 7 chars", shortReset.status === 400);

    const newPass = `Bb2!${randomBytes(10).toString("base64url")}yy`;
    const oldSessionClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const oldLogin = await oldSessionClient.auth.signInWithPassword({
      email: userA.email,
      password,
    });
    const oldRefresh = oldLogin.data.session?.refresh_token ?? "";

    const concurrent = await Promise.all([
      postJson(base, "/api/auth/password-reset", { recovery_session_token: sessionA, new_password: newPass }),
      postJson(base, "/api/auth/password-reset", { recovery_session_token: sessionA, new_password: newPass }),
    ]);
    const concurrentOk = concurrent.filter((r) => r.status === 200).length;
    const concurrentBad = concurrent.filter((r) => r.status !== 200).length;
    assert("reset one-time / concurrent second rejected", concurrentOk === 1 && concurrentBad === 1);

    const oldPw = await supabasePublic.auth.signInWithPassword({ email: userA.email, password });
    assert("old password fails after reset", !!oldPw.error);
    const newPw = await supabasePublic.auth.signInWithPassword({ email: userA.email, password: newPass });
    assert("new password works after reset", !newPw.error && !!newPw.data.session);
    if (oldRefresh) {
      const refresh = await oldSessionClient.auth.refreshSession({ refresh_token: oldRefresh });
      assert("global signout invalidates old refresh", !!refresh.error);
    } else {
      assert("global signout invalidates old refresh", false);
    }

    const proofSocial = await recoveryProof(phoneSocial);
    const resolveSocial = await postJson(base, "/api/auth/recovery/resolve", { proof_token: proofSocial });
    assert(
      "social resolve hides internal username",
      resolveSocial.status === 200 &&
        resolveSocial.json.account_kind === "social" &&
        resolveSocial.json.recoverable_username == null &&
        resolveSocial.json.password_reset_allowed === false &&
        resolveSocial.json.recoverable_username !== socialName,
    );
    const resetSocial = await postJson(base, "/api/auth/password-reset", {
      recovery_session_token: resolveSocial.json.recovery_session_token,
      new_password: newPass,
    });
    assert("social cannot password-reset", resetSocial.status === 400);

    const proofNone = await recoveryProof(phoneNone);
    const resolveNone = await postJson(base, "/api/auth/recovery/resolve", { proof_token: proofNone });
    assert(
      "none result after unmatched proof",
      resolveNone.status === 200 &&
        resolveNone.json.account_kind === "none" &&
        resolveNone.json.password_reset_allowed === false &&
        resolveNone.json.recoverable_username == null,
    );

    const changeShort = await postJson(
      base,
      "/api/auth/password-change",
      { current_password: newPass, new_password: "1234567" },
      newPw.data.session?.access_token,
    );
    assert("change rejects 7 chars", changeShort.status === 400);
    const changeWrong = await postJson(
      base,
      "/api/auth/password-change",
      { current_password: "wrong-password-xx", new_password: `${newPass}zz` },
      newPw.data.session?.access_token,
    );
    assert("change rejects wrong current password", changeWrong.status === 400);

    const newerPass = `${newPass}QQ`;
    const changeOk = await postJson(
      base,
      "/api/auth/password-change",
      { current_password: newPass, new_password: newerPass },
      newPw.data.session?.access_token,
    );
    assert("password change succeeds", changeOk.status === 200);
    const afterChangeOld = await supabasePublic.auth.signInWithPassword({
      email: userA.email,
      password: newPass,
    });
    const afterChangeNew = await supabasePublic.auth.signInWithPassword({
      email: userA.email,
      password: newerPass,
    });
    assert("change global signout / old password fails", !!afterChangeOld.error);
    assert("change new password works", !afterChangeNew.error);

    const socialChange = await postJson(
      base,
      "/api/auth/password-change",
      { current_password: password, new_password: newerPass },
      social.token,
    );
    assert("social-shaped password-change rejected", socialChange.status === 400);

    const failUser = await createMember(`slbf${suffix}`);
    await bindPhone(failUser.token, phoneFail);
    const proofFail = await recoveryProof(phoneFail);
    const resolveFail = await postJson(base, "/api/auth/recovery/resolve", { proof_token: proofFail });
    const failSession =
      typeof resolveFail.json.recovery_session_token === "string" ? resolveFail.json.recovery_session_token : "";
    await supabaseAdmin.auth.admin.deleteUser(failUser.id);
    createdUserIds.splice(createdUserIds.indexOf(failUser.id), 1);
    const failReset = await postJson(base, "/api/auth/password-reset", {
      recovery_session_token: failSession,
      new_password: newerPass,
    });
    assert("reset after user delete does not succeed", failReset.status === 400);

    const staleUser = await createMember(`slbs${suffix}`);
    await bindPhone(staleUser.token, phoneStale);
    const proofStale = await recoveryProof(phoneStale);
    const resolveStale = await postJson(base, "/api/auth/recovery/resolve", { proof_token: proofStale });
    const staleSession =
      typeof resolveStale.json.recovery_session_token === "string" ? resolveStale.json.recovery_session_token : "";
    await supabaseAdmin
      .from("password_reset_tickets")
      .update({
        status: "claimed",
        claimed_at: new Date(Date.now() - 120_000).toISOString(),
      })
      .eq("user_id", staleUser.id)
      .eq("status", "issued");
    await supabaseAdmin.rpc("password_reset_mark_stale_claimed");
    const staleRow = await supabaseAdmin
      .from("password_reset_tickets")
      .select("status")
      .eq("user_id", staleUser.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    assert("stale claim becomes indeterminate", staleRow.data?.status === "indeterminate");
    const staleReset = await postJson(base, "/api/auth/password-reset", {
      recovery_session_token: staleSession,
      new_password: newerPass,
    });
    assert("indeterminate ticket never reopened", staleReset.status === 400);

    const expireUser = await createMember(`slbe${suffix}`);
    await bindPhone(expireUser.token, phoneExp);
    const proofExp = await recoveryProof(phoneExp);
    const resolveExp = await postJson(base, "/api/auth/recovery/resolve", { proof_token: proofExp });
    const expSession =
      typeof resolveExp.json.recovery_session_token === "string" ? resolveExp.json.recovery_session_token : "";
    await supabaseAdmin
      .from("recovery_sessions")
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("user_id", expireUser.id)
      .eq("status", "issued");
    const expReset = await postJson(base, "/api/auth/password-reset", {
      recovery_session_token: expSession,
      new_password: newerPass,
    });
    assert("expired recovery session rejected", expReset.status === 400);

    const leak = [password, newPass, newerPass, proofA, sessionA, phoneA];
    assert(
      "no sensitive values in logs",
      !logs.some((line) => leak.some((secret) => secret && line.includes(secret))),
    );
  } finally {
    console.log = orig.log;
    console.info = orig.info;
    console.warn = orig.warn;
    console.error = orig.error;
    server.close();
    if (fingerprints.length > 0) {
      await supabaseAdmin.from("otp_challenges").delete().in("phone_fingerprint", fingerprints);
    }
    for (const id of createdUserIds) {
      await supabaseAdmin.auth.admin.deleteUser(id);
    }
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`verify-2f-slice-b1 ${failed.length === 0 ? "PASS" : "FAIL"} (${results.length - failed.length}/${results.length})`);
  if (failed.length > 0) {
    for (const item of failed) console.error(`- ${item.name}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("verify-2f-slice-b1 aborted:", redact(error instanceof Error ? error.message : "unknown"));
  process.exit(1);
});
