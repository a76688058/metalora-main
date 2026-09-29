/**
 * C1 microfix: PROFILE_COLUMNS includes explicit capability flags.
 * Payment-test read-only. Does not print ids, usernames, emails, phones,
 * fingerprints, tokens, or provider subjects. Does not mutate.
 */
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  PROFILE_COLUMNS,
  USABLE_MEMBER_PROFILE_COLUMNS,
  isUsableMemberProfile,
} from "../src/lib/authIntegrity";
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

function flagShape(row: Record<string, unknown> | null): {
  passwordPresent: boolean;
  socialPresent: boolean;
  password_login_enabled: unknown;
  social_login_enabled: unknown;
  hasE164: boolean;
  usable: boolean;
} | null {
  if (!row) return null;
  return {
    passwordPresent: typeof row.password_login_enabled === "boolean",
    socialPresent: typeof row.social_login_enabled === "boolean",
    password_login_enabled: row.password_login_enabled,
    social_login_enabled: row.social_login_enabled,
    hasE164: Object.prototype.hasOwnProperty.call(row, "verified_phone_e164"),
    usable: isUsableMemberProfile(row as Parameters<typeof isUsableMemberProfile>[0]),
  };
}

async function main(): Promise<void> {
  assert(
    "PROFILE_COLUMNS includes both capability flags",
    PROFILE_COLUMNS.includes("password_login_enabled")
      && PROFILE_COLUMNS.includes("social_login_enabled"),
  );
  assert(
    "PROFILE_COLUMNS still omits e164 / identity / token fields",
    !PROFILE_COLUMNS.includes("verified_phone_e164")
      && !PROFILE_COLUMNS.includes("identity_data")
      && !PROFILE_COLUMNS.includes("provider_token")
      && !PROFILE_COLUMNS.includes("provider_id"),
  );
  assert(
    "USABLE_MEMBER_PROFILE_COLUMNS unchanged (no capability flags)",
    USABLE_MEMBER_PROFILE_COLUMNS ===
      "id, user_custom_id, verified_phone_fingerprint, phone_verified_at",
  );
  assert(
    "isUsableMemberProfile still ignores capability flags",
    isUsableMemberProfile({
      id: "11111111-1111-1111-1111-111111111111",
      user_custom_id: "trusteduser",
      verified_phone_fingerprint: "a".repeat(64),
      phone_verified_at: "2026-09-24T00:00:00.000Z",
      password_login_enabled: false,
      social_login_enabled: true,
    } as Parameters<typeof isUsableMemberProfile>[0]) === true
      && isUsableMemberProfile({
        id: "11111111-1111-1111-1111-111111111111",
        user_custom_id: "",
        verified_phone_fingerprint: "a".repeat(64),
        phone_verified_at: "2026-09-24T00:00:00.000Z",
        password_login_enabled: true,
        social_login_enabled: true,
      } as Parameters<typeof isUsableMemberProfile>[0]) === false,
  );

  const authContextSrc = fs.readFileSync(path.join(root, "src/context/AuthContext.tsx"), "utf8");
  const integritySrc = fs.readFileSync(path.join(root, "src/lib/authIntegrity.ts"), "utf8");
  assert(
    "AuthContext still selects PROFILE_COLUMNS with no capability branching",
    authContextSrc.includes(".select(PROFILE_COLUMNS)")
      && !authContextSrc.includes("password_login_enabled")
      && !authContextSrc.includes("social_login_enabled"),
  );
  assert(
    "isUsableMemberProfile source still has no capability-flag gate",
    /export function isUsableMemberProfile[\s\S]*?^export /m.test(integritySrc)
      && !integritySrc.slice(
        integritySrc.indexOf("export function isUsableMemberProfile"),
        integritySrc.indexOf("export const C1_SOCIAL_PROVIDERS"),
      ).includes("password_login_enabled"),
  );

  const apiEnv = parseEnvFileRaw(path.join(root, ".env.payment-test.local"));
  const dbEnv = parseEnvFileRaw(path.join(root, ".env.payment-test.db.local"));
  const dbUrlRaw = (process.env.PAYMENT_TEST_DB_URL ?? dbEnv.PAYMENT_TEST_DB_URL ?? "").trim();
  const supabaseUrl = (apiEnv.VITE_SUPABASE_URL ?? "").trim();
  const serviceKey = (apiEnv.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!isUsableSupabaseDbUrl(dbUrlRaw)) throw new Error("PAYMENT_TEST_DB_URL missing");
  const classified = classifyPostgresConnection(dbUrlRaw);
  if (classified.isProductionRef || classified.ref !== PAYMENT_TEST_REF) {
    throw new Error("PAYMENT_TEST_DB_URL is not payment-test");
  }
  if (!supabaseUrl.includes(PAYMENT_TEST_REF) || supabaseUrl.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error("VITE_SUPABASE_URL is not payment-test");
  }
  assert("target is payment-test not production", true);

  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const passwordRows = await supabaseAdmin
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("password_login_enabled", true)
    .eq("social_login_enabled", false)
    .limit(8);
  if (passwordRows.error) throw new Error(redact(passwordRows.error.message));
  const passwordUsable = (passwordRows.data ?? []).find((row) =>
    isUsableMemberProfile(row),
  ) as Record<string, unknown> | undefined;
  const passwordShape = flagShape(passwordUsable ?? null);
  console.log(
    `password_member_shape password_present=${passwordShape?.passwordPresent === true} social_present=${passwordShape?.socialPresent === true} password_login_enabled=${String(passwordShape?.password_login_enabled)} social_login_enabled=${String(passwordShape?.social_login_enabled)} usable=${String(passwordShape?.usable)} has_e164=${String(passwordShape?.hasE164)}`,
  );
  assert(
    "password member PROFILE_COLUMNS fetch populates flags",
    passwordShape?.passwordPresent === true
      && passwordShape.socialPresent === true
      && passwordShape.password_login_enabled === true
      && passwordShape.social_login_enabled === false
      && passwordShape.usable === true
      && passwordShape.hasE164 === false,
  );

  const socialRows = await supabaseAdmin
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("password_login_enabled", false)
    .eq("social_login_enabled", true)
    .limit(8);
  if (socialRows.error) throw new Error(redact(socialRows.error.message));
  const socialUsable = (socialRows.data ?? []).find((row) =>
    isUsableMemberProfile(row),
  ) as Record<string, unknown> | undefined;
  const socialShape = flagShape(socialUsable ?? null);
  console.log(
    `social_member_shape password_present=${socialShape?.passwordPresent === true} social_present=${socialShape?.socialPresent === true} password_login_enabled=${String(socialShape?.password_login_enabled)} social_login_enabled=${String(socialShape?.social_login_enabled)} usable=${String(socialShape?.usable)} has_e164=${String(socialShape?.hasE164)}`,
  );
  assert(
    "activated social-only PROFILE_COLUMNS fetch populates flags",
    socialShape?.passwordPresent === true
      && socialShape.socialPresent === true
      && socialShape.password_login_enabled === false
      && socialShape.social_login_enabled === true
      && socialShape.usable === true
      && socialShape.hasE164 === false,
  );

  const failed = results.filter((item) => !item.pass);
  if (failed.length > 0) {
    console.error(`verify-2f-c1-profile-capability-flags FAIL (${failed.length}/${results.length})`);
    process.exit(1);
  }
  console.log(`verify-2f-c1-profile-capability-flags PASS (${results.length}/${results.length})`);
}

main().catch((err) => {
  console.error(err instanceof Error ? redact(err.message) : "verify failed");
  process.exit(1);
});
