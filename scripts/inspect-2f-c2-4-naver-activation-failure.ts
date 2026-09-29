/**
 * C2-4 READ-ONLY inspect of live Naver activation failure evidence.
 * Prints no UUIDs, emails, phones, tokens, fingerprints, subjects, or usernames.
 * Payment-test only. Does not mutate.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isUsableMemberProfile } from "../src/lib/authIntegrity";
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
  const tmp = path.join(os.tmpdir(), `metalora-c24-${randomBytes(8).toString("hex")}.sql`);
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

  const profileRows = parseRows(
    dbQuerySql(
      dbUrl,
      `SELECT
         (user_custom_id IS NULL OR btrim(user_custom_id) = '') AS username_absent,
         coalesce(password_login_enabled, false) AS password_login_enabled,
         coalesce(social_login_enabled, false) AS social_login_enabled,
         (verified_phone_fingerprint IS NULL OR btrim(verified_phone_fingerprint) = '') AS fingerprint_absent,
         (phone_verified_at IS NULL) AS phone_verified_absent,
         (phone_number IS NULL OR btrim(phone_number) = '') AS contact_phone_absent
       FROM public.profiles
       WHERE id IN ${naverUserIds};`,
    ),
  );
  printRows("naver_profile", profileRows);
  const profile = profileRows[0];
  const usable = isUsableMemberProfile({
    id: "00000000-0000-0000-0000-000000000001",
    user_custom_id: profile?.username_absent === true ? null : "present",
    verified_phone_fingerprint: profile?.fingerprint_absent === true ? null : "a".repeat(64),
    phone_verified_at: profile?.phone_verified_absent === true ? null : "2026-09-29T00:00:00.000Z",
  });
  console.log(`usable_member=${usable ? "YES" : "NO"}`);

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

  printRows(
    "naver_challenge",
    parseRows(
      dbQuerySql(
        dbUrl,
        `SELECT purpose, status, verify_fails,
           CASE WHEN expires_at > now() THEN 'not_expired' ELSE 'expired' END AS expiry,
           EXTRACT(EPOCH FROM (now() - created_at))::int AS age_s,
           EXTRACT(EPOCH FROM (now() - last_sent_at))::int AS sent_age_s,
           (user_id IS NOT NULL) AS user_bound
         FROM public.otp_challenges
         WHERE user_id IN ${naverUserIds}
         ORDER BY created_at DESC
         LIMIT 10;`,
      ),
    ),
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
           EXTRACT(EPOCH FROM (now() - created_at))::int AS age_s,
           EXTRACT(EPOCH FROM (expires_at - now()))::int AS ttl_left_s
         FROM public.phone_verification_tickets
         WHERE user_id IN ${naverUserIds}
         ORDER BY created_at DESC
         LIMIT 10;`,
      ),
    ),
  );

  printRows(
    "naver_security_event",
    parseRows(
      dbQuerySql(
        dbUrl,
        `SELECT event, outcome,
           CASE WHEN meta = '{}'::jsonb THEN 'empty' ELSE 'present' END AS meta,
           EXTRACT(EPOCH FROM (now() - created_at))::int AS age_s
         FROM public.auth_security_events
         WHERE user_id IN ${naverUserIds}
         ORDER BY created_at DESC
         LIMIT 15;`,
      ),
    ),
  );

  printRows(
    "recent_social_complete_any",
    parseRows(
      dbQuerySql(
        dbUrl,
        `SELECT event, outcome,
           EXTRACT(EPOCH FROM (now() - created_at))::int AS age_s
         FROM public.auth_security_events
         WHERE event = 'social_complete'
           AND created_at > now() - interval '6 hours'
         ORDER BY created_at DESC
         LIMIT 15;`,
      ),
    ),
  );

  printRows(
    "recent_identity_link_ticket_any",
    parseRows(
      dbQuerySql(
        dbUrl,
        `SELECT purpose, status,
           CASE WHEN user_id IS NOT NULL THEN 'bound' ELSE 'unbound' END AS binding,
           CASE WHEN expires_at > now() THEN 'not_expired' ELSE 'expired' END AS expiry,
           CASE WHEN consumed_at IS NULL THEN 'no' ELSE 'yes' END AS consumed,
           EXTRACT(EPOCH FROM (now() - created_at))::int AS age_s,
           EXTRACT(EPOCH FROM (expires_at - now()))::int AS ttl_left_s
         FROM public.phone_verification_tickets
         WHERE purpose = 'identity_link'
           AND created_at > now() - interval '6 hours'
         ORDER BY created_at DESC
         LIMIT 15;`,
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
