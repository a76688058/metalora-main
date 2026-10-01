/**
 * NEW2 P0.9A — Production Before User Created hook SOURCE verifier.
 * Semantic policy matrix + source-architecture checks. No production mutation.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SQL_PATH = path.join(root, "scripts/sql/production-2f-before-user-created.sql");
const PAYMENT_TEST_SQL = path.join(
  root,
  "scripts/sql/payment-test-2f-b2b-before-user-created.sql",
);

type TestResult = { name: string; pass: boolean };
const results: TestResult[] = [];

function assert(name: string, condition: boolean, detail = ""): void {
  results.push({ name, pass: condition });
  const suffix = !condition && detail ? ` — ${detail}` : "";
  console.log(`${condition ? "PASS" : "FAIL"}: ${name}${suffix}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

type HookResult =
  | { allow: true }
  | { allow: false; httpCode: number; message: string };

/** Faithful port of scripts/sql/production-2f-before-user-created.sql */
function evaluateProductionBeforeUserCreated(event: unknown): HookResult {
  const reject = (): HookResult => ({
    allow: false,
    httpCode: 403,
    message: "Public password signup is not allowed.",
  });
  if (event == null || !isObject(event)) return reject();

  const user = isObject(event.user) ? event.user : null;
  const anonymousRaw = user && "is_anonymous" in user ? user.is_anonymous : "false";
  const isAnonymous = ["true", "t", "1"].includes(
    String(anonymousRaw ?? "false").toLowerCase(),
  );
  if (isAnonymous) return reject();

  const appMetadata =
    user && isObject(user.app_metadata) ? user.app_metadata : null;
  const provider = String(appMetadata?.provider ?? "")
    .trim()
    .toLowerCase();

  if (provider === "email" || provider === "anonymous" || provider === "") {
    return reject();
  }
  if (provider === "google" || provider === "kakao" || provider === "custom:naver") {
    return { allow: true };
  }
  return reject();
}

function allow(event: unknown): boolean {
  return evaluateProductionBeforeUserCreated(event).allow;
}

function reject403(event: unknown): boolean {
  const result = evaluateProductionBeforeUserCreated(event);
  return result.allow === false && result.httpCode === 403;
}

const sql = fs.readFileSync(SQL_PATH, "utf8");
const paymentTestSql = fs.readFileSync(PAYMENT_TEST_SQL, "utf8");
const passwordHandlers = fs.readFileSync(
  path.join(root, "src/lib/passwordAuthHandlers.ts"),
  "utf8",
);
const loginModal = fs.readFileSync(path.join(root, "src/components/LoginModal.tsx"), "utf8");
const migrationsDir = path.join(root, "supabase/migrations");
const migrationNames = fs.existsSync(migrationsDir)
  ? fs.readdirSync(migrationsDir)
  : [];

assert(
  "SQL artifact exists outside supabase/migrations",
  fs.existsSync(SQL_PATH) && !migrationNames.includes("production-2f-before-user-created.sql"),
);
assert(
  "function is public.hook_before_user_created(jsonb)",
  /CREATE OR REPLACE FUNCTION public\.hook_before_user_created\(\s*event jsonb\s*\)/.test(sql),
);
assert("SECURITY INVOKER is explicit", /SECURITY INVOKER/.test(sql));
assert(
  "search_path is public, pg_catalog",
  /SET search_path = public, pg_catalog/.test(sql),
);
assert("owner is postgres", /ALTER FUNCTION public\.hook_before_user_created\(jsonb\) OWNER TO postgres/.test(sql));
assert(
  "EXECUTE granted only to supabase_auth_admin",
  /GRANT EXECUTE ON FUNCTION public\.hook_before_user_created\(jsonb\) TO supabase_auth_admin/.test(
    sql,
  ),
);
assert(
  "EXECUTE revoked from PUBLIC/anon/authenticated",
  /REVOKE ALL ON FUNCTION public\.hook_before_user_created\(jsonb\) FROM PUBLIC/.test(sql) &&
    /REVOKE ALL ON FUNCTION public\.hook_before_user_created\(jsonb\) FROM anon/.test(sql) &&
    /REVOKE ALL ON FUNCTION public\.hook_before_user_created\(jsonb\) FROM authenticated/.test(sql),
);
assert(
  "schema USAGE granted to supabase_auth_admin",
  /GRANT USAGE ON SCHEMA public TO supabase_auth_admin/.test(sql),
);
const bodyMatch = sql.match(/AS \$\$([\s\S]*?)\$\$;/);
const body = bodyMatch?.[1] ?? "";
assert("no RAISE EXCEPTION for policy rejection", !/RAISE EXCEPTION/.test(body));
assert("no custom:% wildcard", !/LIKE\s+'custom:%'/.test(sql) && !/provider\s*<>\s*'email'/.test(sql) && !/provider\s*!=\s*'email'/.test(sql));
assert(
  "explicit allow-list google / kakao / custom:naver",
  /provider = 'google' OR provider = 'kakao' OR provider = 'custom:naver'/.test(sql),
);
assert("rejects email/anonymous/empty provider", /provider = 'email' OR provider = 'anonymous' OR provider = ''/.test(sql));
assert("does not require email field", !/->>'email'/.test(body) && !/->'email'/.test(body));
assert("authorize/reject only — no table writes", !/\b(INSERT|UPDATE|DELETE)\b/i.test(body));
assert("no verified-phone writes", !/verified_phone_e164|verified_phone_fingerprint|phone_verified_at/.test(body));
assert("no social username generation", !/\bml[a-z0-9]{10}\b/.test(body) && !/user_custom_id/.test(body));
assert("no merge/link/transfer logic", !/merge|identity transfer|phone_already_registered/i.test(body));
assert(
  "comments forbid db push / mark not applied",
  /supabase db push remains FORBIDDEN/.test(sql) && /Status: NOT APPLIED/.test(sql),
);
assert(
  "future mapping URI documented",
  /pg-functions:\/\/postgres\/public\/hook_before_user_created/.test(sql),
);
assert(
  "payment-test hook source left untouched",
  paymentTestSql.includes("PAYMENT-TEST ONLY") &&
    paymentTestSql.includes("CREATE OR REPLACE FUNCTION public.hook_before_user_created(event jsonb)"),
);

const google = { user: { is_anonymous: false, app_metadata: { provider: "google" } } };
const kakao = { user: { is_anonymous: false, app_metadata: { provider: "kakao" } } };
const customNaver = { user: { is_anonymous: false, app_metadata: { provider: "custom:naver" } } };
const naverMissingEmail = {
  user: { is_anonymous: false, app_metadata: { provider: "custom:naver" }, email: null },
};

assert("A trusted Google creation ALLOW", allow(google));
assert("B trusted Kakao creation ALLOW", allow(kakao));
assert("C trusted custom:naver ALLOW", allow(customNaver));
assert("D bare naver REJECT", reject403({ user: { is_anonymous: false, app_metadata: { provider: "naver" } } }));
assert(
  "E unknown custom provider REJECT",
  reject403({ user: { is_anonymous: false, app_metadata: { provider: "custom:anything" } } }),
);
assert("F Apple REJECT", reject403({ user: { is_anonymous: false, app_metadata: { provider: "apple" } } }));
assert(
  "G public direct email signup REJECT",
  reject403({ user: { is_anonymous: false, app_metadata: { provider: "email" } } }),
);
assert("H anonymous REJECT", reject403({ user: { is_anonymous: true, app_metadata: { provider: "email" } } }));
assert("I malformed/no provider REJECT", reject403(null) && reject403({}) && reject403({ user: { is_anonymous: false } }));
assert("J custom:naver missing email ALLOW", allow(naverMissingEmail));

assert(
  "K hook SQL is Before User Created only (no sign-in)",
  /Sign-in is not governed by Before User Created/.test(sql) &&
    !/signInWithPassword|token refresh|session/.test(sql.split("BEGIN;")[1] ?? ""),
);

const createUserIdx = passwordHandlers.indexOf("admin.auth.admin.createUser");
const signupRoute = passwordHandlers.includes('app.post("/api/auth/signup/complete"');
const uiUsesComplete = loginModal.includes("/api/auth/signup/complete");
const uiNoPublicSignUp = !/auth\.signUp\s*\(/.test(loginModal);
assert(
  "L approved password signup uses service-role Admin createUser",
  createUserIdx >= 0 && signupRoute && uiUsesComplete && uiNoPublicSignUp,
);
assert(
  "L public email path remains blocked by hook (no email bypass)",
  /provider = 'email'/.test(sql) && !/provider = 'email'[\s\S]{0,80}RETURN '\{\}'/.test(sql),
);

const failed = results.filter((row) => !row.pass);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
if (failed.length > 0) process.exit(1);
