/**
 * C2-2 pending-social routing: custom:naver joins google/kakao.
 * No DB mutation. Does not activate the live pending Naver user.
 * Does not print ids, emails, phones, fingerprints, or provider subjects.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  C1_SOCIAL_PROVIDERS,
  USABLE_MEMBER_PROFILE_COLUMNS,
  hasC1SocialIdentity,
  isPendingC1SocialCustomer,
  isUsableMemberProfile,
  resolveAuthCallbackPath,
} from "../src/lib/authIntegrity";
import {
  TRUSTED_SOCIAL_IDENTITY_PROVIDERS,
  isTrustedSocialIdentityProvider,
} from "../src/lib/trustedSocialProviders";
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

function dbQuerySql(dbUrl: string, sql: string): string {
  const tmp = path.join(os.tmpdir(), `metalora-c22-${randomBytes(8).toString("hex")}.sql`);
  fs.writeFileSync(tmp, sql, "utf8");
  try {
    const npxCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");
    const result = fs.existsSync(npxCli)
      ? spawnSync(
          process.execPath,
          [npxCli, "--yes", "supabase", "db", "query", "--db-url", dbUrl, "--file", tmp],
          { encoding: "utf8", maxBuffer: 10_000_000, windowsHide: true, env: process.env, cwd: root },
        )
      : spawnSync(
          process.platform === "win32" ? "npx.cmd" : "npx",
          ["--yes", "supabase", "db", "query", "--db-url", dbUrl, "--file", tmp],
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

const pendingProfile = {
  id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  user_custom_id: null as string | null,
  verified_phone_fingerprint: null as string | null,
  phone_verified_at: null as string | null,
};

const usableProfile = {
  id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  user_custom_id: "mlabcd12ef",
  verified_phone_fingerprint: "c".repeat(64),
  phone_verified_at: "2026-09-28T00:00:00.000Z",
};

const googlePending = { identities: [{ provider: "google" }] };
const kakaoPending = { identities: [{ provider: "kakao" }] };
const naverPending = {
  identities: [{ provider: "custom:naver" }],
  app_metadata: { provider: "custom:naver", providers: ["custom:naver"] },
};
const bareNaver = { identities: [{ provider: "naver" }] };
const customAnything = { identities: [{ provider: "custom:anything" }] };
const passwordGhost = {
  identities: [{ provider: "email" }],
  app_metadata: { provider: "email" },
};

assert(
  "trusted pending providers are google, kakao, custom:naver",
  JSON.stringify(TRUSTED_SOCIAL_IDENTITY_PROVIDERS) ===
    JSON.stringify(["google", "kakao", "custom:naver"])
    && JSON.stringify(C1_SOCIAL_PROVIDERS) ===
      JSON.stringify(["google", "kakao", "custom:naver"]),
);

assert(
  "A Google pending still recognized",
  hasC1SocialIdentity(googlePending) === true
    && isPendingC1SocialCustomer(googlePending, pendingProfile) === true,
);

assert(
  "B Kakao pending still recognized",
  hasC1SocialIdentity(kakaoPending) === true
    && isPendingC1SocialCustomer(kakaoPending, pendingProfile) === true,
);

assert(
  "C custom:naver pending recognized",
  hasC1SocialIdentity(naverPending) === true
    && isPendingC1SocialCustomer(naverPending, pendingProfile) === true
    && isUsableMemberProfile(pendingProfile) === false,
);

assert(
  "D bare naver NOT recognized",
  isTrustedSocialIdentityProvider("naver") === false
    && hasC1SocialIdentity(bareNaver) === false
    && isPendingC1SocialCustomer(bareNaver, pendingProfile) === false,
);

assert(
  "E custom:anything NOT recognized",
  isTrustedSocialIdentityProvider("custom:anything") === false
    && isTrustedSocialIdentityProvider("custom:") === false
    && hasC1SocialIdentity(customAnything) === false
    && isPendingC1SocialCustomer(customAnything, pendingProfile) === false,
);

assert(
  "F activated/usable social member NOT classified pending",
  isUsableMemberProfile(usableProfile) === true
    && isPendingC1SocialCustomer(naverPending, usableProfile) === false
    && isPendingC1SocialCustomer(googlePending, usableProfile) === false,
);

assert(
  "G pending Naver AuthCallback → /login, no Home",
  resolveAuthCallbackPath({
    oauthError: false,
    sessionUser: naverPending,
    profile: pendingProfile,
    redirectRaw: "/",
  }) === "/login",
);

assert(
  "G pending Naver preserves safe redirect query",
  resolveAuthCallbackPath({
    oauthError: false,
    sessionUser: naverPending,
    profile: pendingProfile,
    redirectRaw: "/product/demo",
  }) === "/login?redirect=%2Fproduct%2Fdemo",
);

assert(
  "H usable Naver-equivalent fixture → member redirect",
  resolveAuthCallbackPath({
    oauthError: false,
    sessionUser: naverPending,
    profile: usableProfile,
    redirectRaw: "/",
  }) === "/",
);

assert(
  "K no-session / error still /login",
  resolveAuthCallbackPath({
    oauthError: false,
    sessionUser: null,
    profile: null,
  }) === "/login"
    && resolveAuthCallbackPath({
      oauthError: true,
      sessionUser: naverPending,
      profile: pendingProfile,
    }) === "/login",
);

assert(
  "L password Auth unaffected",
  hasC1SocialIdentity(passwordGhost) === false
    && isPendingC1SocialCustomer(passwordGhost, pendingProfile) === false
    && resolveAuthCallbackPath({
      oauthError: false,
      sessionUser: passwordGhost,
      profile: usableProfile,
      redirectRaw: "/product/demo",
    }) === "/product/demo",
);

const callbackSrc = fs.readFileSync(path.join(root, "src/pages/AuthCallback.tsx"), "utf8");
const authContextSrc = fs.readFileSync(path.join(root, "src/context/AuthContext.tsx"), "utf8");
const headerSrc = fs.readFileSync(path.join(root, "src/components/Header.tsx"), "utf8");
const loginSrc = fs.readFileSync(path.join(root, "src/components/LoginModal.tsx"), "utf8");
const paymentSrc = fs.readFileSync(path.join(root, "src/lib/paymentMemberAuth.ts"), "utf8");
const integritySrc = fs.readFileSync(path.join(root, "src/lib/authIntegrity.ts"), "utf8");

assert(
  "G AuthCallback does not sign out; generic path only",
  !callbackSrc.includes("signOut")
    && callbackSrc.includes("resolveAuthCallbackPath")
    && !callbackSrc.includes("custom:naver")
    && !callbackSrc.includes("exchangeCodeForSession("),
);

assert(
  "I AuthContext Workshop skip uses shared pending helper",
  authContextSrc.includes("isPendingC1SocialCustomer(user, profile)")
    && authContextSrc.includes("setPendingCustomAccess(false)")
    && authContextSrc.includes("setIsWorkshopOpen(true)")
    && !authContextSrc.includes("custom:naver"),
);

assert(
  "J Header member chrome is isUsableMemberProfile, not session",
  (() => {
    const chromeLine = headerSrc.match(/const hasMemberChrome = ([^;]+);/)?.[1] ?? "";
    const accountFn = headerSrc.slice(
      headerSrc.indexOf("const handleAccount"),
      headerSrc.indexOf("const iconTone"),
    );
    return (
      headerSrc.includes("const isUsableCustomer = isProfileResolved && isUsableMemberProfile(profile)")
      && chromeLine.includes("isUsableCustomer")
      && !chromeLine.includes("user")
      && !chromeLine.includes("pendingSocial")
      && headerSrc.includes("isPendingC1SocialCustomer(user, profile)")
      && accountFn.includes("if (hasMemberChrome)")
      && accountFn.includes("openProfile()")
      && accountFn.includes("if (pendingSocialCustomer)")
      && accountFn.includes("openLoginModal()")
      && accountFn.includes("setIsAccountDrawerOpen(true)")
      && accountFn.indexOf("if (hasMemberChrome)") < accountFn.indexOf("if (pendingSocialCustomer)")
      && accountFn.indexOf("if (pendingSocialCustomer)") < accountFn.indexOf("setIsAccountDrawerOpen(true)")
      && !headerSrc.includes("custom:naver")
    );
  })(),
);

assert(
  "J member/payment gates unchanged",
  USABLE_MEMBER_PROFILE_COLUMNS ===
    "id, user_custom_id, verified_phone_fingerprint, phone_verified_at"
    && paymentSrc.includes("isUsableMemberProfile(ownerProfile)")
    && !integritySrc.slice(
      integritySrc.indexOf("export function isUsableMemberProfile"),
      integritySrc.indexOf("export const C1_SOCIAL_PROVIDERS"),
    ).includes("custom:naver"),
);

assert(
  "close semantics remain generic pending-social signOut in LoginModal",
  loginSrc.includes("isPendingC1SocialCustomer(user, profile)")
    && loginSrc.includes("await signOut({ redirect: false, toast: false })")
    && loginSrc.includes("if (!pendingSocial)")
    && !loginSrc.includes("deleteUser"),
);

assert(
  "A3 Naver customer token maps in OAuth helper without leaking Hosted string in row labels",
  fs.readFileSync(path.join(root, "src/components/auth/SocialContinueRow.tsx"), "utf8")
    .includes("Naver로 계속")
    && !fs.readFileSync(path.join(root, "src/components/auth/SocialContinueRow.tsx"), "utf8")
      .includes("custom:naver")
    && fs.readFileSync(path.join(root, "src/components/auth/socialOAuth.ts"), "utf8")
      .includes("custom:naver"),
);

async function inspectLivePendingNaver(): Promise<void> {
  const apiEnv = parseEnvFileRaw(path.join(root, ".env.payment-test.local"));
  const dbEnv = parseEnvFileRaw(path.join(root, ".env.payment-test.db.local"));
  const dbUrlRaw = (process.env.PAYMENT_TEST_DB_URL ?? dbEnv.PAYMENT_TEST_DB_URL ?? "").trim();
  const supabaseUrl = (apiEnv.VITE_SUPABASE_URL ?? "").trim();
  if (!isUsableSupabaseDbUrl(dbUrlRaw)) throw new Error("PAYMENT_TEST_DB_URL missing");
  const classified = classifyPostgresConnection(dbUrlRaw);
  if (classified.isProductionRef || classified.ref !== PAYMENT_TEST_REF) {
    throw new Error("PAYMENT_TEST_DB_URL is not payment-test");
  }
  if (!supabaseUrl.includes(PAYMENT_TEST_REF) || supabaseUrl.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error("VITE_SUPABASE_URL is not payment-test");
  }
  assert("target is payment-test not production", true);

  const dbUrl = encodeDbUrl(dbUrlRaw);
  const naverUsers = parseCount(
    dbQuerySql(
      dbUrl,
      `SELECT count(DISTINCT user_id)::int AS n FROM auth.identities WHERE provider = 'custom:naver';`,
    ),
  );
  const pendingUnusable = parseCount(
    dbQuerySql(
      dbUrl,
      `SELECT count(DISTINCT i.user_id)::int AS n
       FROM auth.identities i
       JOIN public.profiles p ON p.id = i.user_id
       WHERE i.provider = 'custom:naver'
         AND coalesce(nullif(btrim(p.user_custom_id), ''), '') = ''
         AND coalesce(nullif(btrim(p.verified_phone_fingerprint), ''), '') = ''
         AND p.phone_verified_at IS NULL
         AND p.password_login_enabled = false
         AND p.social_login_enabled = false;`,
    ),
  );
  console.log(`live_custom_naver_users=${naverUsers} pending_unusable=${pendingUnusable}`);
  assert("live custom:naver Auth users exist", naverUsers >= 1);
  assert(
    "live pending Naver remains unusable (C2-2 did not activate it)",
    pendingUnusable >= 1,
  );
}

async function main(): Promise<void> {
  await inspectLivePendingNaver();
  const failed = results.filter((item) => !item.pass);
  if (failed.length > 0) {
    console.error(`verify-2f-c2-2-pending-routing FAIL (${failed.length}/${results.length})`);
    process.exit(1);
  }
  console.log(`verify-2f-c2-2-pending-routing PASS (${results.length}/${results.length})`);
}

main().catch((err) => {
  console.error(err instanceof Error ? redact(err.message) : "verify failed");
  process.exit(1);
});
