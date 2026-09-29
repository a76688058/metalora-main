/**
 * C1-3 read-only inspect of the live Google social-first activation.
 * Current lifecycle: one activated Google member; Kakao may exist as a
 * separate pending R2 user. Does not print ids, emails, phones, fingerprints,
 * usernames, tokens, or provider subjects. Does not delete or update rows.
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
  const tmp = path.join(os.tmpdir(), `metalora-c13ga-${randomBytes(8).toString("hex")}.sql`);
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
  const googlePending = countN(
    dbUrl,
    `SELECT count(DISTINCT i.user_id)::int AS n
     FROM auth.identities i
     JOIN public.profiles p ON p.id = i.user_id
     WHERE i.provider = 'google'
       AND p.password_login_enabled = false
       AND p.social_login_enabled = false
       AND p.user_custom_id IS NULL
       AND p.verified_phone_fingerprint IS NULL
       AND p.phone_verified_at IS NULL;`,
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
  const googleProfiles = countN(
    dbUrl,
    `SELECT count(*)::int AS n FROM public.profiles WHERE id IN (${GOOGLE_IDS});`,
  );
  const kakaoUsers = countN(
    dbUrl,
    `SELECT count(DISTINCT user_id)::int AS n FROM auth.identities WHERE provider = 'kakao';`,
  );
  console.log(
    `google_users=${googleUsers} google_pending=${googlePending} google_activated=${googleActivated} google_profiles=${googleProfiles} kakao_users=${kakaoUsers}`,
  );
  assert("same single Google Auth user (no duplicate)", googleUsers === 1 && googleProfiles === 1);
  assert("previous pending Google row is now the activated member", googlePending === 0 && googleActivated === 1);

  const googleIdentityRows = countN(
    dbUrl,
    `SELECT count(*)::int AS n FROM auth.identities WHERE provider = 'google' AND user_id IN (${GOOGLE_IDS});`,
  );
  const emailIdentities = countN(
    dbUrl,
    `SELECT count(*)::int AS n FROM auth.identities WHERE provider = 'email' AND user_id IN (${GOOGLE_IDS});`,
  );
  const kakaoOnGoogle = countN(
    dbUrl,
    `SELECT count(*)::int AS n FROM auth.identities WHERE provider = 'kakao' AND user_id IN (${GOOGLE_IDS});`,
  );
  const metaloraEmailUsers = countN(
    dbUrl,
    `SELECT count(*)::int AS n FROM auth.users
     WHERE id IN (${GOOGLE_IDS})
       AND lower(coalesce(email, '')) LIKE '%@metalora.me';`,
  );
  const providerSet = countN(
    dbUrl,
    `SELECT count(DISTINCT provider)::int AS n FROM auth.identities WHERE user_id IN (${GOOGLE_IDS});`,
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
  assert("google identity PRESENT on that user", googleIdentityRows === 1);
  assert("no email / ml@metalora.me identity on Google member", emailIdentities === 0 && metaloraEmailUsers === 0);
  assert(
    "Kakao if present is a separate pending user, not merged onto Google",
    kakaoOnGoogle === 0 &&
      (kakaoUsers === 0 || (kakaoUsers === 1 && kakaoPending === 1)),
  );
  assert("Google canonical provider set is google only", providerSet === 1);

  const googleIdentityDistinctSubs = countN(
    dbUrl,
    `SELECT count(DISTINCT provider_id)::int AS n FROM auth.identities WHERE provider = 'google';`,
  );
  const duplicateGoogleSubjects = countN(
    dbUrl,
    `SELECT count(*)::int AS n FROM (
       SELECT provider_id FROM auth.identities WHERE provider = 'google' GROUP BY provider_id HAVING count(*) > 1
     ) d;`,
  );
  assert("google identities for canonical user = 1", googleIdentityRows === 1 && googleIdentityDistinctSubs === 1);
  assert("no duplicate Google provider-subject ownership", duplicateGoogleSubjects === 0);

  const returningDidNotRewrite = countN(
    dbUrl,
    `SELECT count(*)::int AS n
     FROM public.profiles p
     JOIN auth.users u ON u.id = p.id
     WHERE p.id IN (${GOOGLE_IDS})
       AND u.last_sign_in_at IS NOT NULL
       AND p.phone_verified_at IS NOT NULL
       AND p.agreed_to_terms_at IS NOT NULL
       AND p.agreed_to_privacy_at IS NOT NULL
       AND p.agreed_to_cookie_at IS NOT NULL
       AND u.last_sign_in_at > p.phone_verified_at
       AND u.last_sign_in_at > p.agreed_to_terms_at
       AND u.last_sign_in_at > p.agreed_to_privacy_at
       AND u.last_sign_in_at > p.agreed_to_cookie_at
       AND p.password_login_enabled = false
       AND p.social_login_enabled = true
       AND p.user_custom_id ~ '^ml[a-z0-9]{10}$';`,
  );
  assert(
    "returning last_sign_in is after activation phone/consents (not rewritten)",
    returningDidNotRewrite === 1,
  );

  const activatedShape = countN(
    dbUrl,
    `SELECT count(*)::int AS n
     FROM public.profiles p
     WHERE p.id IN (${GOOGLE_IDS})
       AND p.password_login_enabled = false
       AND p.social_login_enabled = true
       AND p.user_custom_id ~ '^ml[a-z0-9]{10}$'
       AND p.verified_phone_fingerprint IS NOT NULL
       AND btrim(p.verified_phone_fingerprint) <> ''
       AND p.phone_verified_at IS NOT NULL
       AND p.verified_phone_e164 IS NOT NULL
       AND btrim(p.verified_phone_e164) <> ''
       AND p.agreed_to_terms_at IS NOT NULL
       AND p.agreed_to_privacy_at IS NOT NULL
       AND p.agreed_to_cookie_at IS NOT NULL;`,
  );
  assert("activated profile flags, ml username format, phone, consents PRESENT", activatedShape === 1);

  const fpOwners = countN(
    dbUrl,
    `SELECT count(*)::int AS n
     FROM public.profiles p
     WHERE p.verified_phone_fingerprint = (
       SELECT verified_phone_fingerprint FROM public.profiles WHERE id IN (${GOOGLE_IDS})
     );`,
  );
  assert("exactly one profile owns the verified phone fingerprint", fpOwners === 1);

  const agreements = countN(
    dbUrl,
    `SELECT count(*)::int AS n FROM public.user_agreements WHERE user_id IN (${GOOGLE_IDS});`,
  );
  assert("no user_agreements membership ledger for this activation", agreements === 0);

  const passwordOnly = countN(
    dbUrl,
    `SELECT count(*)::int AS n FROM public.profiles
     WHERE password_login_enabled = true AND social_login_enabled = false;`,
  );
  console.log(`password_only_flag_rows=${passwordOnly}`);
  assert("password-only capability rows still present", passwordOnly >= 2);

  const paymentSrc = fs.readFileSync(path.join(root, "src/lib/paymentMemberAuth.ts"), "utf8");
  const completeSrc = fs.readFileSync(path.join(root, "src/lib/socialAuthHandlers.ts"), "utf8");
  const loginSrc = fs.readFileSync(path.join(root, "src/components/LoginModal.tsx"), "utf8");
  const loginPageSrc = fs.readFileSync(path.join(root, "src/pages/Login.tsx"), "utf8");
  const callbackSrc = fs.readFileSync(path.join(root, "src/lib/authIntegrity.ts"), "utf8");
  const profileEditSrc = fs.readFileSync(path.join(root, "src/components/ProfileEditModal.tsx"), "utf8");
  const headerSrc = fs.readFileSync(path.join(root, "src/components/Header.tsx"), "utf8");
  assert(
    "payment helper still usable-member only, no social bypass",
    paymentSrc.includes("isUsableMemberProfile") &&
      !paymentSrc.includes("social_login_enabled") &&
      paymentSrc.includes("USABLE_MEMBER_PROFILE_COLUMNS"),
  );
  assert(
    "social complete HTTP does not return username",
    completeSrc.includes("res.status(200).json({") &&
      completeSrc.includes("already_complete:") &&
      !completeSrc.includes("user_custom_id") &&
      !completeSrc.includes("recoverable_username"),
  );
  assert(
    "Header member chrome is usable-member, not user_custom_id",
    headerSrc.includes("isUsableMemberProfile(profile)") &&
      headerSrc.includes("hasMemberChrome") &&
      !headerSrc.includes("user_custom_id"),
  );
  assert(
    "social complete UI refreshes profile then gates on isUsableMemberProfile",
    loginSrc.includes("await refreshProfile()") &&
      loginSrc.includes("isUsableMemberProfile(profileRow)") &&
      loginSrc.includes("onClose()"),
  );
  assert(
    "usable member callback/login skips social onboarding",
    callbackSrc.includes("if (isUsableMemberProfile(input.profile))") &&
      loginPageSrc.includes("isUsableMemberProfile(profile)") &&
      loginSrc.includes("pendingSocial ? 'social' : view") &&
      loginSrc.includes("isPendingC1SocialCustomer"),
  );
  assert(
    "ProfileEdit hides 아이디 unless password_login_enabled",
    profileEditSrc.includes("profile?.password_login_enabled === true") &&
      profileEditSrc.includes("formData.user_custom_id"),
  );

  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const socialFlagRows = await supabaseAdmin
    .from("profiles")
    .select(
      "id, user_custom_id, verified_phone_fingerprint, phone_verified_at, phone_number, password_login_enabled, social_login_enabled, verified_phone_e164, agreed_to_terms_at, agreed_to_privacy_at, agreed_to_cookie_at",
    )
    .eq("social_login_enabled", true)
    .eq("password_login_enabled", false);
  const socialRows = socialFlagRows.data ?? [];
  assert("exactly one social-only usable-shaped profile row", socialRows.length === 1);
  const profile = socialRows[0] ?? null;
  const username = typeof profile?.user_custom_id === "string" ? profile.user_custom_id : "";
  const usable = isUsableMemberProfile(profile);
  const authUser = profile?.id
    ? await supabaseAdmin.auth.admin.getUserById(profile.id)
    : { data: { user: null } };
  const identityProviders = [
    ...new Set(
      (authUser.data.user?.identities ?? []).map((identity) => (identity.provider ?? "").trim().toLowerCase()),
    ),
  ].filter(Boolean);
  assert("isUsableMemberProfile(real Google profile) true", usable === true);
  assert("username format ml+10, not printed", GENERATED_SOCIAL_USERNAME_RE.test(username));
  assert("password_login_enabled false", profile?.password_login_enabled === false);
  assert("social_login_enabled true", profile?.social_login_enabled === true);
  assert(
    "getUserById identities google-only or omitted (SQL already proved google-only)",
    identityProviders.length === 0 || (identityProviders.length === 1 && identityProviders[0] === "google"),
  );
  assert(
    "verifyPaymentMember profile predicate PASS (same isUsableMemberProfile, no JWT minted)",
    usable === true &&
      paymentSrc.includes("if (profileError || !isUsableMemberProfile(ownerProfile))"),
  );

  const failed = results.filter((item) => !item.pass);
  console.log(`RESULT ${failed.length === 0 ? "PASS" : "FAIL"} ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? redact(err.message) : "inspect failed");
  process.exit(1);
});
