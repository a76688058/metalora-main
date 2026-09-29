/**
 * C2-4 READ-ONLY inspect of REAL Naver activation result.
 * Prints no UUIDs, emails, phones, tokens, fingerprints, subjects, or usernames.
 * Payment-test only. Does not mutate.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyAccount, customerVisibleLinkedProviders } from "../src/lib/accountKind";
import { isUsableMemberProfile, isPendingC1SocialCustomer } from "../src/lib/authIntegrity";
import {
  classifyPostgresConnection,
  isUsableSupabaseDbUrl,
  PRODUCTION_SUPABASE_REF,
} from "../src/lib/supabaseHosts";

const PAYMENT_TEST_REF = "bvihpoorwriejybixmoc";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function redact(text: string): string {
  return text
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgres://[redacted]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+/g, "[jwt]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\+82[0-9]{9,12}/g, "[e164]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[uuid]")
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

function dbQueryFile(dbUrl: string, filePath: string): string {
  const npxCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");
  const args = [
    "--yes",
    "supabase",
    "db",
    "query",
    "--db-url",
    dbUrl,
    "--file",
    filePath,
    "--output-format",
    "json",
  ];
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

function dbQuerySql(dbUrl: string, sql: string): string {
  const tmp = path.join(os.tmpdir(), `metalora-c24act-${randomBytes(8).toString("hex")}.sql`);
  fs.writeFileSync(tmp, sql, "utf8");
  try {
    return dbQueryFile(dbUrl, tmp);
  } finally {
    fs.unlinkSync(tmp);
  }
}

function parseRows(raw: string): Array<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(raw.trim()) as { rows?: Array<Record<string, unknown>> };
    return Array.isArray(parsed.rows) ? parsed.rows : [];
  } catch {
    return [];
  }
}

function parseCount(raw: string): number {
  const n = parseRows(raw)[0]?.n;
  return typeof n === "number" && Number.isInteger(n) ? n : -1;
}

function printRows(label: string, rows: Array<Record<string, unknown>>): void {
  if (rows.length === 0) {
    console.log(`${label}=NONE`);
    return;
  }
  for (const [i, row] of rows.entries()) {
    const parts = Object.entries(row)
      .filter(([key]) => !/^(id|email|phone|hmac|fingerprint|token|subject|username|user_id|request_id)$/i.test(key))
      .map(([key, value]) => `${key}=${value == null ? "null" : String(value)}`);
    console.log(`${label}[${i + 1}] ${parts.join(" ")}`);
  }
}

function main(): void {
  const apiEnv = parseEnvFileRaw(path.join(root, ".env.payment-test.local"));
  const dbEnv = parseEnvFileRaw(path.join(root, ".env.payment-test.db.local"));
  const supabaseUrl = (apiEnv.VITE_SUPABASE_URL ?? "").trim();
  if (!supabaseUrl.includes(PAYMENT_TEST_REF) || supabaseUrl.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error("VITE_SUPABASE_URL is not payment-test");
  }
  const dbUrlRaw = (process.env.PAYMENT_TEST_DB_URL ?? dbEnv.PAYMENT_TEST_DB_URL ?? "").trim();
  if (!isUsableSupabaseDbUrl(dbUrlRaw)) throw new Error("PAYMENT_TEST_DB_URL missing");
  const classified = classifyPostgresConnection(dbUrlRaw);
  if (classified.isProductionRef || classified.ref !== PAYMENT_TEST_REF) {
    throw new Error("PAYMENT_TEST_DB_URL is not payment-test");
  }
  console.log(`target_ref=${classified.ref}`);
  console.log(`production_contacted=NO`);

  const dbUrl = encodeDbUrl(dbUrlRaw);
  const naverUserIds = `(SELECT user_id FROM auth.identities WHERE provider = 'custom:naver')`;

  console.log(`identity_custom_naver_n=${parseCount(dbQuerySql(dbUrl, `SELECT count(*)::int AS n FROM auth.identities WHERE provider = 'custom:naver';`))}`);
  console.log(`identity_bare_naver_n=${parseCount(dbQuerySql(dbUrl, `SELECT count(*)::int AS n FROM auth.identities WHERE provider = 'naver';`))}`);
  console.log(`naver_distinct_users=${parseCount(dbQuerySql(dbUrl, `SELECT count(DISTINCT user_id)::int AS n FROM auth.identities WHERE provider = 'custom:naver';`))}`);
  console.log(
    `naver_profile_row_n=${parseCount(dbQuerySql(dbUrl, `SELECT count(*)::int AS n FROM public.profiles WHERE id IN ${naverUserIds};`))}`,
  );
  console.log(
    `canonical_id_match_n=${parseCount(
      dbQuerySql(
        dbUrl,
        `SELECT count(*)::int AS n
         FROM public.profiles p
         JOIN auth.users u ON u.id = p.id
         JOIN auth.identities i ON i.user_id = p.id AND i.provider = 'custom:naver';`,
      ),
    )}`,
  );
  console.log(
    `naver_users_with_other_identities=${parseCount(
      dbQuerySql(
        dbUrl,
        `SELECT count(DISTINCT i.user_id)::int AS n
         FROM auth.identities i
         WHERE i.provider = 'custom:naver'
           AND EXISTS (
             SELECT 1 FROM auth.identities o
             WHERE o.user_id = i.user_id AND o.provider IS DISTINCT FROM 'custom:naver'
           );`,
      ),
    )}`,
  );
  console.log(
    `google_or_kakao_with_naver_identity=${parseCount(
      dbQuerySql(
        dbUrl,
        `SELECT count(DISTINCT g.user_id)::int AS n
         FROM auth.identities g
         WHERE g.provider IN ('google', 'kakao')
           AND EXISTS (
             SELECT 1 FROM auth.identities n
             WHERE n.user_id = g.user_id AND n.provider = 'custom:naver'
           );`,
      ),
    )}`,
  );
  console.log(`identity_google_n=${parseCount(dbQuerySql(dbUrl, `SELECT count(*)::int AS n FROM auth.identities WHERE provider = 'google';`))}`);
  console.log(`identity_kakao_n=${parseCount(dbQuerySql(dbUrl, `SELECT count(*)::int AS n FROM auth.identities WHERE provider = 'kakao';`))}`);

  const profileRows = parseRows(
    dbQuerySql(
      dbUrl,
      `SELECT
         (user_custom_id ~ '^ml[a-z0-9]{10}$') AS username_ml10,
         coalesce(password_login_enabled, false) AS password_login_enabled,
         coalesce(social_login_enabled, false) AS social_login_enabled,
         (verified_phone_fingerprint IS NOT NULL AND btrim(verified_phone_fingerprint) <> '') AS fingerprint_present,
         (phone_verified_at IS NOT NULL) AS phone_verified_present,
         (verified_phone_e164 IS NOT NULL AND btrim(verified_phone_e164) <> '') AS e164_present,
         (agreed_to_terms_at IS NOT NULL) AS terms_present,
         (agreed_to_privacy_at IS NOT NULL) AS privacy_present,
         (agreed_to_cookie_at IS NOT NULL) AS cookie_present
       FROM public.profiles
       WHERE id IN ${naverUserIds};`,
    ),
  );
  printRows("naver_profile", profileRows);
  const profile = profileRows[0];
  const usable = isUsableMemberProfile({
    id: "00000000-0000-0000-0000-000000000001",
    user_custom_id: profile?.username_ml10 === true ? "mlabcdefghij" : null,
    verified_phone_fingerprint: profile?.fingerprint_present === true ? "a".repeat(64) : null,
    phone_verified_at: profile?.phone_verified_present === true ? "2026-09-29T00:00:00.000Z" : null,
  });
  console.log(`usable_member_equivalent=${usable ? "PASS" : "FAIL"}`);
  console.log(`payment_gate_equivalent=${usable ? "PASS" : "FAIL"}`);
  const derived = classifyAccount({
    userCustomId: "hidden",
    authEmail: null,
    providers: ["custom:naver"],
    passwordLoginEnabled: profile?.password_login_enabled === true,
    socialLoginEnabled: profile?.social_login_enabled === true,
  });
  const linked = customerVisibleLinkedProviders(["custom:naver"]);
  console.log(`derived_kind=${derived.kind}`);
  console.log(`derived_password_reset_allowed=${derived.passwordResetAllowed}`);
  console.log(`derived_recoverable_username=${derived.recoverableUsername === null ? "null" : "PRESENT"}`);
  console.log(`derived_linked_providers=${JSON.stringify(linked)}`);
  console.log(`derived_leaks_custom_naver=${linked.includes("custom:naver" as never) ? "YES" : "NONE"}`);
  console.log(
    `pending_classification=${
      isPendingC1SocialCustomer(
        { identities: [{ provider: "custom:naver" }], app_metadata: { provider: "custom:naver" } },
        {
          id: "00000000-0000-0000-0000-000000000001",
          user_custom_id: profile?.username_ml10 === true ? "mlabcdefghij" : null,
          verified_phone_fingerprint: profile?.fingerprint_present === true ? "a".repeat(64) : null,
          phone_verified_at: profile?.phone_verified_present === true ? "2026-09-29T00:00:00.000Z" : null,
        },
      )
        ? "PENDING"
        : "NOT PENDING"
    }`,
  );

  printRows(
    "naver_identity_provider",
    parseRows(
      dbQuerySql(
        dbUrl,
        `SELECT provider,
           CASE WHEN coalesce(identity_data->>'email','') = '' THEN 'absent' ELSE 'present' END AS identity_email,
           CASE WHEN coalesce(identity_data->>'sub','') = '' THEN 'absent' ELSE 'present' END AS identity_sub
         FROM auth.identities
         WHERE provider = 'custom:naver';`,
      ),
    ),
  );

  printRows(
    "naver_auth_email",
    parseRows(
      dbQuerySql(
        dbUrl,
        `SELECT
           CASE WHEN coalesce(email, '') = '' THEN 'absent' ELSE 'present' END AS auth_email,
           CASE WHEN lower(coalesce(email, '')) LIKE '%@metalora.me' THEN 'yes' ELSE 'no' END AS metalora_email
         FROM auth.users
         WHERE id IN ${naverUserIds};`,
      ),
    ),
  );

  printRows(
    "naver_app_metadata",
    parseRows(
      dbQuerySql(
        dbUrl,
        `SELECT
           coalesce(raw_app_meta_data->>'provider', '') AS app_provider,
           CASE
             WHEN jsonb_typeof(raw_app_meta_data->'providers') = 'array'
             THEN (
               SELECT coalesce(string_agg(value #>> '{}', ','), '')
               FROM jsonb_array_elements(raw_app_meta_data->'providers')
             )
             ELSE coalesce(raw_app_meta_data->>'providers', '')
           END AS app_providers
         FROM auth.users
         WHERE id IN ${naverUserIds};`,
      ),
    ),
  );

  console.log(
    `identity_link_consumed_n=${parseCount(
      dbQuerySql(
        dbUrl,
        `SELECT count(*)::int AS n
         FROM public.phone_verification_tickets
         WHERE user_id IN ${naverUserIds}
           AND purpose = 'identity_link'
           AND status = 'consumed';`,
      ),
    )}`,
  );

  printRows(
    "naver_ticket",
    parseRows(
      dbQuerySql(
        dbUrl,
        `SELECT purpose, status,
           CASE WHEN user_id IS NOT NULL THEN 'bound' ELSE 'unbound' END AS binding,
           CASE WHEN expires_at > now() THEN 'not_expired' ELSE 'expired' END AS expiry,
           CASE WHEN claimed_at IS NULL THEN 'no' ELSE 'yes' END AS claimed,
           CASE WHEN consumed_at IS NULL THEN 'no' ELSE 'yes' END AS consumed,
           EXTRACT(EPOCH FROM (now() - created_at))::int AS age_s
         FROM public.phone_verification_tickets
         WHERE user_id IN ${naverUserIds}
         ORDER BY created_at DESC
         LIMIT 8;`,
      ),
    ),
  );

  printRows(
    "naver_challenge",
    parseRows(
      dbQuerySql(
        dbUrl,
        `SELECT purpose, status, verify_fails,
           EXTRACT(EPOCH FROM (now() - created_at))::int AS age_s
         FROM public.otp_challenges
         WHERE user_id IN ${naverUserIds}
         ORDER BY created_at DESC
         LIMIT 8;`,
      ),
    ),
  );

  printRows(
    "naver_security_event",
    parseRows(
      dbQuerySql(
        dbUrl,
        `SELECT event, outcome,
           EXTRACT(EPOCH FROM (now() - created_at))::int AS age_s
         FROM public.auth_security_events
         WHERE user_id IN ${naverUserIds}
         ORDER BY created_at DESC
         LIMIT 12;`,
      ),
    ),
  );

  console.log(
    `social_complete_accepted_n=${parseCount(
      dbQuerySql(
        dbUrl,
        `SELECT count(*)::int AS n
         FROM public.auth_security_events
         WHERE user_id IN ${naverUserIds}
           AND event = 'social_complete'
           AND outcome = 'accepted';`,
      ),
    )}`,
  );

  printRows(
    "naver_signin_vs_activation",
    parseRows(
      dbQuerySql(
        dbUrl,
        `SELECT
           EXTRACT(EPOCH FROM (now() - u.last_sign_in_at))::int AS last_sign_in_age_s,
           EXTRACT(EPOCH FROM (now() - p.phone_verified_at))::int AS phone_verified_age_s,
           EXTRACT(EPOCH FROM (now() - p.agreed_to_terms_at))::int AS terms_age_s,
           EXTRACT(EPOCH FROM (now() - p.updated_at))::int AS profile_updated_age_s,
           (p.id = u.id) AS canonical_match
         FROM auth.users u
         JOIN public.profiles p ON p.id = u.id
         WHERE u.id IN ${naverUserIds};`,
      ),
    ),
  );

  console.log(
    `password_reset_tickets_n=${parseCount(
      dbQuerySql(
        dbUrl,
        `SELECT count(*)::int AS n
         FROM public.password_reset_tickets
         WHERE user_id IN ${naverUserIds};`,
      ),
    )}`,
  );

  printRows(
    "naver_recovery_session",
    parseRows(
      dbQuerySql(
        dbUrl,
        `SELECT account_kind, status,
           CASE WHEN expires_at > now() THEN 'not_expired' ELSE 'expired' END AS expiry,
           EXTRACT(EPOCH FROM (now() - created_at))::int AS age_s
         FROM public.recovery_sessions
         WHERE user_id IN ${naverUserIds}
         ORDER BY created_at DESC
         LIMIT 5;`,
      ),
    ),
  );

  printRows(
    "naver_recovery_ticket",
    parseRows(
      dbQuerySql(
        dbUrl,
        `SELECT t.purpose, t.status,
           CASE WHEN t.user_id IS NOT NULL THEN 'bound' ELSE 'unbound' END AS binding,
           CASE WHEN t.expires_at > now() THEN 'not_expired' ELSE 'expired' END AS expiry,
           CASE WHEN t.claimed_at IS NULL THEN 'no' ELSE 'yes' END AS claimed,
           CASE WHEN t.consumed_at IS NULL THEN 'no' ELSE 'yes' END AS consumed,
           EXTRACT(EPOCH FROM (now() - t.created_at))::int AS age_s
         FROM public.phone_verification_tickets t
         JOIN public.profiles p ON p.verified_phone_fingerprint = t.phone_fingerprint
         WHERE p.id IN ${naverUserIds}
           AND t.purpose = 'recovery'
         ORDER BY t.created_at DESC
         LIMIT 5;`,
      ),
    ),
  );

  printRows(
    "naver_recovery_challenge",
    parseRows(
      dbQuerySql(
        dbUrl,
        `SELECT c.purpose, c.status, c.verify_fails,
           EXTRACT(EPOCH FROM (now() - c.created_at))::int AS age_s
         FROM public.otp_challenges c
         JOIN public.profiles p ON p.verified_phone_fingerprint = c.phone_fingerprint
         WHERE p.id IN ${naverUserIds}
           AND c.purpose = 'recovery'
         ORDER BY c.created_at DESC
         LIMIT 5;`,
      ),
    ),
  );
}

try {
  main();
} catch (err) {
  console.error(redact(err instanceof Error ? err.message : "inspect failed"));
  process.exit(1);
}
