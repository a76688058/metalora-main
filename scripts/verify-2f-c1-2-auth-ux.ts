/**
 * C1-2 A3 Google/Kakao customer Auth UX checks.
 * No live OAuth. No Kakao start. Does not activate Google membership.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasC1SocialIdentity, isPendingC1SocialCustomer } from "../src/lib/authIntegrity";
import {
  isPhoneAlreadyRegistered,
  mapSocialCompleteError,
} from "../src/components/auth/customerAuthRequests";
import {
  oauthCallbackUrl,
  readLinkedProviders,
  startBrowserSocialOAuth,
} from "../src/components/auth/socialOAuth";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

type TestResult = { name: string; pass: boolean };
const results: TestResult[] = [];

function assert(name: string, condition: boolean): void {
  results.push({ name, pass: condition });
  console.log(`${condition ? "PASS" : "FAIL"}: ${name}`);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const loginModal = read("src/components/LoginModal.tsx");
const loginPage = read("src/pages/Login.tsx");
const socialRow = read("src/components/auth/SocialContinueRow.tsx");
const socialOAuth = read("src/components/auth/socialOAuth.ts");
const customerAuth = read("src/components/auth/customerAuthRequests.ts");
const authCallback = read("src/pages/AuthCallback.tsx");
const authContext = read("src/context/AuthContext.tsx");
const authIntegrity = read("src/lib/authIntegrity.ts");
const inquiry = read("src/components/InquiryModal.tsx");
const orders = read("src/components/OrdersModal.tsx");
const profileEdit = read("src/components/ProfileEditModal.tsx");
const profileOverlay = read("src/components/ProfileOverlay.tsx");
const profileComplete = read("src/pages/ProfileComplete.tsx");

assert(
  "A password Login form still present",
  loginModal.includes('handleLogin')
    && loginModal.includes("아이디")
    && loginModal.includes("비밀번호")
    && loginModal.includes("signInWithPassword"),
);

assert(
  "B password Signup still renders required fields",
  loginModal.includes('handleSignupComplete')
    && loginModal.includes("비밀번호 확인")
    && loginModal.includes("username-check")
    && loginModal.includes("signupProof")
    && loginModal.includes("이용약관 동의"),
);

const googleStart = loginModal.includes("handleSocialContinue")
  && socialRow.includes("Google로 계속")
  && socialOAuth.includes("signInWithOAuth")
  && socialOAuth.includes("provider")
  && socialOAuth.includes("/auth/callback");

assert("C Google button uses browser signInWithOAuth + same-origin /auth/callback", googleStart);

assert(
  "D Kakao button uses provider kakao + same-origin /auth/callback",
  socialRow.includes("카카오로 계속")
    && socialRow.includes("kakao")
    && (socialOAuth.includes("'kakao'") || socialOAuth.includes('"kakao"'))
    && oauthCallbackUrl("http://127.0.0.1:3000", "/") === "http://127.0.0.1:3000/auth/callback",
);

assert(
  "E Google/Kakao/Naver continue labels are present",
  socialRow.includes("Google로 계속")
    && socialRow.includes("카카오로 계속")
    && socialRow.includes("Naver로 계속")
    && !socialRow.includes("custom:naver")
    && !loginModal.includes("custom:naver"),
);

assert(
  "F pending Google/Kakao session renders social onboarding",
  loginModal.includes("isPendingC1SocialCustomer")
    && loginModal.includes("surfaceView === 'social'")
    && loginModal.includes("휴대폰 인증으로 가입을 완료해 주세요.")
    && loginModal.includes("identity_link"),
);

const passwordGhost = {
  identities: [{ provider: "email" }],
  app_metadata: { provider: "email", providers: ["email"] },
};
const pendingProfile = {
  id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  user_custom_id: null as string | null,
  verified_phone_fingerprint: null as string | null,
  phone_verified_at: null as string | null,
};
assert(
  "G historical email/password incomplete is not social onboarding",
  hasC1SocialIdentity(passwordGhost) === false
    && isPendingC1SocialCustomer(passwordGhost, pendingProfile) === false
    && !loginModal.includes("ml prefix")
    && loginModal.includes("isPendingC1SocialCustomer(user, profile)"),
);

assert(
  "H OTP send uses identity_link",
  loginModal.includes("sendOtp('identity_link')")
    && loginModal.includes("purpose === 'identity_link'"),
);

assert(
  "I OTP proof is internal only",
  loginModal.includes("setIdentityLinkProof(token)")
    && loginModal.includes("proof_token: identityLinkProof")
    && !loginModal.includes("{identityLinkProof}"),
);

assert(
  "J missing required consent blocks social complete",
  loginModal.includes("if (!allChecked)")
    && loginModal.includes("socialReady = Boolean(identityLinkProof) && allChecked")
    && loginModal.includes("disabled={isLoading || !socialReady || abandoningPending}"),
);

assert(
  "K successful social complete refreshes profile before continue",
  loginModal.includes("await refreshProfile()")
    && loginModal.includes("/api/auth/social/complete")
    && loginModal.includes("isUsableMemberProfile(profileRow)"),
);

assert(
  "L 409 phone_already_registered notice state + signout + login",
  isPhoneAlreadyRegistered(409, { code: "phone_already_registered" }) === true
    && mapSocialCompleteError(409, { code: "phone_already_registered" }).includes("이미 가입된 번호입니다.")
    && mapSocialCompleteError(409, { code: "phone_already_registered" }).includes("기존 로그인으로 이용해 주세요.")
    && !mapSocialCompleteError(409, { code: "phone_already_registered" }).includes("user_custom_id")
    && loginModal.includes("returnToLoginAfterCollision")
    && loginModal.includes("setPhoneCollisionNotice(true)")
    && loginModal.includes("phoneCollisionNotice")
    && loginModal.includes("ml-auth-notice")
    && loginModal.includes("아이디로 로그인")
    && !loginModal.includes("setErrorMsg(PHONE_ALREADY_REGISTERED_COPY)")
    && loginModal.includes("signOut({ redirect: false, toast: false })"),
);

const socialBlock = loginModal.slice(
  loginModal.indexOf("surfaceView === 'social'"),
  loginModal.indexOf("key=\"social\"") > 0 ? loginModal.length : loginModal.length,
);
assert(
  "M social onboarding never displays ml internal username",
  !loginModal.includes("user_custom_id")
    && !socialBlock.includes("user.email")
    && loginModal.includes("휴대폰 인증으로 가입을 완료해 주세요."),
);

assert(
  "N recovery/password flow remains",
  loginModal.includes("/api/auth/password-reset")
    && loginModal.includes("비밀번호 재설정")
    && loginModal.includes("passwordResetAllowed"),
);

assert(
  "O provider-return UI only from trusted linked_providers",
  loginModal.includes("readLinkedProviders(resolved.json.linked_providers)")
    && loginModal.includes("linkedProviders.length > 0")
    && socialOAuth.includes("readLinkedProviders")
    && JSON.stringify(readLinkedProviders(["google", "naver", "email", "kakao"])) === JSON.stringify(["google", "naver", "kakao"])
    && readLinkedProviders(["custom:naver", "custom:foo"]).length === 0
    && readLinkedProviders("google").length === 0
    && readLinkedProviders([{ provider: "google" }]).length === 0,
);

assert(
  "PKCE does not use raw authorize or code exchange",
  !loginModal.includes("/auth/v1/authorize")
    && !loginModal.includes("exchangeCodeForSession")
    && !socialOAuth.includes("/auth/v1/authorize"),
);

assert(
  "safe redirect uses A0 callback query, not open redirect",
  oauthCallbackUrl("http://127.0.0.1:3000", "https://evil.example") === "http://127.0.0.1:3000/auth/callback"
    && oauthCallbackUrl("http://127.0.0.1:3000", "/cart") === "http://127.0.0.1:3000/auth/callback?redirect=%2Fcart",
);

assert(
  "A0 AuthCallback/AuthContext/authIntegrity untouched by this script's source snapshot",
  authCallback.includes("resolveAuthCallbackPath")
    && authContext.includes("isPendingC1SocialCustomer")
    && authIntegrity.includes("hasC1SocialIdentity"),
);

assert(
  "Login.tsx still gates usable members only",
  loginPage.includes("isUsableMemberProfile(profile)"),
);

assert(
  "Bearer access token used for identity_link and social complete",
  customerAuth.includes("Authorization")
    && loginModal.includes("accessToken")
    && loginModal.includes("session?.access_token"),
);

assert(
  "no fingerprint / phone_verified_at / internal username in complete payload",
  loginModal.includes("proof_token: identityLinkProof")
    && !loginModal.includes("phone_verified_at")
    && !loginModal.includes("fingerprint")
    && !loginModal.includes("user_custom_id:"),
);

let startedGoogle = false;
let startedKakao = false;
let usedRawAuthorize = false;
const mockClient = {
  auth: {
    signInWithOAuth: async (args: { provider: "google" | "kakao" | "custom:naver"; options: { redirectTo: string } }) => {
      if (args.provider === "google") startedGoogle = true;
      if (args.provider === "kakao") startedKakao = true;
      if (args.options.redirectTo.includes("/auth/v1/authorize")) usedRawAuthorize = true;
      if (!args.options.redirectTo.endsWith("/auth/callback") && !args.options.redirectTo.includes("/auth/callback?")) {
        return { error: { message: "bad redirect" } };
      }
      return { error: null };
    },
  },
};
const googleCall = await startBrowserSocialOAuth(mockClient, "google", "http://127.0.0.1:3000/auth/callback");
const kakaoCall = await startBrowserSocialOAuth(mockClient, "kakao", "http://127.0.0.1:3000/auth/callback");
assert(
  "mocked PKCE start google/kakao only, no raw authorize",
  googleCall.ok === true
    && kakaoCall.ok === true
    && startedGoogle
    && startedKakao
    && usedRawAuthorize === false,
);

const failCall = await startBrowserSocialOAuth(
  { auth: { signInWithOAuth: async () => ({ error: { message: "provider exploded" } }) } },
  "google",
  "http://127.0.0.1:3000/auth/callback",
);
assert("OAuth start failure is generic ok:false (no raw exception leak in helper)", failCall.ok === false);

assert(
  "preserved Profile/Inquiry/Orders files still exist (not deleted)",
  inquiry.length > 0 && orders.length > 0 && profileEdit.length > 0 && profileOverlay.length > 0 && profileComplete.length > 0,
);

const abandonSrc = loginModal.slice(
  loginModal.indexOf("const abandonOrClose"),
  loginModal.indexOf("const handleClose"),
);
assert(
  "A pending social X signs out, clears onboarding, then closes",
  abandonSrc.includes("if (!pendingSocial)")
    && abandonSrc.includes("await signOut({ redirect: false, toast: false })")
    && abandonSrc.includes("resetAuthSurface()")
    && abandonSrc.includes("onClose()")
    && loginModal.includes("void abandonOrClose()"),
);
assert(
  "B pending social X does not delete Auth user",
  !loginModal.includes("deleteUser")
    && !loginModal.includes("unlinkIdentity")
    && !socialOAuth.includes("deleteUser"),
);
assert(
  "C ordinary Login close does not sign out",
  abandonSrc.includes("if (!pendingSocial)")
    && /if \(!pendingSocial\) \{\s*onClose\(\);\s*return;/.test(abandonSrc)
    && abandonSrc.indexOf("if (!pendingSocial)") < abandonSrc.indexOf("await signOut"),
);
assert(
  "D Signup close still uses shared isOpen resetAuthSurface",
  loginModal.includes("if (isOpen)")
    && loginModal.includes("resetAuthSurface()")
    && loginModal.includes("goView('signup')"),
);
assert(
  "E Recovery close path still goView/goBack",
  loginModal.includes("goView('recovery')")
    && loginModal.includes("goView('login')"),
);
assert(
  "F usable member finish still onSuccess",
  loginModal.includes("const finishAuthenticated")
    && loginModal.includes("if (onSuccess) onSuccess()"),
);
assert(
  "G R2 409 still signs out to Login",
  loginModal.includes("returnToLoginAfterCollision")
    && loginModal.includes("await signOut({ redirect: false, toast: false })"),
);
assert(
  "H abandon does not remove provider identity (resume remains possible)",
  !abandonSrc.includes("deleteUser")
    && abandonSrc.includes("signOut({ redirect: false, toast: false })"),
);
assert(
  "polish OTP hint and recovery/social notice wells",
  loginModal.includes("인증번호를 입력해 주세요.")
    && loginModal.includes("가입하신 방법으로 계속해 주세요.")
    && loginModal.includes("<AuthNotice>")
    && socialRow.includes("ml-auth-social-mark")
    && socialRow.includes("function AuthNotice"),
);

const failed = results.filter((item) => !item.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  process.exitCode = 1;
}
