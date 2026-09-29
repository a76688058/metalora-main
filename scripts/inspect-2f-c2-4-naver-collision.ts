/**
 * C2-4 READ-ONLY inspect of REAL Naver Matrix D phone collision.
 * No UUIDs, subjects, emails, phones, fingerprints, tokens, or usernames.
 * Payment-test only. Does not mutate.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isPendingC1SocialCustomer, isUsableMemberProfile } from "../src/lib/authIntegrity";
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
  const tmp = path.join(os.tmpdir(), `metalora-c24d-${randomBytes(8).toString("hex")}.sql`);
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
  console.log(`naver_profile_row_n=${parseCount(dbQuerySql(dbUrl, `SELECT count(*)::int AS n FROM public.profiles WHERE id IN ${naverUserIds};`))}`);
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
  console.log(`identity_google_n=${parseCount(dbQuerySql(dbUrl, `SELECT count(*)::int AS n FROM auth.identities WHERE provider = 'google';`))}`);
  console.log(`identity_kakao_n=${parseCount(dbQuerySql(dbUrl, `SELECT count(*)::int AS n FROM auth.identities WHERE provider = 'kakao';`))}`);

  const profileRows = parseRows(
    dbQuerySql(
      dbUrl,
      `SELECT
         CASE
           WHEN user_custom_id ~ '^ml[a-z0-9]{10}$' THEN 'activated'
           WHEN user_custom_id IS NULL OR btrim(user_custom_id) = '' THEN 'pending'
           ELSE 'other'
         END AS row_class,
         (user_custom_id ~ '^ml[a-z0-9]{10}$') AS username_ml10,
         (user_custom_id IS NULL OR btrim(user_custom_id) = '') AS username_absent,
         coalesce(password_login_enabled, false) AS password_login_enabled,
         coalesce(social_login_enabled, false) AS social_login_enabled,
         (verified_phone_fingerprint IS NOT NULL AND btrim(verified_phone_fingerprint) <> '') AS fingerprint_present,
         (phone_verified_at IS NOT NULL) AS phone_verified_present,
         (verified_phone_e164 IS NOT NULL AND btrim(verified_phone_e164) <> '') AS e164_present,
         (agreed_to_terms_at IS NOT NULL) AS terms_present,
         EXTRACT(EPOCH FROM (now() - p.updated_at))::int AS profile_updated_age_s,
         EXTRACT(EPOCH FROM (now() - p.phone_verified_at))::int AS phone_verified_age_s
       FROM public.profiles p
       WHERE p.id IN ${naverUserIds}
       ORDER BY p.updated_at ASC;`,
    ),
  );
  printRows("naver_profile", profileRows);

  for (const row of profileRows) {
    const usable = isUsableMemberProfile({
      id: "00000000-0000-0000-0000-000000000001",
      user_custom_id: row.username_ml10 === true ? "mlabcdefghij" : null,
      verified_phone_fingerprint: row.fingerprint_present === true ? "a".repeat(64) : null,
      phone_verified_at: row.phone_verified_present === true ? "2026-09-29T00:00:00.000Z" : null,
    });
    const pending = isPendingC1SocialCustomer(
      { identities: [{ provider: "custom:naver" }], app_metadata: { provider: "custom:naver" } },
      {
        id: "00000000-0000-0000-0000-000000000001",
        user_custom_id: row.username_ml10 === true ? "mlabcdefghij" : null,
        verified_phone_fingerprint: row.fingerprint_present === true ? "a".repeat(64) : null,
        phone_verified_at: row.phone_verified_present === true ? "2026-09-29T00:00:00.000Z" : null,
      },
    );
    console.log(
      `naver_${String(row.row_class)}_usable=${usable ? "PASS" : "REJECT"} pending=${pending ? "PENDING" : "NOT PENDING"} payment=${usable ? "PASS" : "REJECT"}`,
    );
  }

  printRows(
    "naver_identity",
    parseRows(
      dbQuerySql(
        dbUrl,
        `SELECT i.provider,
           CASE WHEN coalesce(i.identity_data->>'email','') = '' THEN 'absent' ELSE 'present' END AS identity_email,
           CASE WHEN coalesce(u.email, '') = '' THEN 'absent' ELSE 'present' END AS auth_email,
           EXTRACT(EPOCH FROM (now() - i.created_at))::int AS identity_age_s
         FROM auth.identities i
         JOIN auth.users u ON u.id = i.user_id
         WHERE i.provider = 'custom:naver'
         ORDER BY i.created_at ASC;`,
      ),
    ),
  );

  printRows(
    "pending_naver_events",
    parseRows(
      dbQuerySql(
        dbUrl,
        `SELECT e.event, e.outcome,
           EXTRACT(EPOCH FROM (now() - e.created_at))::int AS age_s
         FROM public.auth_security_events e
         JOIN public.profiles p ON p.id = e.user_id
         JOIN auth.identities i ON i.user_id = p.id AND i.provider = 'custom:naver'
         WHERE (p.user_custom_id IS NULL OR btrim(p.user_custom_id) = '')
         ORDER BY e.created_at DESC
         LIMIT 10;`,
      ),
    ),
  );

  printRows(
    "pending_naver_ticket",
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
         JOIN public.profiles p ON p.id = t.user_id
         JOIN auth.identities i ON i.user_id = p.id AND i.provider = 'custom:naver'
         WHERE (p.user_custom_id IS NULL OR btrim(p.user_custom_id) = '')
         ORDER BY t.created_at DESC
         LIMIT 8;`,
      ),
    ),
  );

  printRows(
    "pending_naver_challenge",
    parseRows(
      dbQuerySql(
        dbUrl,
        `SELECT c.purpose, c.status, c.verify_fails,
           CASE WHEN c.user_id IS NOT NULL THEN 'bound' ELSE 'unbound' END AS binding,
           EXTRACT(EPOCH FROM (now() - c.created_at))::int AS age_s
         FROM public.otp_challenges c
         JOIN public.profiles p ON p.id = c.user_id
         JOIN auth.identities i ON i.user_id = p.id AND i.provider = 'custom:naver'
         WHERE (p.user_custom_id IS NULL OR btrim(p.user_custom_id) = '')
         ORDER BY c.created_at DESC
         LIMIT 8;`,
      ),
    ),
  );

  printRows(
    "collision_phone_owner",
    parseRows(
      dbQuerySql(
        dbUrl,
        `WITH pending_ticket AS (
           SELECT t.phone_fingerprint, t.user_id AS pending_id
           FROM public.phone_verification_tickets t
           JOIN public.profiles p ON p.id = t.user_id
           JOIN auth.identities i ON i.user_id = p.id AND i.provider = 'custom:naver'
           WHERE (p.user_custom_id IS NULL OR btrim(p.user_custom_id) = '')
             AND t.purpose = 'identity_link'
           ORDER BY t.created_at DESC
           LIMIT 1
         )
         SELECT
           coalesce(op.password_login_enabled, false) AS owner_password_login,
           coalesce(op.social_login_enabled, false) AS owner_social_login,
           (op.user_custom_id ~ '^ml[a-z0-9]{10}$') AS owner_username_ml10,
           (SELECT string_agg(DISTINCT oi.provider, ',' ORDER BY oi.provider)
            FROM auth.identities oi
            WHERE oi.user_id = op.id) AS owner_providers,
           (op.phone_verified_at IS NOT NULL) AS owner_phone_verified,
           EXTRACT(EPOCH FROM (now() - op.updated_at))::int AS owner_updated_age_s,
           EXTRACT(EPOCH FROM (now() - op.phone_verified_at))::int AS owner_phone_verified_age_s,
           EXTRACT(EPOCH FROM (now() - op.agreed_to_terms_at))::int AS owner_terms_age_s
         FROM pending_ticket pt
         JOIN public.profiles op
           ON op.verified_phone_fingerprint = pt.phone_fingerprint
          AND op.id IS DISTINCT FROM pt.pending_id;`,
      ),
    ),
  );

  printRows(
    "activated_naver_events_latest",
    parseRows(
      dbQuerySql(
        dbUrl,
        `SELECT e.event, e.outcome,
           EXTRACT(EPOCH FROM (now() - e.created_at))::int AS age_s
         FROM public.auth_security_events e
         JOIN public.profiles p ON p.id = e.user_id
         JOIN auth.identities i ON i.user_id = p.id AND i.provider = 'custom:naver'
         WHERE p.user_custom_id ~ '^ml[a-z0-9]{10}$'
         ORDER BY e.created_at DESC
         LIMIT 6;`,
      ),
    ),
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

  console.log(
    `pending_naver_auth_sessions_n=${parseCount(
      dbQuerySql(
        dbUrl,
        `SELECT count(*)::int AS n
         FROM auth.sessions s
         JOIN public.profiles p ON p.id = s.user_id
         JOIN auth.identities i ON i.user_id = p.id AND i.provider = 'custom:naver'
         WHERE p.user_custom_id IS NULL OR btrim(p.user_custom_id) = '';`,
      ),
    )}`,
  );
}

try {
  main();
} catch (err) {
  console.error(redact(err instanceof Error ? err.message : "inspect failed"));
  process.exit(1);
}
