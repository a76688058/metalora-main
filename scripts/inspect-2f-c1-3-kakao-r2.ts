/**
 * C1-3 read-only inspect of live Kakao R2 phone collision.
 * Payment-test only. Does not print ids, emails, phones, fingerprints,
 * OTP, tokens, or provider subjects. Does not mutate rows.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { isUsableMemberProfile } from "../src/lib/authIntegrity";
import { GENERATED_SOCIAL_USERNAME_RE } from "../src/lib/memberUsername";
import {
  classifyPostgresConnection,
  isUsableSupabaseDbUrl,
  PRODUCTION_SUPABASE_REF,
} from "../src/lib/supabaseHosts";

const PAYMENT_TEST_REF = "bvihpoorwriejybixmoc";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

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
  const tmp = path.join(os.tmpdir(), `metalora-c13r2-${randomBytes(8).toString("hex")}.sql`);
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

function countN(dbUrl: string, sql: string): number {
  return parseCount(dbQuerySql(dbUrl, sql));
}

const GOOGLE_IDS = `SELECT DISTINCT user_id FROM auth.identities WHERE provider = 'google'`;
const KAKAO_IDS = `SELECT DISTINCT user_id FROM auth.identities WHERE provider = 'kakao'`;

async function main(): Promise<void> {
  const apiEnv = parseEnvFileRaw(path.join(root, ".env.payment-test.local"));
  const dbEnv = parseEnvFileRaw(path.join(root, ".env.payment-test.db.local"));
  const dbUrlRaw = (process.env.PAYMENT_TEST_DB_URL ?? dbEnv.PAYMENT_TEST_DB_URL ?? "").trim();
  if (!isUsableSupabaseDbUrl(dbUrlRaw)) throw new Error("PAYMENT_TEST_DB_URL missing");
  const classified = classifyPostgresConnection(dbUrlRaw);
  if (classified.isProductionRef || classified.ref !== PAYMENT_TEST_REF) {
    throw new Error("PAYMENT_TEST_DB_URL is not payment-test");
  }
  assert("target db is payment-test not production", classified.ref === PAYMENT_TEST_REF);

  const supabaseUrl = apiEnv.VITE_SUPABASE_URL;
  const serviceKey = apiEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl.includes(PAYMENT_TEST_REF) || supabaseUrl.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error("VITE_SUPABASE_URL is not payment-test");
  }
  assert("target api is payment-test not production", true);

  const dbUrl = encodeDbUrl(dbUrlRaw);
  const r2Events = countN(
    dbUrl,
    `SELECT count(*)::int AS n FROM public.auth_security_events
     WHERE event = 'social_complete' AND outcome = 'phone_already_registered';`,
  );
  const socialAccepted = countN(
    dbUrl,
    `SELECT count(*)::int AS n FROM public.auth_security_events
     WHERE event = 'social_complete' AND outcome = 'accepted'
       AND user_id IN (${KAKAO_IDS});`,
  );
  const r2EventsOnKakao = countN(
    dbUrl,
    `SELECT count(*)::int AS n FROM public.auth_security_events
     WHERE event = 'social_complete' AND outcome = 'phone_already_registered'
       AND user_id IN (${KAKAO_IDS});`,
  );
  console.log(
    `social_complete_r2_events=${r2Events} r2_on_kakao_user=${r2EventsOnKakao} kakao_social_complete_accepted=${socialAccepted}`,
  );
  assert("HTTP R2 recorded as social_complete phone_already_registered", r2Events >= 1 && r2EventsOnKakao >= 1);
  assert("Kakao social complete was not accepted", socialAccepted === 0);

  const googleUsers = countN(dbUrl, `SELECT count(DISTINCT user_id)::int AS n FROM auth.identities WHERE provider = 'google';`);
  const kakaoUsers = countN(dbUrl, `SELECT count(DISTINCT user_id)::int AS n FROM auth.identities WHERE provider = 'kakao';`);
  const linkedBoth = countN(
    dbUrl,
    `SELECT count(*)::int AS n FROM (
       SELECT user_id FROM auth.identities WHERE provider IN ('google', 'kakao') GROUP BY user_id
       HAVING count(*) FILTER (WHERE provider = 'google') > 0
          AND count(*) FILTER (WHERE provider = 'kakao') > 0
     ) t;`,
  );
  const kakaoOnGoogle = countN(
    dbUrl,
    `SELECT count(*)::int AS n FROM auth.identities WHERE provider = 'kakao' AND user_id IN (${GOOGLE_IDS});`,
  );
  const googleOnKakao = countN(
    dbUrl,
    `SELECT count(*)::int AS n FROM auth.identities WHERE provider = 'google' AND user_id IN (${KAKAO_IDS});`,
  );
  const googleActivated = countN(
    dbUrl,
    `SELECT count(DISTINCT i.user_id)::int AS n
     FROM auth.identities i
     JOIN public.profiles p ON p.id = i.user_id
     WHERE i.provider = 'google'
       AND p.social_login_enabled = true
       AND p.user_custom_id ~ '^ml[a-z0-9]{10}$'
       AND p.verified_phone_fingerprint IS NOT NULL
       AND p.phone_verified_at IS NOT NULL;`,
  );
  const kakaoPending = countN(
    dbUrl,
    `SELECT count(DISTINCT i.user_id)::int AS n
     FROM auth.identities i
     JOIN public.profiles p ON p.id = i.user_id
     WHERE i.provider = 'kakao'
       AND p.password_login_enabled = false
       AND p.social_login_enabled = false
       AND p.user_custom_id IS NULL
       AND p.verified_phone_fingerprint IS NULL
       AND p.phone_verified_at IS NULL;`,
  );
  const kakaoActivated = countN(
    dbUrl,
    `SELECT count(DISTINCT i.user_id)::int AS n
     FROM auth.identities i
     JOIN public.profiles p ON p.id = i.user_id
     WHERE i.provider = 'kakao'
       AND p.social_login_enabled = true
       AND p.user_custom_id IS NOT NULL;`,
  );
  const fpOwners = countN(
    dbUrl,
    `SELECT count(*)::int AS n FROM public.profiles
     WHERE verified_phone_fingerprint = (
       SELECT verified_phone_fingerprint FROM public.profiles WHERE id IN (${GOOGLE_IDS})
     );`,
  );
  const kakaoOwnsGooglePhone = countN(
    dbUrl,
    `SELECT count(*)::int AS n FROM public.profiles
     WHERE id IN (${KAKAO_IDS})
       AND verified_phone_fingerprint IS NOT NULL
       AND verified_phone_fingerprint = (
         SELECT verified_phone_fingerprint FROM public.profiles WHERE id IN (${GOOGLE_IDS})
       );`,
  );

  console.log(
    `google_users=${googleUsers} google_activated=${googleActivated} kakao_users=${kakaoUsers} kakao_pending=${kakaoPending} kakao_activated=${kakaoActivated} linked_both=${linkedBoth} kakao_on_google=${kakaoOnGoogle} google_on_kakao=${googleOnKakao} fp_owners=${fpOwners} kakao_owns_google_phone=${kakaoOwnsGooglePhone}`,
  );

  assert("Google remains one activated canonical member", googleUsers === 1 && googleActivated === 1);
  assert("Kakao remains separate pending user", kakaoUsers === 1 && kakaoPending === 1 && kakaoActivated === 0);
  assert("no merge: identities not moved", linkedBoth === 0 && kakaoOnGoogle === 0 && googleOnKakao === 0);
  assert("exactly one verified-phone owner (Google)", fpOwners === 1 && kakaoOwnsGooglePhone === 0);

  const googleUnchanged = countN(
    dbUrl,
    `SELECT count(*)::int AS n FROM public.profiles p
     WHERE p.id IN (${GOOGLE_IDS})
       AND p.password_login_enabled = false
       AND p.social_login_enabled = true
       AND p.user_custom_id ~ '^ml[a-z0-9]{10}$'
       AND p.verified_phone_fingerprint IS NOT NULL
       AND p.phone_verified_at IS NOT NULL
       AND p.agreed_to_terms_at IS NOT NULL
       AND p.agreed_to_privacy_at IS NOT NULL
       AND p.agreed_to_cookie_at IS NOT NULL;`,
  );
  assert("Google flags/username/phone/consents UNCHANGED", googleUnchanged === 1);

  const otpSrc = fs.readFileSync(path.join(root, "src/lib/otpAuthHandlers.ts"), "utf8");
  const completeSrc = fs.readFileSync(path.join(root, "src/lib/socialAuthHandlers.ts"), "utf8");
  const loginSrc = fs.readFileSync(path.join(root, "src/components/LoginModal.tsx"), "utf8");
  const customerSrc = fs.readFileSync(path.join(root, "src/components/auth/customerAuthRequests.ts"), "utf8");
  assert(
    "collision only after social complete, not OTP send",
    !otpSrc.includes("phone_already_registered") &&
      completeSrc.includes('res.status(409).json({') &&
      completeSrc.includes("phone_already_registered") &&
      loginSrc.includes("returnToLoginAfterCollision") &&
      loginSrc.includes("signOut({ redirect: false, toast: false })") &&
      customerSrc.includes("status === 409 && json.code === PHONE_ALREADY_REGISTERED_CODE"),
  );

  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const googleRow = await supabaseAdmin
    .from("profiles")
    .select("id, user_custom_id, verified_phone_fingerprint, phone_verified_at, password_login_enabled, social_login_enabled")
    .eq("social_login_enabled", true)
    .eq("password_login_enabled", false)
    .maybeSingle();
  assert(
    "Google usable-member and payment predicate PASS",
    isUsableMemberProfile(googleRow.data) === true &&
      GENERATED_SOCIAL_USERNAME_RE.test(googleRow.data?.user_custom_id ?? ""),
  );

  const kakaoPendingRows = await supabaseAdmin
    .from("profiles")
    .select("id, user_custom_id, verified_phone_fingerprint, phone_verified_at, password_login_enabled, social_login_enabled")
    .is("user_custom_id", null)
    .eq("password_login_enabled", false)
    .eq("social_login_enabled", false);
  const kakaoShaped = (kakaoPendingRows.data ?? []).filter(
    (row) => !row.verified_phone_fingerprint && !row.phone_verified_at,
  );
  assert("Kakao-shaped pending remains unusable", kakaoShaped.length >= 1 && !kakaoShaped.some((row) => isUsableMemberProfile(row)));

  const failed = results.filter((item) => !item.pass);
  console.log(`RESULT ${failed.length === 0 ? "PASS" : "FAIL"} ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? redact(err.message) : "inspect failed");
  process.exit(1);
});
