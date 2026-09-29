/**
 * C1-3 read-only inspect of live Google social-only recovery.
 * Does not print phones, usernames, emails, tokens, or provider subjects.
 * Does not mutate rows.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { customerVisibleLinkedProviders } from "../src/lib/accountKind";
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
  const tmp = path.join(os.tmpdir(), `metalora-c13rec-${randomBytes(8).toString("hex")}.sql`);
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
  const googleSocialSessions = countN(
    dbUrl,
    `SELECT count(*)::int AS n FROM public.recovery_sessions
     WHERE user_id IN (${GOOGLE_IDS}) AND account_kind = 'social';`,
  );
  const googlePasswordSessions = countN(
    dbUrl,
    `SELECT count(*)::int AS n FROM public.recovery_sessions
     WHERE user_id IN (${GOOGLE_IDS}) AND account_kind = 'password';`,
  );
  const googleResetTickets = countN(
    dbUrl,
    `SELECT count(*)::int AS n FROM public.password_reset_tickets
     WHERE user_id IN (${GOOGLE_IDS});`,
  );
  const googleResetViaSession = countN(
    dbUrl,
    `SELECT count(*)::int AS n FROM public.password_reset_tickets t
     JOIN public.recovery_sessions s ON s.id = t.recovery_session_id
     WHERE s.user_id IN (${GOOGLE_IDS});`,
  );
  const resolveSocialGoogle = countN(
    dbUrl,
    `SELECT count(*)::int AS n FROM public.auth_security_events
     WHERE event = 'recovery_resolve' AND outcome = 'accepted'
       AND user_id IN (${GOOGLE_IDS})
       AND coalesce(meta->>'account_kind', '') = 'social';`,
  );
  const kakaoRecoverySessions = countN(
    dbUrl,
    `SELECT count(*)::int AS n FROM public.recovery_sessions WHERE user_id IN (${KAKAO_IDS});`,
  );
  const googleIdentities = countN(
    dbUrl,
    `SELECT count(DISTINCT provider)::int AS n FROM auth.identities WHERE user_id IN (${GOOGLE_IDS});`,
  );
  const kakaoOnGoogle = countN(
    dbUrl,
    `SELECT count(*)::int AS n FROM auth.identities WHERE provider = 'kakao' AND user_id IN (${GOOGLE_IDS});`,
  );
  const kakaoPending = countN(
    dbUrl,
    `SELECT count(DISTINCT i.user_id)::int AS n
     FROM auth.identities i
     JOIN public.profiles p ON p.id = i.user_id
     WHERE i.provider = 'kakao'
       AND p.user_custom_id IS NULL
       AND p.social_login_enabled = false
       AND p.verified_phone_fingerprint IS NULL;`,
  );

  console.log(
    `google_social_recovery_sessions=${googleSocialSessions} google_password_recovery_sessions=${googlePasswordSessions} google_reset_tickets=${googleResetTickets} resolve_social_google=${resolveSocialGoogle} kakao_recovery_sessions=${kakaoRecoverySessions} google_identity_providers=${googleIdentities} kakao_on_google=${kakaoOnGoogle} kakao_pending=${kakaoPending}`,
  );

  assert("live recovery_resolve accepted as social for Google member", resolveSocialGoogle >= 1);
  assert("Google recovery sessions are social, not password", googleSocialSessions >= 1 && googlePasswordSessions === 0);
  assert("no password_reset_tickets for Google member", googleResetTickets === 0 && googleResetViaSession === 0);
  assert("recovery bound to Google owner, not pending Kakao", kakaoRecoverySessions === 0);
  assert("Google identities google-only (Kakao excluded)", googleIdentities === 1 && kakaoOnGoogle === 0);
  assert("pending Kakao remains separate unusable", kakaoPending === 1);

  const handlerSrc = fs.readFileSync(path.join(root, "src/lib/passwordAuthHandlers.ts"), "utf8");
  const accountSrc = fs.readFileSync(path.join(root, "src/lib/accountKind.ts"), "utf8");
  const loginSrc = fs.readFileSync(path.join(root, "src/components/LoginModal.tsx"), "utf8");
  const profileEditSrc = fs.readFileSync(path.join(root, "src/components/ProfileEditModal.tsx"), "utf8");
  assert(
    "linked_providers from identities helper after proof only",
    handlerSrc.includes("linked_providers: userId ? classification.linkedProviders : []") &&
      handlerSrc.includes("customerVisibleLinkedProviders(identityProviders)") &&
      handlerSrc.includes('purpose === "recovery"') &&
      accountSrc.includes("REAL `auth.identities`") &&
      !handlerSrc.includes("identity_data"),
  );
  assert(
    "invalid recovery proof still has no linked_providers field",
    handlerSrc.includes("res.status(400).json({ ok: false, error: GENERIC_BAD })") &&
      loginSrc.includes("readLinkedProviders(resolved.json.linked_providers)") &&
      loginSrc.includes("가입하신 방법으로 계속해 주세요.") &&
      loginSrc.includes("passwordResetAllowed && recoverableUsername"),
  );
  assert(
    "ProfileEdit still hides 아이디 unless password_login_enabled",
    profileEditSrc.includes("profile?.password_login_enabled === true"),
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
  const username = typeof googleRow.data?.user_custom_id === "string" ? googleRow.data.user_custom_id : "";
  assert(
    "Google member still usable social-only",
    isUsableMemberProfile(googleRow.data) === true &&
      googleRow.data?.password_login_enabled === false &&
      googleRow.data?.social_login_enabled === true &&
      GENERATED_SOCIAL_USERNAME_RE.test(username),
  );

  const authUser = googleRow.data?.id
    ? await supabaseAdmin.auth.admin.getUserById(googleRow.data.id)
    : { data: { user: null } };
  const identityProviders = (authUser.data.user?.identities ?? []).map((identity) => identity.provider ?? "");
  const linked = customerVisibleLinkedProviders(identityProviders);
  const sqlProviders = countN(
    dbUrl,
    `SELECT count(*)::int AS n FROM auth.identities WHERE provider = 'google' AND user_id IN (${GOOGLE_IDS});`,
  );
  assert(
    "derived linked_providers is [google] from identities",
    (linked.length === 1 && linked[0] === "google") || (identityProviders.length === 0 && sqlProviders === 1),
  );
  if (linked.length === 1) {
    assert("derived list is google only", linked[0] === "google");
  } else {
    assert("SQL google identity still 1 when Admin identities omitted", sqlProviders === 1);
  }

  const failed = results.filter((item) => !item.pass);
  console.log(`RESULT ${failed.length === 0 ? "PASS" : "FAIL"} ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? redact(err.message) : "inspect failed");
  process.exit(1);
});
