/**
 * C1-1 AuthCallback / pending-social routing checks.
 * No DB mutation. No production. No live Kakao. Does not activate Google membership.
 */
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import {
  PROFILE_COLUMNS,
  authCallbackHasOAuthError,
  authCallbackLoginPath,
  hasC1SocialIdentity,
  isPendingC1SocialCustomer,
  isUsableMemberProfile,
  resolveAuthCallbackPath,
  safeInternalPath,
} from "../src/lib/authIntegrity";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

type TestResult = { name: string; pass: boolean };
const results: TestResult[] = [];

function assert(name: string, condition: boolean): void {
  results.push({ name, pass: condition });
  console.log(`${condition ? "PASS" : "FAIL"}: ${name}`);
}

const usablePassword = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  user_custom_id: "passworduser",
  verified_phone_fingerprint: "b".repeat(64),
  phone_verified_at: "2026-09-28T00:00:00.000Z",
};

const pendingProfile = {
  id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  user_custom_id: null as string | null,
  verified_phone_fingerprint: null as string | null,
  phone_verified_at: null as string | null,
  phone_number: "010-1111-2222",
};

const googlePendingUser = {
  identities: [{ provider: "google" }],
  app_metadata: { providers: ["google"] },
};

const kakaoPendingUser = {
  identities: [{ provider: "kakao" }],
};

const passwordGhostUser = {
  identities: [{ provider: "email" }],
  app_metadata: { provider: "email", providers: ["email"] },
};

const naverOnlyUser = {
  identities: [{ provider: "naver" }],
};

const usableSocialUser = {
  identities: [{ provider: "google" }],
};

const usableSocialProfile = {
  id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  user_custom_id: "mlabcd12ef",
  verified_phone_fingerprint: "c".repeat(64),
  phone_verified_at: "2026-09-28T00:00:00.000Z",
};

const emptySearch = { get: (_name: string) => null };
const errorSearch = {
  get: (name: string) => (name === "error" ? "access_denied" : null),
};

assert(
  "A no session callback → /login",
  resolveAuthCallbackPath({
    oauthError: false,
    sessionUser: null,
    profile: null,
  }) === "/login",
);

assert(
  "B usable password-member → requested safe redirect",
  resolveAuthCallbackPath({
    oauthError: false,
    sessionUser: passwordGhostUser,
    profile: usablePassword,
    redirectRaw: "/product/demo",
  }) === "/product/demo",
);

assert(
  "B usable password-member without redirect → /",
  resolveAuthCallbackPath({
    oauthError: false,
    sessionUser: passwordGhostUser,
    profile: usablePassword,
    redirectRaw: null,
  }) === "/",
);

const pendingDest = resolveAuthCallbackPath({
  oauthError: false,
  sessionUser: googlePendingUser,
  profile: pendingProfile,
  redirectRaw: "/",
});
assert(
  "C pending Google session → /login (not Home)",
  pendingDest === "/login",
);

assert(
  "C pending Kakao session → /login",
  resolveAuthCallbackPath({
    oauthError: false,
    sessionUser: kakaoPendingUser,
    profile: pendingProfile,
  }) === "/login",
);

assert(
  "C pending social preserves checkout redirect on /login",
  resolveAuthCallbackPath({
    oauthError: false,
    sessionUser: googlePendingUser,
    profile: pendingProfile,
    redirectRaw: "/payment/success",
  }) === "/login?redirect=%2Fpayment%2Fsuccess",
);

assert(
  "D pending social is not usable",
  isPendingC1SocialCustomer(googlePendingUser, pendingProfile) === true
    && isUsableMemberProfile(pendingProfile) === false,
);

assert(
  "D contact phone does not make pending social usable",
  isUsableMemberProfile({
    ...pendingProfile,
    phone_number: "010-9999-0000",
  }) === false,
);

assert(
  "E payment-gate helper rejects pending social (same isUsableMemberProfile)",
  isUsableMemberProfile(pendingProfile) === false,
);

assert(
  "F usable social-shaped fixture routes as member",
  hasC1SocialIdentity(usableSocialUser) === true
    && isUsableMemberProfile(usableSocialProfile) === true
    && isPendingC1SocialCustomer(usableSocialUser, usableSocialProfile) === false
    && resolveAuthCallbackPath({
      oauthError: false,
      sessionUser: usableSocialUser,
      profile: usableSocialProfile,
      redirectRaw: "/",
    }) === "/",
);

assert(
  "G open redirect blocked",
  safeInternalPath("https://evil.example") === "/"
    && safeInternalPath("//evil.example") === "/"
    && authCallbackLoginPath("https://evil.example") === "/login",
);

assert(
  "G empty search is not an OAuth error",
  authCallbackHasOAuthError(emptySearch) === false,
);

assert(
  "D error callback → /login",
  authCallbackHasOAuthError(errorSearch) === true
    && resolveAuthCallbackPath({
      oauthError: true,
      sessionUser: googlePendingUser,
      profile: pendingProfile,
    }) === "/login",
);

assert(
  "H incomplete password/raw account is not C1 social onboarding",
  hasC1SocialIdentity(passwordGhostUser) === false
    && isPendingC1SocialCustomer(passwordGhostUser, pendingProfile) === false,
);

assert(
  "H Naver-only is not C1 social onboarding",
  hasC1SocialIdentity(naverOnlyUser) === false,
);

assert(
  "H ml prefix / email domain are not identity authority",
  hasC1SocialIdentity({
    identities: [{ provider: "email" }],
    app_metadata: { provider: "email" },
  }) === false,
);

assert(
  "H trusted app_metadata.provider google is C1 social",
  hasC1SocialIdentity({
    identities: [],
    app_metadata: { provider: "google" },
  }) === true,
);

const callbackSrc = fs.readFileSync(path.join(root, "src/pages/AuthCallback.tsx"), "utf8");
const authContextSrc = fs.readFileSync(path.join(root, "src/context/AuthContext.tsx"), "utf8");
const loginSrc = fs.readFileSync(path.join(root, "src/pages/Login.tsx"), "utf8");
const paymentSrc = fs.readFileSync(path.join(root, "src/lib/paymentMemberAuth.ts"), "utf8");

assert(
  "H callback does not print raw OAuth error payloads or tokens",
  !callbackSrc.includes("error_description")
    && !callbackSrc.includes("access_token")
    && !callbackSrc.includes("refresh_token")
    && !callbackSrc.includes("provider_token")
    && !callbackSrc.includes("console.error"),
);

assert(
  "H callback does not invent raw /authorize or exchangeCodeForSession",
  !callbackSrc.includes("/auth/v1/authorize")
    && !callbackSrc.includes("exchangeCodeForSession(")
    && !callbackSrc.includes("signInWithOAuth")
    && callbackSrc.includes("getSession()"),
);

assert(
  "H callback does not sign out pending social",
  !callbackSrc.includes("signOut"),
);

assert(
  "I Login.tsx still gates success on isUsableMemberProfile (untouched A3)",
  loginSrc.includes("isUsableMemberProfile(profile)"),
);

assert(
  "I PROFILE_COLUMNS still omits verified_phone_e164",
  PROFILE_COLUMNS.includes("verified_phone_fingerprint")
    && PROFILE_COLUMNS.includes("phone_verified_at")
    && !PROFILE_COLUMNS.includes("verified_phone_e164"),
);

assert(
  "I payment member gate still uses isUsableMemberProfile",
  paymentSrc.includes("isUsableMemberProfile(ownerProfile)"),
);

assert(
  "I AuthContext skips Workshop continuation for pending C1 social only",
  authContextSrc.includes("isPendingC1SocialCustomer(user, profile)")
    && authContextSrc.includes("setIsWorkshopOpen(true)"),
);

assert(
  "I AuthCallback chrome is not indigo SaaS spinner",
  callbackSrc.includes("bg-[#07080a]")
    && !callbackSrc.includes("text-indigo-500"),
);

const failed = results.filter((item) => !item.pass);
if (failed.length > 0) {
  console.error(`verify-2f-c1-1-callback FAIL (${failed.length}/${results.length})`);
  process.exit(1);
}
console.log(`verify-2f-c1-1-callback PASS (${results.length}/${results.length})`);
