/**
 * C1-3 read-only inspect of live Kakao OAuth vs activated Google member.
 * Payment-test only. Does not print ids, emails, phones, fingerprints,
 * usernames, tokens, or provider subjects. Does not activate or delete.
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
  const tmp = path.join(os.tmpdir(), `metalora-c13k-${randomBytes(8).toString("hex")}.sql`);
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
       AND p.user_custom_id IS NOT NULL
       AND btrim(p.user_custom_id) <> ''
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
       AND p.user_custom_id IS NOT NULL
       AND btrim(p.user_custom_id) <> '';`,
  );
  const kakaoProfiles = countN(
    dbUrl,
    `SELECT count(*)::int AS n FROM public.profiles WHERE id IN (${KAKAO_IDS});`,
  );
  const kakaoIdentityRows = countN(
    dbUrl,
    `SELECT count(*)::int AS n FROM auth.identities WHERE provider = 'kakao';`,
  );
  const kakaoDistinctSubs = countN(
    dbUrl,
    `SELECT count(DISTINCT provider_id)::int AS n FROM auth.identities WHERE provider = 'kakao';`,
  );

  const kakaoHasEmail = countN(
    dbUrl,
    `SELECT count(*)::int AS n FROM auth.identities
     WHERE provider = 'kakao'
       AND length(btrim(coalesce(identity_data->>'email', ''))) > 0;`,
  );
  const kakaoVerifiedEmail = countN(
    dbUrl,
    `SELECT count(*)::int AS n FROM auth.identities
     WHERE provider = 'kakao'
       AND length(btrim(coalesce(identity_data->>'email', ''))) > 0
       AND (
         CASE jsonb_typeof(identity_data->'email_verified')
           WHEN 'boolean' THEN (identity_data->>'email_verified')::boolean
           ELSE lower(coalesce(identity_data->>'email_verified', '')) IN ('true', 't', 'yes')
         END
       );`,
  );
  const sameEmailAsGoogle = countN(
    dbUrl,
    `SELECT count(*)::int AS n
     FROM auth.identities k
     JOIN auth.identities g ON g.provider = 'google'
     WHERE k.provider = 'kakao'
       AND length(btrim(coalesce(k.identity_data->>'email', ''))) > 0
       AND lower(btrim(k.identity_data->>'email')) = lower(btrim(coalesce(g.identity_data->>'email', '')));`,
  );
  const kakaoAuthEmailPresent = countN(
    dbUrl,
    `SELECT count(*)::int AS n FROM auth.users
     WHERE id IN (${KAKAO_IDS})
       AND length(btrim(coalesce(email, ''))) > 0
       AND lower(email) NOT LIKE '%@metalora.me';`,
  );

  console.log(
    `google_users=${googleUsers} google_activated=${googleActivated} kakao_users=${kakaoUsers} kakao_pending=${kakaoPending} kakao_activated=${kakaoActivated} linked_both=${linkedBoth} kakao_on_google=${kakaoOnGoogle} google_on_kakao=${googleOnKakao}`,
  );
  console.log(
    `kakao_identity_rows=${kakaoIdentityRows} kakao_distinct_subjects=${kakaoDistinctSubs} kakao_profiles=${kakaoProfiles} kakao_has_email=${kakaoHasEmail} kakao_verified_email=${kakaoVerifiedEmail} same_email_as_google=${sameEmailAsGoogle} kakao_auth_email_present=${kakaoAuthEmailPresent}`,
  );

  const newPending =
    kakaoUsers === 1 &&
    kakaoPending === 1 &&
    kakaoActivated === 0 &&
    linkedBoth === 0 &&
    kakaoOnGoogle === 0 &&
    googleOnKakao === 0 &&
    googleUsers === 1 &&
    googleActivated === 1;
  const autoLinked = linkedBoth === 1 && kakaoOnGoogle >= 1 && googleUsers === 1;
  assert("Kakao identity PRESENT", kakaoIdentityRows >= 1 && kakaoUsers >= 1 && kakaoDistinctSubs === kakaoUsers);
  assert("NEW PENDING Kakao separate from Google", newPending === true);
  assert("not Hosted auto-linked onto Google", autoLinked === false && kakaoOnGoogle === 0);
  assert("Google canonical still one activated member", googleUsers === 1 && googleActivated === 1);

  const googleUnchanged = countN(
    dbUrl,
    `SELECT count(*)::int AS n
     FROM public.profiles p
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

  const kakaoPendingShape = countN(
    dbUrl,
    `SELECT count(*)::int AS n
     FROM public.profiles p
     WHERE p.id IN (${KAKAO_IDS})
       AND p.id NOT IN (${GOOGLE_IDS})
       AND p.user_custom_id IS NULL
       AND p.password_login_enabled = false
       AND p.social_login_enabled = false
       AND p.verified_phone_fingerprint IS NULL
       AND p.phone_verified_at IS NULL;`,
  );
  assert("pending Kakao profile exists and is unusable-shaped", kakaoPendingShape === 1 && kakaoProfiles === 1);

  const emailAvailable = kakaoVerifiedEmail >= 1;
  const emailPresentUnverified = kakaoHasEmail >= 1 && kakaoVerifiedEmail === 0;
  console.log(
    `verified_provider_email_available=${emailAvailable ? "YES" : emailPresentUnverified || kakaoAuthEmailPresent >= 1 ? "UNKNOWN" : "NO"}`,
  );

  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const pendingRows = await supabaseAdmin
    .from("profiles")
    .select(
      "id, user_custom_id, verified_phone_fingerprint, phone_verified_at, password_login_enabled, social_login_enabled",
    )
    .is("user_custom_id", null)
    .eq("password_login_enabled", false)
    .eq("social_login_enabled", false);
  const pending = (pendingRows.data ?? []).filter((row) => !row.verified_phone_fingerprint && !row.phone_verified_at);
  assert("at least one unusable pending-shaped profile row", pending.length >= 1);
  const anyPendingUsable = pending.some((row) => isUsableMemberProfile(row));
  assert("pending Kakao-shaped profiles are not usable members", anyPendingUsable === false);

  const googleRow = await supabaseAdmin
    .from("profiles")
    .select("id, user_custom_id, verified_phone_fingerprint, phone_verified_at, password_login_enabled, social_login_enabled")
    .eq("social_login_enabled", true)
    .eq("password_login_enabled", false)
    .maybeSingle();
  assert(
    "Google member still usable",
    isUsableMemberProfile(googleRow.data) === true &&
      GENERATED_SOCIAL_USERNAME_RE.test(googleRow.data?.user_custom_id ?? ""),
  );

  const failed = results.filter((item) => !item.pass);
  console.log(`RESULT ${failed.length === 0 ? "PASS" : "FAIL"} ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? redact(err.message) : "inspect failed");
  process.exit(1);
});
