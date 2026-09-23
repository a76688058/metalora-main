/**
 * NEW 2F Slice B2 payment-test verification.
 * Applies B2 signup-complete RPCs only.
 * Does NOT apply username-exists revoke, Auth hook, or production unique index.
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
import { MEMBER_PASSWORD_MIN_LEN, memberPasswordError } from "../src/lib/passwordPolicy";
import { registerOtpAuthRoutes } from "../src/lib/otpAuthHandlers";
import { registerPasswordAuthRoutes, SIGNUP_COMPLETE_IP_CAP } from "../src/lib/passwordAuthHandlers";
import { DevCaptureSmsAdapter } from "../src/lib/smsAdapter";
import { configureExpressTrustProxy } from "../src/lib/trustedClientIp";
import { classifyPostgresConnection, isUsableSupabaseDbUrl } from "../src/lib/supabaseHosts";
import { phoneFingerprint } from "../src/lib/phoneHmac";
import { otpRateKeyHmac, otpTicketHmac, fixedWindowBucketStart } from "../src/lib/otpCrypto";
import { sanitizeAuthSecurityMeta, buildAuthSecurityEventRow } from "../src/lib/authSecurityEvents";

const PAYMENT_TEST_REF = "bvihpoorwriejybixmoc";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const B2 = path.join(root, "supabase/migrations/20260924010000_2f_b2_signup_complete.sql");
const DEFERRED = path.join(root, "scripts/sql/deferred-2f-b2-username-exists-revoke.sql");
const UNIQUE = path.join(root, "scripts/sql/payment-test-2f-a-verified-phone-unique.sql");

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
    const tmp = path.join(os.tmpdir(), `metalora-2f-b2-${randomBytes(6).toString("hex")}.sql`);
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

function consents(): { terms: true; privacy: true; cookie: true } {
  return { terms: true, privacy: true, cookie: true };
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
  assert("target is payment-test not production", !classified.isProductionRef);
  const dbUrl = encodeDbUrl(dbUrlRaw);

  const deferredInMigrations = fs
    .readdirSync(path.join(root, "supabase/migrations"))
    .some((name) => name.includes("username_exists") || name.includes("username-exists"));
  assert("deferred revoke is not a shared migration", fs.existsSync(DEFERRED) && !deferredInMigrations);
  assert(
    "production unique-index script stays outside migrations",
    fs.existsSync(UNIQUE) &&
      !fs.readdirSync(path.join(root, "supabase/migrations")).some((name) => name.includes("verified-phone-unique")),
  );
  assert("password policy min is 8", MEMBER_PASSWORD_MIN_LEN === 8 && memberPasswordError("1234567") !== null);
  assert("password policy accepts 8", memberPasswordError("12345678") === null);

  const signupMeta = sanitizeAuthSecurityMeta("signup_complete", {
    username: "alice",
    phone: "01012345678",
    password: "secret-pass",
    proof_token: "a".repeat(64),
  });
  assert("signup_complete meta is empty", JSON.stringify(signupMeta) === "{}");
  const signupRow = buildAuthSecurityEventRow("pepper-for-hmac-not-a-secret-value!!", "127.0.0.1", {
    event: "signup_complete",
    outcome: "accepted",
    requestId: "00000000-0000-0000-0000-000000000002",
  });
  assert(
    "signup_complete row has no request-body fields",
    JSON.stringify(signupRow.meta) === "{}" &&
      signupRow.event === "signup_complete" &&
      !Object.values(signupRow).some(
        (value) => typeof value === "string" && (value.includes("alice") || value.includes("secret-pass")),
      ),
  );

  console.log("APPLY B2 signup-complete RPCs (payment-test only)");
  dbQueryFile(dbUrl, B2);

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

  const anonClaim = await supabasePublic.rpc("signup_claim_proof", { p_ticket_hmac: "a".repeat(64) });
  const anonBind = await supabasePublic.rpc("phone_bind_signup", {
    p_user_id: "00000000-0000-0000-0000-000000000001",
    p_ticket_hmac: "a".repeat(64),
  });
  const anonFail = await supabasePublic.rpc("signup_fail_proof", { p_ticket_hmac: "a".repeat(64) });
  assert("anon cannot execute signup_claim_proof", !!anonClaim.error);
  assert("anon cannot execute phone_bind_signup", !!anonBind.error);
  assert("anon cannot execute signup_fail_proof", !!anonFail.error);

  await supabaseAdmin
    .from("auth_rate_limits")
    .delete()
    .in("scope", [
      "otp_send_ip",
      "otp_send_phone",
      "otp_verify_ip",
      "signup_complete_ip",
      "signup_complete_ticket",
      "signup_complete_fingerprint",
    ]);

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
  const fpKey = apiEnv.PHONE_IDENTITY_KEY;
  const phoneSeed = 2000 + (parseInt(suffix.slice(0, 4), 16) % 7000);
  const phones = {
    happy: `01077${String(phoneSeed).padStart(4, "0")}01`,
    short: `01077${String(phoneSeed).padStart(4, "0")}02`,
    recovery: `01077${String(phoneSeed).padStart(4, "0")}03`,
    change: `01077${String(phoneSeed).padStart(4, "0")}04`,
    link: `01077${String(phoneSeed).padStart(4, "0")}05`,
    replay: `01077${String(phoneSeed).padStart(4, "0")}06`,
    raceA: `01077${String(phoneSeed).padStart(4, "0")}07`,
    raceB: `01077${String(phoneSeed).padStart(4, "0")}08`,
    second: `01077${String(phoneSeed).padStart(4, "0")}09`,
    concurrent: `01077${String(phoneSeed).padStart(4, "0")}10`,
    leftover: `01077${String(phoneSeed).padStart(4, "0")}11`,
    raw: `01077${String(phoneSeed).padStart(4, "0")}12`,
  };
  for (const phone of Object.values(phones)) {
    fingerprints.push(phoneFingerprint(`+82${phone.slice(1)}`, fpKey));
  }

  async function signupProof(phone: string): Promise<string> {
    const send = await postJson(base, "/api/auth/otp/send", { purpose: "signup", phone });
    if (send.status !== 200 || send.json.ok !== true) throw new Error("signup send failed");
    const otp = adapter.peekForTests()?.otp ?? "";
    const verify = await postJson(base, "/api/auth/otp/verify", { purpose: "signup", phone, code: otp });
    const proof = typeof verify.json.proof_token === "string" ? verify.json.proof_token : "";
    if (!/^[0-9a-f]{64}$/.test(proof)) throw new Error("signup proof missing");
    return proof;
  }

  async function profileByUsername(username: string) {
    return supabaseAdmin
      .from("profiles")
      .select("id, user_custom_id, phone_number, verified_phone_e164, verified_phone_fingerprint, phone_verified_at")
      .eq("user_custom_id", username)
      .maybeSingle();
  }

  try {
    const happyName = `sb2h${suffix}`;
    const happyProof = await signupProof(phones.happy);
    const happy = await postJson(base, "/api/auth/signup/complete", {
      proof_token: happyProof,
      username: happyName,
      password,
      full_name: "홍길동",
      consents: consents(),
    });
    assert("valid signup complete", happy.status === 200 && happy.json.ok === true);
    const happyProfile = await profileByUsername(happyName);
    if (happyProfile.data?.id) createdUserIds.push(happyProfile.data.id);
    const happyE164 = `+82${phones.happy.slice(1)}`;
    assert("profile has user_custom_id", happyProfile.data?.user_custom_id === happyName);
    assert("phone_verified_at set", typeof happyProfile.data?.phone_verified_at === "string");
    assert(
      "fingerprint set",
      happyProfile.data?.verified_phone_fingerprint === phoneFingerprint(happyE164, fpKey),
    );
    assert("verified e164 bound", happyProfile.data?.verified_phone_e164 === happyE164);
    assert(
      "contact phone initialized once from verified",
      happyProfile.data?.phone_number ===
        `010-${phones.happy.slice(3, 7)}-${phones.happy.slice(7)}`,
    );

    const login = await supabasePublic.auth.signInWithPassword({
      email: `${happyName}@metalora.me`,
      password,
    });
    assert("password sign-in after trusted signup", !login.error && !!login.data.session);

    const recSend = await postJson(base, "/api/auth/otp/send", { purpose: "recovery", phone: phones.happy });
    const recOtp = adapter.peekForTests()?.otp ?? "";
    const recVerify = await postJson(base, "/api/auth/otp/verify", {
      purpose: "recovery",
      phone: phones.happy,
      code: recOtp,
    });
    const recProof = typeof recVerify.json.proof_token === "string" ? recVerify.json.proof_token : "";
    const recResolve = await postJson(base, "/api/auth/recovery/resolve", { proof_token: recProof });
    assert(
      "recovery-ready after trusted signup",
      recSend.status === 200 &&
        recResolve.status === 200 &&
        recResolve.json.account_kind === "password" &&
        recResolve.json.recoverable_username === happyName &&
        recResolve.json.password_reset_allowed === true,
    );

    const shortProof = await signupProof(phones.short);
    const short7 = await postJson(base, "/api/auth/signup/complete", {
      proof_token: shortProof,
      username: `sb2s${suffix}`,
      password: "1234567",
      full_name: "홍길동",
      consents: consents(),
    });
    assert("password min 7 rejected", short7.status === 400);
    const short8 = await postJson(base, "/api/auth/signup/complete", {
      proof_token: shortProof,
      username: `sb2s${suffix}`,
      password: "12345678",
      full_name: "홍길동",
      consents: consents(),
    });
    assert("password min 8 accepted", short8.status === 200 && short8.json.ok === true);
    const shortProfile = await profileByUsername(`sb2s${suffix}`);
    if (shortProfile.data?.id) createdUserIds.push(shortProfile.data.id);

    const recovSend = await postJson(base, "/api/auth/otp/send", { purpose: "recovery", phone: phones.recovery });
    const recovOtp = adapter.peekForTests()?.otp ?? "";
    const recovVerify = await postJson(base, "/api/auth/otp/verify", {
      purpose: "recovery",
      phone: phones.recovery,
      code: recovOtp,
    });
    const recovProof = typeof recovVerify.json.proof_token === "string" ? recovVerify.json.proof_token : "";
    const recovSignup = await postJson(base, "/api/auth/signup/complete", {
      proof_token: recovProof,
      username: `sb2r${suffix}`,
      password,
      full_name: "홍길동",
      consents: consents(),
    });
    assert("recovery proof cannot signup", recovSignup.status === 400 && recovSend.status === 200);

    const changeUser = await supabaseAdmin.auth.admin.createUser({
      email: `sb2c${suffix}@metalora.me`,
      password,
      email_confirm: true,
      user_metadata: { user_custom_id: `sb2c${suffix}` },
    });
    if (changeUser.data.user?.id) createdUserIds.push(changeUser.data.user.id);
    const changeSession = await supabasePublic.auth.signInWithPassword({
      email: `sb2c${suffix}@metalora.me`,
      password,
    });
    const changeToken = changeSession.data.session?.access_token;
    const changeSend = await postJson(
      base,
      "/api/auth/otp/send",
      { purpose: "change_phone", phone: phones.change },
      changeToken,
    );
    const changeOtp = adapter.peekForTests()?.otp ?? "";
    const changeVerify = await postJson(
      base,
      "/api/auth/otp/verify",
      { purpose: "change_phone", phone: phones.change, code: changeOtp },
      changeToken,
    );
    const changeProof = typeof changeVerify.json.proof_token === "string" ? changeVerify.json.proof_token : "";
    const changeSignup = await postJson(base, "/api/auth/signup/complete", {
      proof_token: changeProof,
      username: `sb2x${suffix}`,
      password,
      full_name: "홍길동",
      consents: consents(),
    });
    assert("change_phone proof cannot signup", changeSignup.status === 400 && changeSend.status === 200);

    const linkSend = await postJson(
      base,
      "/api/auth/otp/send",
      { purpose: "identity_link", phone: phones.link },
      changeToken,
    );
    const linkOtp = adapter.peekForTests()?.otp ?? "";
    const linkVerify = await postJson(
      base,
      "/api/auth/otp/verify",
      { purpose: "identity_link", phone: phones.link, code: linkOtp },
      changeToken,
    );
    const linkProof = typeof linkVerify.json.proof_token === "string" ? linkVerify.json.proof_token : "";
    const linkSignup = await postJson(base, "/api/auth/signup/complete", {
      proof_token: linkProof,
      username: `sb2l${suffix}`,
      password,
      full_name: "홍길동",
      consents: consents(),
    });
    assert("identity_link proof cannot signup", linkSignup.status === 400 && linkSend.status === 200);
    assert("wrong purpose proofs rejected", recovSignup.json.ok !== true && changeSignup.json.ok !== true);

    const replayName = `sb2p${suffix}`;
    const replayProof = await signupProof(phones.replay);
    const replayFirst = await postJson(base, "/api/auth/signup/complete", {
      proof_token: replayProof,
      username: replayName,
      password,
      full_name: "홍길동",
      consents: consents(),
    });
    const replaySecond = await postJson(base, "/api/auth/signup/complete", {
      proof_token: replayProof,
      username: `sb2q${suffix}`,
      password,
      full_name: "홍길동",
      consents: consents(),
    });
    assert("signup complete first succeeds", replayFirst.status === 200);
    assert("signup proof replay rejected", replaySecond.status === 400);
    const replayProfile = await profileByUsername(replayName);
    if (replayProfile.data?.id) createdUserIds.push(replayProfile.data.id);
    const replayOther = await profileByUsername(`sb2q${suffix}`);
    assert("replay did not create second user", !replayOther.data?.id);

    const raceName = `sb2u${suffix}`;
    const raceProofA = await signupProof(phones.raceA);
    const raceProofB = await signupProof(phones.raceB);
    const raceBody = (proof: string) => ({
      proof_token: proof,
      username: raceName,
      password,
      full_name: "홍길동",
      consents: consents(),
    });
    const raced = await Promise.all([
      postJson(base, "/api/auth/signup/complete", raceBody(raceProofA)),
      postJson(base, "/api/auth/signup/complete", raceBody(raceProofB)),
    ]);
    const raceOk = raced.filter((r) => r.status === 200).length;
    const raceConflict = raced.filter((r) => r.status === 409 && r.json.conflict === "username").length;
    assert("username race creates one account", raceOk === 1);
    assert("username race rejects the other safely", raceConflict === 1 || raced.filter((r) => r.status !== 200).length === 1);
    const raceProfile = await profileByUsername(raceName);
    if (raceProfile.data?.id) createdUserIds.push(raceProfile.data.id);

    const second = await postJson(base, "/api/auth/signup/complete", {
      proof_token: await signupProof(phones.happy),
      username: `sb2d${suffix}`,
      password,
      full_name: "홍길동",
      consents: consents(),
    });
    assert(
      "same verified phone second signup rejected",
      second.status === 409 && second.json.conflict === "phone" && second.json.ok === false,
    );
    const secondProfile = await profileByUsername(`sb2d${suffix}`);
    assert("phone conflict left no second account", !secondProfile.data?.id);

    const concProof1 = await signupProof(phones.concurrent);
    const concProof2 = await signupProof(phones.concurrent);
    const concA = `sb2a${suffix}`;
    const concB = `sb2b${suffix}`;
    const conc = await Promise.all([
      postJson(base, "/api/auth/signup/complete", {
        proof_token: concProof1,
        username: concA,
        password,
        full_name: "홍길동",
        consents: consents(),
      }),
      postJson(base, "/api/auth/signup/complete", {
        proof_token: concProof2,
        username: concB,
        password,
        full_name: "홍길동",
        consents: consents(),
      }),
    ]);
    const concOk = conc.filter((r) => r.status === 200).length;
    const concPhone = conc.filter((r) => r.status === 409 && r.json.conflict === "phone").length;
    assert("concurrent same-phone one bind wins", concOk === 1);
    assert("concurrent same-phone loser cleaned or rejected", concOk + concPhone === 2 || conc.filter((r) => r.status !== 200).length >= 1);
    const concProfA = await profileByUsername(concA);
    const concProfB = await profileByUsername(concB);
    if (concProfA.data?.id) createdUserIds.push(concProfA.data.id);
    if (concProfB.data?.id) createdUserIds.push(concProfB.data.id);
    const bound = [concProfA.data, concProfB.data].filter((row) => row?.verified_phone_fingerprint);
    assert("bind-failure leftover is unverified or deleted", bound.length <= 1);
    const leftoverUnverified = [concProfA.data, concProfB.data].filter(
      (row) => row?.id && !row.verified_phone_fingerprint,
    );
    assert(
      "cleanup failure fail-closed unverified",
      leftoverUnverified.every((row) => row?.phone_verified_at == null && !row?.verified_phone_e164),
    );

    const leftoverName = `sb2z${suffix}`;
    const leftoverCreated = await supabaseAdmin.auth.admin.createUser({
      email: `${leftoverName}@metalora.me`,
      password,
      email_confirm: true,
      user_metadata: { user_custom_id: leftoverName, full_name: "잔여" },
    });
    if (leftoverCreated.data.user?.id) createdUserIds.push(leftoverCreated.data.user.id);
    const leftoverProfile = await profileByUsername(leftoverName);
    assert(
      "auth-create without bind is not verified",
      leftoverProfile.data?.user_custom_id === leftoverName && leftoverProfile.data?.verified_phone_e164 == null,
    );

    const replayConcurrentProof = await signupProof(phones.leftover);
    const replayName2 = `sb2m${suffix}`;
    const bodyReplay = {
      proof_token: replayConcurrentProof,
      username: replayName2,
      password,
      full_name: "홍길동",
      consents: consents(),
    };
    const lost = await Promise.all([
      postJson(base, "/api/auth/signup/complete", bodyReplay),
      postJson(base, "/api/auth/signup/complete", bodyReplay),
    ]);
    const lostOk = lost.filter((r) => r.status === 200).length;
    assert("response-loss concurrent replay creates one user", lostOk === 1);
    assert("response-loss second is terminal", lost.filter((r) => r.status !== 200).length === 1);
    const lostProfile = await profileByUsername(replayName2);
    if (lostProfile.data?.id) createdUserIds.push(lostProfile.data.id);

    const throttleKey = otpRateKeyHmac(apiEnv.OTP_PEPPER, "signup_complete_ip", "127.0.0.1");
    const bucket = fixedWindowBucketStart(Date.now(), 3600);
    await supabaseAdmin
      .from("auth_rate_limits")
      .delete()
      .eq("scope", "signup_complete_ip")
      .eq("key_hmac", throttleKey);
    for (let i = 0; i < SIGNUP_COMPLETE_IP_CAP; i += 1) {
      await supabaseAdmin.rpc("auth_rate_limit_hit", {
        p_scope: "signup_complete_ip",
        p_key_hmac: throttleKey,
        p_window_seconds: 3600,
        p_bucket_started_at: bucket.toISOString(),
      });
    }
    const throttled = await postJson(base, "/api/auth/signup/complete", {
      proof_token: "a".repeat(64),
      username: `sb2t${suffix}`,
      password,
      full_name: "홍길동",
      consents: consents(),
    });
    assert("signup-complete IP rate limit", throttled.status === 429);

    const rawName = `sb2w${suffix}`;
    const rawSignUp = await supabasePublic.auth.signUp({
      email: `${rawName}@metalora.me`,
      password,
      options: { data: { user_custom_id: rawName, full_name: "raw" } },
    });
    assert("public browser signUp still open", !rawSignUp.error && !!rawSignUp.data.user);
    if (rawSignUp.data.user?.id) createdUserIds.push(rawSignUp.data.user.id);

    const leak = [password, happyProof, replayProof, phones.happy, happyE164, fpKey, apiEnv.OTP_PEPPER, recProof];
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
      await supabaseAdmin.from("phone_verification_tickets").delete().in("phone_fingerprint", fingerprints);
      await supabaseAdmin.from("otp_challenges").delete().in("phone_fingerprint", fingerprints);
    }
    for (const id of [...new Set(createdUserIds)]) {
      await supabaseAdmin.auth.admin.deleteUser(id);
    }
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`verify-2f-slice-b2 ${failed.length === 0 ? "PASS" : "FAIL"} (${results.length - failed.length}/${results.length})`);
  if (failed.length > 0) {
    for (const item of failed) console.error(`- ${item.name}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("verify-2f-slice-b2 aborted:", redact(error instanceof Error ? error.message : "unknown"));
  process.exit(1);
});
