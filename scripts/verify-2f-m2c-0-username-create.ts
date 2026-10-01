/**
 * M2C-0 NEW password username creation charset.
 * Payment-test only. Applies handle_new_user alphanumeric-only for @metalora.me.
 * Does not create customers. Does not mutate production. Does not edit A3 UX.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "os";
import path from "path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import { generateInternalSocialUsername } from "../src/lib/internalSocialUsername";
import { USABLE_MEMBER_PROFILE_COLUMNS } from "../src/lib/authIntegrity";
import {
  GENERATED_SOCIAL_USERNAME_RE,
  MEMBER_USERNAME_LEGACY_LOOKUP_RE,
  MEMBER_USERNAME_MAX_LEN,
  MEMBER_USERNAME_MIN_LEN,
  MEMBER_USERNAME_RE,
  memberAuthEmail,
  memberUsernameSignupError,
} from "../src/lib/memberUsername";
import { registerOtpAuthRoutes } from "../src/lib/otpAuthHandlers";
import { registerPasswordAuthRoutes } from "../src/lib/passwordAuthHandlers";
import { registerSocialAuthRoutes } from "../src/lib/socialAuthHandlers";
import { DevCaptureSmsAdapter } from "../src/lib/smsAdapter";
import { configureExpressTrustProxy } from "../src/lib/trustedClientIp";
import {
  classifyPostgresConnection,
  isUsableSupabaseDbUrl,
  PRODUCTION_SUPABASE_REF,
} from "../src/lib/supabaseHosts";

const PAYMENT_TEST_REF = "bvihpoorwriejybixmoc";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const HANDLE_SQL = path.join(root, "supabase/migrations/20260930193000_2f_m2c0_password_username_alnum.sql");
const C10A_SQL = path.join(root, "supabase/migrations/20260928160000_2f_c1_0a_login_capability.sql");
const GENERIC_BAD = "요청을 처리할 수 없습니다.";

type TestResult = { name: string; pass: boolean };
const results: TestResult[] = [];

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

function dbQueryOne(dbUrl: string, filePath: string): string {
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

function dbQueryFile(dbUrl: string, filePath: string): string {
  const statements = splitSqlStatements(fs.readFileSync(filePath, "utf8"));
  let combined = "";
  for (let i = 0; i < statements.length; i += 1) {
    const stmt = statements[i]!;
    console.log(`SQL ${i + 1}/${statements.length} ${stmt.split(/\s+/).slice(0, 6).join(" ")}`);
    const tmp = path.join(os.tmpdir(), `metalora-m2c0-${randomBytes(6).toString("hex")}.sql`);
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
  const tmp = path.join(os.tmpdir(), `metalora-m2c0-${randomBytes(8).toString("hex")}.sql`);
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
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${base}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, json };
}

function sliceFn(src: string, startNeedle: string, endNeedle: string): string {
  const start = src.indexOf(startNeedle);
  const end = src.indexOf(endNeedle, start + startNeedle.length);
  if (start < 0 || end < 0) return "";
  return src.slice(start, end);
}

async function main(): Promise<void> {
  const usernameSrc = fs.readFileSync(path.join(root, "src/lib/memberUsername.ts"), "utf8");
  const passwordSrc = fs.readFileSync(path.join(root, "src/lib/passwordAuthHandlers.ts"), "utf8");
  const socialSrc = fs.readFileSync(path.join(root, "src/lib/socialAuthHandlers.ts"), "utf8");
  const integritySrc = fs.readFileSync(path.join(root, "src/lib/authIntegrity.ts"), "utf8");
  const paymentSrc = fs.readFileSync(path.join(root, "src/lib/paymentMemberAuth.ts"), "utf8");
  const loginModal = fs.readFileSync(path.join(root, "src/components/LoginModal.tsx"), "utf8");
  const handleSql = fs.readFileSync(HANDLE_SQL, "utf8");
  const loginFn = sliceFn(loginModal, "const handleLogin = async", "const sendOtp");

  assert(
    "new creation regex is alphanumeric 4–32",
    MEMBER_USERNAME_RE.source === "^[A-Za-z0-9]{4,32}$" &&
      usernameSrc.includes("export const MEMBER_USERNAME_RE = /^[A-Za-z0-9]{4,32}$/;"),
  );
  assert(
    "legacy lookup regex kept for historical punctuation",
    MEMBER_USERNAME_LEGACY_LOOKUP_RE.source === "^[A-Za-z0-9][A-Za-z0-9._-]{3,31}$",
  );
  assert("length bounds UNCHANGED", MEMBER_USERNAME_MIN_LEN === 4 && MEMBER_USERNAME_MAX_LEN === 32);
  assert("stored username still lowercases", usernameSrc.includes(".toLowerCase()"));

  const valid = ["abcd", "test11", "Metalora2026", "A".repeat(32), "mlabcd12ef99"];
  const invalid: Array<[string, string]> = [
    ["abc", "아이디는 4자 이상으로 입력해주세요."],
    ["가나다라", "아이디는 영문과 숫자만 사용할 수 있습니다."],
    ["abc.def", "아이디는 영문과 숫자만 사용할 수 있습니다."],
    ["abc_def", "아이디는 영문과 숫자만 사용할 수 있습니다."],
    ["abc-def", "아이디는 영문과 숫자만 사용할 수 있습니다."],
    ["abc@", "아이디는 영문과 숫자만 사용할 수 있습니다."],
    ["ab cd", "아이디는 영문과 숫자만 사용할 수 있습니다."],
    ["a".repeat(33), "아이디는 32자 이하로 입력해주세요."],
  ];
  assert(
    "creation accepts alphanumeric 4–32 including mixed case",
    valid.every((value) => memberUsernameSignupError(value) === null && MEMBER_USERNAME_RE.test(value)),
  );
  assert(
    "creation rejects punctuation Hangul space short and oversize",
    invalid.every(([value, message]) => memberUsernameSignupError(value) === message),
  );
  assert(
    "legacy lookup still accepts dot underscore hyphen",
    MEMBER_USERNAME_LEGACY_LOOKUP_RE.test("abc.def") &&
      MEMBER_USERNAME_LEGACY_LOOKUP_RE.test("abc_def") &&
      MEMBER_USERNAME_LEGACY_LOOKUP_RE.test("abc-def") &&
      !MEMBER_USERNAME_RE.test("abc.def") &&
      !MEMBER_USERNAME_RE.test("abc_def") &&
      !MEMBER_USERNAME_RE.test("abc-def"),
  );
  assert(
    "login email construction still accepts legacy punctuation",
    memberAuthEmail("abc.def") === "abc.def@metalora.me" &&
      memberAuthEmail("Abc_Def") === "abc_def@metalora.me",
  );

  const generated = generateInternalSocialUsername();
  assert(
    "internal social username still ml+10 and creation-valid",
    generated.length === 12 &&
      GENERATED_SOCIAL_USERNAME_RE.test(generated) &&
      MEMBER_USERNAME_RE.test(generated) &&
      memberUsernameSignupError(generated) === null,
  );

  assert(
    "username-check and signup/complete use creation validator",
    passwordSrc.includes("memberUsernameSignupError(username)") &&
      passwordSrc.includes("memberUsernameSignupError(body.username)") &&
      passwordSrc.includes("/api/auth/signup/username-check") &&
      passwordSrc.includes("/api/auth/signup/complete"),
  );
  assert(
    "customer Login lookup was not tightened",
    loginFn.includes("memberAuthEmail(username)") &&
      loginFn.includes("username.length < 4") &&
      !loginFn.includes("memberUsernameSignupError") &&
      !loginFn.includes("MEMBER_USERNAME_RE"),
  );
  assert(
    "usable-member gate UNCHANGED",
    USABLE_MEMBER_PROFILE_COLUMNS ===
      "id, user_custom_id, verified_phone_fingerprint, phone_verified_at" &&
      integritySrc.includes("user_custom_id") &&
      integritySrc.includes("verified_phone_fingerprint") &&
      integritySrc.includes("phone_verified_at"),
  );
  assert(
    "payment gate still uses usable-member columns",
    paymentSrc.includes("isUsableMemberProfile") &&
      paymentSrc.includes("USABLE_MEMBER_PROFILE_COLUMNS"),
  );
  assert(
    "social internal generator and R2 UNCHANGED",
    socialSrc.includes("generateInternalSocialUsername") &&
      socialSrc.includes("phone_already_registered") &&
      !socialSrc.includes("memberUsernameSignupError"),
  );
  const c10aSql = fs.readFileSync(C10A_SQL, "utf8");
  assert(
    "historical C1-0a migration restored (legacy create regex intact)",
    c10aSql.includes("[a-z0-9._-]{3,31}") &&
      c10aSql.includes("letters, digits, . _ -") &&
      !c10aSql.includes("^[a-z0-9]{4,32}$"),
  );
  assert(
    "additive M2C-0 migration is alphanumeric-only create",
    handleSql.includes("^[a-z0-9]{4,32}$") &&
      handleSql.includes("password_login_enabled") &&
      !handleSql.includes("[a-z0-9._-]") &&
      handleSql.includes("Do NOT apply to production"),
  );
  assert(
    "CHECK constraint is not tightened in this SQL",
    !handleSql.includes("ADD CONSTRAINT") && !handleSql.includes("DROP CONSTRAINT"),
  );

  const apiEnv = parseEnvFileRaw(path.join(root, ".env.payment-test.local"));
  apiEnv.METALORA_ENV = "payment-test";
  apiEnv.VITE_METALORA_ENV = "payment-test";
  if ((apiEnv.PHONE_IDENTITY_KEY ?? "").trim().length < 32 || (apiEnv.OTP_PEPPER ?? "").trim().length < 32) {
    throw new Error("payment-test OTP secrets missing");
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

  const supabaseUrl = apiEnv.VITE_SUPABASE_URL ?? "";
  const anonKey = apiEnv.VITE_SUPABASE_ANON_KEY ?? "";
  const serviceKey = apiEnv.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl.includes(PAYMENT_TEST_REF) || supabaseUrl.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error("VITE_SUPABASE_URL is not payment-test");
  }
  assert("target api is payment-test not production", true);

  const beforeHandle = dbQuerySql(
    dbUrl,
    `SELECT pg_get_functiondef('public.handle_new_user()'::regprocedure) AS def;`,
  );
  assert(
    "live handle_new_user still C1 password-capability insert",
    beforeHandle.includes("password_login_enabled") && beforeHandle.includes("@metalora.me"),
  );

  dbQueryFile(dbUrl, HANDLE_SQL);
  const afterHandle = dbQuerySql(
    dbUrl,
    `SELECT pg_get_functiondef('public.handle_new_user()'::regprocedure) AS def;`,
  );
  assert(
    "live handle_new_user now alphanumeric-only for NEW metalora usernames",
    afterHandle.includes("^[a-z0-9]{4,32}$") &&
      afterHandle.includes("password_login_enabled") &&
      !afterHandle.includes("[a-z0-9._-]"),
  );

  const checkDef = dbQuerySql(
    dbUrl,
    `SELECT pg_get_constraintdef(oid) AS def
     FROM pg_constraint
     WHERE conname = 'profiles_user_custom_id_format';`,
  );
  assert(
    "profiles_user_custom_id_format CHECK UNCHANGED (legacy punctuation still allowed)",
    checkDef.includes("char_length") &&
      !checkDef.includes("[a-z0-9]{4,32}") &&
      !checkDef.includes("[A-Za-z0-9]{4,32}"),
  );

  const punctAny = parseCount(
    dbQuerySql(
      dbUrl,
      `SELECT count(*)::int AS n FROM public.profiles WHERE user_custom_id ~ '[._-]';`,
    ),
  );
  const punctPassword = parseCount(
    dbQuerySql(
      dbUrl,
      `SELECT count(*)::int AS n
       FROM public.profiles
       WHERE user_custom_id ~ '[._-]'
         AND coalesce(password_login_enabled, false);`,
    ),
  );
  const punctDot = parseCount(
    dbQuerySql(dbUrl, `SELECT count(*)::int AS n FROM public.profiles WHERE user_custom_id ~ '[.]';`),
  );
  const punctUnderscore = parseCount(
    dbQuerySql(dbUrl, `SELECT count(*)::int AS n FROM public.profiles WHERE user_custom_id ~ '[_]';`),
  );
  const punctHyphen = parseCount(
    dbQuerySql(dbUrl, `SELECT count(*)::int AS n FROM public.profiles WHERE user_custom_id ~ '[-]';`),
  );
  console.log(
    `legacy_punct password=${punctPassword} any=${punctAny} dot=${punctDot} underscore=${punctUnderscore} hyphen=${punctHyphen}`,
  );
  assert("legacy punctuation assessment ran", punctAny >= 0 && punctPassword >= 0);

  const supabaseAdmin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const supabasePublic = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
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
    "signup_username_check_ip",
    "signup_complete_ip",
  ]);

  try {
    const rejected = ["abc.def", "abc_def", "abc-def", "가나다라", "ab cd", "abc"];
    for (const username of rejected) {
      const check = await postJson(base, "/api/auth/signup/username-check", { username });
      assert(
        `username-check rejects ${username === "가나다라" ? "hangul" : username === "ab cd" ? "space" : username}`,
        check.status === 400 && check.json.ok === false && check.json.error === GENERIC_BAD,
      );
    }
    const completeReject = await postJson(base, "/api/auth/signup/complete", {
      proof_token: "a".repeat(64),
      username: "abc.def",
      password: "password1",
      full_name: "홍길동",
      consents: { terms: true, privacy: true, cookie: true },
    });
    assert(
      "signup/complete rejects punctuation before create",
      completeReject.status === 400 &&
        completeReject.json.ok === false &&
        completeReject.json.error === GENERIC_BAD,
    );

    const suffix = randomBytes(3).toString("hex");
    const freeName = `m2c0${suffix}`.slice(0, 12);
    const available = await postJson(base, "/api/auth/signup/username-check", { username: freeName });
    const mixed = await postJson(base, "/api/auth/signup/username-check", { username: "Metalora2026" });
    assert(
      "username-check accepts valid alphanumeric",
      available.status === 200 &&
        available.json.ok === true &&
        typeof available.json.available === "boolean" &&
        mixed.status === 200 &&
        mixed.json.ok === true,
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  const failed = results.filter((item) => !item.pass);
  console.log(`RESULT ${failed.length === 0 ? "PASS" : "FAIL"} ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(redact(err instanceof Error ? err.message : "verify failed"));
  process.exit(1);
});
