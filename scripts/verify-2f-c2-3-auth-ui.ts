/**
 * C2-3 A3 Naver customer Auth UI. No live OAuth. Does not activate the pending Naver user.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isPendingC1SocialCustomer } from "../src/lib/authIntegrity";
import { isPhoneAlreadyRegistered } from "../src/components/auth/customerAuthRequests";
import {
  oauthCallbackUrl,
  oauthSdkProvider,
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
const socialRow = read("src/components/auth/SocialContinueRow.tsx");
const socialOAuth = read("src/components/auth/socialOAuth.ts");
const loginPage = read("src/pages/Login.tsx");

const loginSlice = loginModal.slice(
  loginModal.indexOf("surfaceView === 'login'"),
  loginModal.indexOf("surfaceView === 'signup'"),
);
const signupSlice = loginModal.slice(
  loginModal.indexOf("surfaceView === 'signup'"),
  loginModal.indexOf("surfaceView === 'recovery'"),
);
const socialSlice = loginModal.slice(
  loginModal.indexOf("surfaceView === 'social'"),
  loginModal.lastIndexOf("</AnimatePresence>"),
);

assert(
  "A Login renders Google/Kakao/Naver continue",
  loginSlice.includes("<SocialContinueRow")
    && socialRow.includes("Google로 계속")
    && socialRow.includes("카카오로 계속")
    && socialRow.includes("Naver로 계속"),
);

assert(
  "B Signup social entry renders all three",
  signupSlice.includes("<SocialContinueRow")
    && socialRow.includes("Google로 계속")
    && socialRow.includes("카카오로 계속")
    && socialRow.includes("Naver로 계속"),
);

let startedGoogle = false;
let startedKakao = false;
let startedNaver = false;
let naverProviderArg = "";
let usedRawAuthorize = false;
let usedBareNaver = false;
const mockClient = {
  auth: {
    signInWithOAuth: async (args: {
      provider: "google" | "kakao" | "custom:naver";
      options: { redirectTo: string };
    }) => {
      if (args.provider === "google") startedGoogle = true;
      if (args.provider === "kakao") startedKakao = true;
      if (args.provider === "custom:naver") {
        startedNaver = true;
        naverProviderArg = args.provider;
      }
      if ((args.provider as string) === "naver") usedBareNaver = true;
      if (args.options.redirectTo.includes("/auth/v1/authorize")) usedRawAuthorize = true;
      if (
        !args.options.redirectTo.endsWith("/auth/callback")
        && !args.options.redirectTo.includes("/auth/callback?")
      ) {
        return { error: { message: "bad redirect" } };
      }
      return { error: null };
    },
  },
};

const naverCall = await startBrowserSocialOAuth(
  mockClient,
  "naver",
  "http://127.0.0.1:3000/auth/callback",
);
const googleCall = await startBrowserSocialOAuth(
  mockClient,
  "google",
  "http://127.0.0.1:3000/auth/callback",
);
const kakaoCall = await startBrowserSocialOAuth(
  mockClient,
  "kakao",
  "http://127.0.0.1:3000/auth/callback",
);

assert(
  "C Naver click calls signInWithOAuth provider=custom:naver",
  naverCall.ok === true
    && startedNaver
    && naverProviderArg === "custom:naver"
    && oauthSdkProvider("naver") === "custom:naver"
    && usedBareNaver === false
    && !socialRow.includes('onContinue(\'custom:naver\')'),
);

assert(
  "D redirectTo remains same-origin /auth/callback",
  oauthCallbackUrl("http://127.0.0.1:3000", "/") === "http://127.0.0.1:3000/auth/callback"
    && oauthCallbackUrl("http://127.0.0.1:3000", "/cart") ===
      "http://127.0.0.1:3000/auth/callback?redirect=%2Fcart"
    && !socialOAuth.includes("/auth/v1/authorize")
    && usedRawAuthorize === false,
);

assert(
  "E Google provider unchanged",
  googleCall.ok === true
    && startedGoogle
    && oauthSdkProvider("google") === "google"
    && socialRow.includes("Google로 계속"),
);

assert(
  "F Kakao provider unchanged",
  kakaoCall.ok === true
    && startedKakao
    && oauthSdkProvider("kakao") === "kakao"
    && socialRow.includes("카카오로 계속"),
);

assert(
  "G linked_providers=['naver'] renders Naver로 계속",
  JSON.stringify(readLinkedProviders(["naver"])) === JSON.stringify(["naver"])
    && JSON.stringify(readLinkedProviders(["google", "kakao", "naver"])) ===
      JSON.stringify(["google", "kakao", "naver"])
    && loginModal.includes("providers={linkedProviders}")
    && socialRow.includes("showNaver")
    && socialRow.includes("Naver로 계속"),
);

assert(
  "H customer UI never renders custom:naver",
  !loginModal.includes("custom:naver")
    && !socialRow.includes("custom:naver")
    && !loginPage.includes("custom:naver")
    && socialOAuth.includes("custom:naver")
    && socialOAuth.includes("NAVER_OAUTH_PROVIDER"),
);

assert(
  "I pending Naver reuses generic onboarding: no email, username, or password",
  loginModal.includes("isPendingC1SocialCustomer(user, profile)")
    && loginModal.includes("surfaceView === 'social'")
    && socialSlice.includes("휴대폰 인증으로 가입을 완료해 주세요.")
    && socialSlice.includes("sendOtp('identity_link')")
    && socialSlice.includes("이용약관 동의")
    && socialSlice.includes("가입하기")
    && !socialSlice.includes("user.email")
    && !socialSlice.includes("user_custom_id")
    && !socialSlice.includes('name="password"')
    && !socialSlice.includes('id="social-username"')
    && !socialSlice.includes("nickname")
    && isPendingC1SocialCustomer(
      {
        identities: [{ provider: "custom:naver" }],
        app_metadata: { provider: "custom:naver", providers: ["custom:naver"] },
      },
      {
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        user_custom_id: null,
        verified_phone_fingerprint: null,
        phone_verified_at: null,
      },
    ) === true,
);

const abandonSrc = loginModal.slice(
  loginModal.indexOf("const abandonOrClose"),
  loginModal.indexOf("const handleClose"),
);
assert(
  "J pending X signout unchanged",
  abandonSrc.includes("if (!pendingSocial)")
    && abandonSrc.includes("await signOut({ redirect: false, toast: false })")
    && abandonSrc.includes("resetAuthSurface()")
    && abandonSrc.includes("onClose()")
    && !loginModal.includes("deleteUser")
    && !socialOAuth.includes("deleteUser"),
);

assert(
  "K R2 collision handling unchanged",
  isPhoneAlreadyRegistered(409, { code: "phone_already_registered" }) === true
    && loginModal.includes("returnToLoginAfterCollision")
    && loginModal.includes("setPhoneCollisionNotice(true)")
    && loginModal.includes("PHONE_ALREADY_REGISTERED_COPY")
    && !loginModal.toLowerCase().includes("naver collision")
    && !loginModal.includes("Naver 계정"),
);

assert(
  "L password recovery unchanged",
  loginModal.includes("/api/auth/password-reset")
    && loginModal.includes("비밀번호 재설정")
    && loginModal.includes("passwordResetAllowed")
    && loginModal.includes("recoverableUsername")
    && readLinkedProviders(["email"]).length === 0
    && readLinkedProviders(["custom:naver"]).length === 0,
);

assert(
  "M C1 helper contracts still hold",
  loginModal.includes("signInWithPassword")
    && loginModal.includes("/api/auth/social/complete")
    && loginModal.includes("proof_token: identityLinkProof")
    && !loginModal.includes("exchangeCodeForSession"),
);

const failed = results.filter((item) => !item.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  process.exitCode = 1;
}
