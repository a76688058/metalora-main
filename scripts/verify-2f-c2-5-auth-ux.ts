/**
 * C2-5 unified Auth UX: error mapping + provider-row contracts.
 * No live OAuth. No Auth user mutation.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isOtpExpiryCustomerCopy,
  isProofExpirySignal,
  mapSignupCompleteError,
  mapSocialCompleteError,
} from "../src/components/auth/customerAuthRequests";
import { C1_SOCIAL_PROVIDERS, oauthSdkProvider } from "../src/components/auth/socialOAuth";

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

assert(
  "generic social_complete 400 does not claim OTP expired",
  mapSocialCompleteError(400, { ok: false, error: "bad_request" }) ===
    "가입을 완료하지 못했습니다. 다시 시도해 주세요."
    && mapSocialCompleteError(400, { ok: false, outcome: "not_social" }) ===
      "가입을 완료하지 못했습니다. 다시 시도해 주세요."
    && !mapSocialCompleteError(400, {}).includes("만료"),
);

assert(
  "explicit proof expiry may still use expiry copy",
  isProofExpirySignal({ code: "proof_expired" }) === true
    && mapSocialCompleteError(400, { code: "proof_expired" }) ===
      "인증이 만료되었습니다. 다시 시도해 주세요."
    && isOtpExpiryCustomerCopy("인증이 만료되었습니다. 다시 시도해 주세요.") === true,
);

assert(
  "409 collision mapping unchanged",
  mapSocialCompleteError(409, { code: "phone_already_registered" }).includes("이미 가입된 번호입니다.")
    && mapSocialCompleteError(409, { code: "phone_already_registered" }).includes("기존 로그인으로 이용해 주세요.")
    && !mapSocialCompleteError(409, { code: "phone_already_registered" }).includes("not_social"),
);

assert(
  "signup complete generic 400 also does not claim OTP expired",
  mapSignupCompleteError(400, {}) === "가입을 완료하지 못했습니다. 다시 시도해 주세요.",
);

assert(
  "verified OTP hides stale expiry copy",
  loginModal.includes("visibleError")
    && loginModal.includes("isOtpExpiryCustomerCopy(errorMsg)")
    && loginModal.includes("otpVerified && isOtpExpiryCustomerCopy(errorMsg)"),
);

assert(
  "provider family labels and SDK mapping unchanged",
  JSON.stringify([...C1_SOCIAL_PROVIDERS]) === JSON.stringify(["google", "kakao", "naver"])
    && oauthSdkProvider("naver") === "custom:naver"
    && socialRow.includes("Google로 계속")
    && socialRow.includes("카카오로 계속")
    && socialRow.includes("Naver로 계속")
    && !socialRow.includes("custom:naver")
    && !loginModal.includes("custom:naver"),
);

assert(
  "pending onboarding remains generic",
  loginModal.includes("휴대폰 인증으로 가입을 완료해 주세요.")
    && loginModal.includes("isPendingC1SocialCustomer(user, profile)")
    && loginModal.includes("/api/auth/social/complete"),
);

assert(
  "long Auth states scroll on the overlay, not a nested trap",
  loginModal.includes("fixed inset-0 overflow-y-auto")
    && loginModal.includes("flex min-h-full items-center justify-center")
    && loginModal.includes("overflow-y-auto")
    && !loginModal.includes("fixed inset-0 flex items-center justify-center p-4 sm:p-8 overflow-y-auto"),
);

const accountDrawer = read("src/components/auth/AccountDrawer.tsx");
const loginPage = read("src/pages/Login.tsx");

assert(
  "milestone 1 account drawer is hub, not a login form",
  accountDrawer.includes("로그인하고 제작하기")
    && accountDrawer.includes("오직 당신만의 커스텀 작품을")
    && accountDrawer.includes("만들어보세요.")
    && accountDrawer.includes("화면 모드")
    && accountDrawer.includes("/policy/terms")
    && accountDrawer.includes("/policy/privacy")
    && !accountDrawer.includes("200 × 283 mm")
    && !accountDrawer.includes("CustomStage")
    && !accountDrawer.includes("signInWithPassword")
    && !accountDrawer.includes("auth-username")
    && !accountDrawer.includes("custom:naver")
    && !accountDrawer.includes("/faq")
    && !accountDrawer.includes("FAQ"),
);

assert(
  "milestone 1 login page layers drawer then auth; pending social still opens modal",
  loginPage.includes("AccountDrawer")
    && loginPage.includes("isPendingC1SocialCustomer")
    && loginPage.includes("layered={!pendingSocial}")
    && loginPage.includes("isUsableMemberProfile(profile)")
    && loginModal.includes("layered")
    && loginModal.includes("ml-auth-env--layered")
    && loginModal.includes('density="family"'),
);

assert(
  "A anonymous /login starts drawer open and auth modal closed",
  loginPage.includes("useState(false)")
    && loginPage.includes("const drawerOpen = !pendingSocial")
    && loginPage.includes("const modalOpen = pendingSocial || authOpen")
    && loginPage.includes("isOpen={drawerOpen}")
    && loginPage.includes("isOpen={modalOpen}")
    && !loginPage.includes("isOpen={true}")
    && !loginPage.includes("setAuthOpen(true);")
    && !loginPage.includes("if (pendingSocial) setAuthOpen(true)"),
);

assert(
  "B drawer CTA opens auth modal while drawer stays mounted",
  loginPage.includes("onRequestAuth={() => setAuthOpen(true)}")
    && loginPage.includes("inert={authOpen && !pendingSocial}")
    && loginPage.includes("<AccountDrawer")
    && loginPage.includes("<LoginModal"),
);

assert(
  "C auth modal close returns to drawer without navigation",
  loginPage.includes("setAuthOpen(false)")
    && loginPage.includes("if (pendingSocial)")
    && loginPage.includes("navigate('/')"),
);

assert(
  "D pending-social /login still opens onboarding without the teaser CTA",
  loginPage.includes("pendingSocial || authOpen")
    && loginPage.includes("authReady && isPendingC1SocialCustomer(user, profile)")
    && loginModal.includes("isPendingC1SocialCustomer(user, profile)")
    && loginModal.includes("/api/auth/social/complete"),
);

const cartSrc = read("src/components/Cart.tsx");
const productDetailSrc = read("src/components/ProductDetail.tsx");

assert(
  "M1I A Drawer CTA opens Login directly",
  accountDrawer.includes("onRequestAuth")
    && accountDrawer.includes("로그인하고 제작하기")
    && loginModal.includes("useState<AuthView>('login')")
    && loginModal.includes("setView('login')")
    && !loginModal.includes("시작해볼까요?")
    && !loginModal.includes("key=\"auth-choice\""),
);

assert(
  "M1I B Auth Choice title is gone",
  !loginModal.includes("시작해볼까요?")
    && !loginModal.includes("surfaceView === 'choice'"),
);

assert(
  "M1I C Auth Choice Login/Signup buttons are gone",
  !loginModal.includes("ml-auth-choice-primary")
    && !loginModal.includes("ml-auth-choice-secondary")
    && !loginModal.includes("setSignupFromChoice"),
);

assert(
  "M1I D Login title remains absent",
  !/>\s*로그인\s*<\/h2>/.test(loginModal)
    && loginModal.includes("ml-auth-login-wordmark"),
);

assert(
  "M1I E Login wordmark is truly centered",
  loginModal.includes("grid-cols-[2.75rem_minmax(0,1fr)_2.75rem]")
    && loginModal.includes("ml-auth-login-wordmark")
    && loginModal.includes("justify-self-center"),
);

assert(
  "M1I F Signup secondary button sits under Login CTA",
  loginModal.includes("ml-auth-login-cta")
    && loginModal.includes("ml-auth-login-signup")
    && loginModal.includes("onClick={() => goView('signup')}")
    && loginModal.includes("surfaceView === 'signup'"),
);

assert(
  "M1I G old small Signup footer link is removed from Login",
  (() => {
    const start = loginModal.indexOf('key="login"');
    const end = loginModal.indexOf('key="signup"');
    if (start < 0 || end < 0 || end <= start) return false;
    const loginChunk = loginModal.slice(start, end);
    return loginChunk.includes("ml-auth-login-signup")
      && loginChunk.includes("아이디/비밀번호를 모르겠어요")
      && !/text-\[12px\][\s\S]{0,400}회원가입/.test(loginChunk);
  })(),
);

assert(
  "M1I H no back-to-choice control",
  !loginModal.includes("계정 선택으로 돌아가기")
    && !loginModal.includes("signupFromChoice"),
);

assert(
  "M1I I X closes Login and leaves Drawer",
  loginModal.includes("void abandonOrClose()")
    && loginModal.includes("aria-label=\"닫기\"")
    && loginPage.includes("setAuthOpen(false)")
    && loginPage.includes("layered={!pendingSocial}"),
);

assert(
  "M1I J Signup button enters existing Signup view",
  loginModal.includes("key=\"signup\"")
    && loginModal.includes("htmlFor=\"signup-full-name\"")
    && loginModal.includes("goView('signup')"),
);

assert(
  "M1I K social icon-only controls remain accessible",
  socialRow.includes("{!family && <span>{label}</span>}")
    && socialRow.includes("Google로 계속")
    && socialRow.includes("카카오로 계속")
    && socialRow.includes("Naver로 계속")
    && socialRow.includes("preserveAspectRatio")
    && loginModal.includes('density="family"')
    && loginModal.includes("휴대폰 인증으로 가입을 완료해 주세요.")
    && !loginModal.includes("아이디를 생성")
    && !loginModal.includes("아이디가 없습니다")
    && !loginModal.includes("generateInternalSocialUsername"),
);

assert(
  "M1I Cart and ProductDetail login remain direct",
  !cartSrc.includes("layered")
    && !productDetailSrc.includes("layered"),
);

assert(
  "M1I pending-social still bypasses Login",
  loginPage.includes("layered={!pendingSocial}")
    && loginModal.includes("pendingSocial ? 'social' : view")
    && loginModal.includes("isPendingC1SocialCustomer(user, profile)")
    && loginModal.includes("surfaceView === 'social'"),
);

assert(
  "M1J Login 아이디/비밀번호/또는 are +2px on default Login only",
  loginModal.includes("block text-[14px] font-medium tracking-tight mb-2")
    && loginModal.includes("ml-auth-login-or")
    && loginModal.includes(".ml-auth-login-or span")
    && loginModal.includes("font-size: 13px")
    && socialRow.includes("text-[11px] text-zinc-500"),
);

const loginChunk = (() => {
  const start = loginModal.indexOf('key="login"');
  const end = loginModal.indexOf('key="signup"');
  return start >= 0 && end > start ? loginModal.slice(start, end) : "";
})();
const signupChunk = (() => {
  const start = loginModal.indexOf('key="signup"');
  const end = loginModal.indexOf('key="recovery"');
  return start >= 0 && end > start ? loginModal.slice(start, end) : "";
})();
const socialChunk = (() => {
  const start = loginModal.indexOf('key="social"');
  const end = loginModal.lastIndexOf("</AnimatePresence>");
  return start >= 0 && end > start ? loginModal.slice(start, end) : "";
})();
const recoveryChunk = (() => {
  const start = loginModal.indexOf('key="recovery"');
  const end = loginModal.indexOf('key="social"');
  return start >= 0 && end > start ? loginModal.slice(start, end) : "";
})();
const collisionChunk = (() => {
  const start = loginModal.indexOf('key="login-collision"');
  const end = loginModal.indexOf('key="login"');
  return start >= 0 && end > start ? loginModal.slice(start, end) : "";
})();

assert(
  "M2B A backdrop click does not close Login",
  loginModal.includes("authFormLocksDismiss")
    && loginModal.includes("const authFormLocksDismiss = isSceneLogin || isSceneSignup")
    && loginModal.includes("if (authFormLocksDismiss) return"),
);

assert(
  "M2B B backdrop click does not close Signup",
  loginModal.includes("authFormLocksDismiss")
    && loginModal.includes("isSceneSignup")
    && (loginModal.match(/if \(authFormLocksDismiss\) return/g) || []).length >= 2,
);

assert(
  "M2B C ESC does not close Login/Signup",
  loginModal.includes('surfaceView === \'login\' || surfaceView === "signup"')
    && loginModal.includes("if (event.key !== 'Escape') return"),
);

assert(
  "M2B D X still closes correctly",
  loginModal.includes('aria-label="닫기"')
    && loginModal.includes("void abandonOrClose()")
    && loginPage.includes("setAuthOpen(false)"),
);

assert(
  "M2B E Name initial state only",
  loginModal.includes("useState<SignupRevealStep>('name')")
    && loginModal.includes("['name', 'username', 'password', 'phone']")
    && signupChunk.includes('htmlFor="signup-full-name"')
    && signupChunk.includes("showSignupUsername")
    && !loginModal.includes("signupRevealRank('passwordConfirm')"),
);

assert(
  "M2B F Name progression does not require Enter",
  loginModal.includes("NAME_IDLE_MS")
    && loginModal.includes("commitSignupName(false)")
    && loginModal.includes("nameComposing")
    && loginModal.includes("onCompositionStart"),
);

assert(
  "M2B G Enter still works as shortcut",
  loginModal.includes("commitSignupName(true)")
    && loginModal.includes("commitSignupUsername(true)")
    && loginModal.includes("commitSignupPasswordPair(true)"),
);

assert(
  "M2B H ID <4 shows minimum helper",
  loginModal.includes("영문/숫자 4자 이상")
    && loginModal.includes("MEMBER_USERNAME_MIN_LEN"),
);

assert(
  "M2B I unsupported chars show format helper",
  loginModal.includes("signupCreateUsernameHasUnsupported")
    && loginModal.includes("영문과 숫자만 입력해 주세요."),
);

assert(
  "M2B J valid format triggers username check",
  loginModal.includes("/api/auth/signup/username-check")
    && loginModal.includes("signupUsernameFormatOk")
    && loginModal.includes("USERNAME_CHECK_MS"),
);

assert(
  "M2B K helper switches to checking",
  loginModal.includes("확인 중...")
    && loginModal.includes("usernameChecking"),
);

assert(
  "M2B L available success reveals Password stage",
  loginModal.includes("usernameAvailable === true")
    && loginModal.includes("signupRevealRank('password')")
    && loginModal.includes("showSignupPassword"),
);

assert(
  "M2B M unavailable does not reveal Password",
  loginModal.includes("이미 사용 중인 아이디입니다.")
    && loginModal.includes("if (usernameChecking || usernameAvailable !== true) return"),
);

assert(
  "M2B N password + confirmation reveal together",
  signupChunk.includes('htmlFor="signup-password"')
    && signupChunk.includes('htmlFor="signup-password-confirm"')
    && loginModal.includes("commitSignupPasswordPair")
    && !loginModal.includes("showSignupPasswordConfirm")
    && !loginModal.includes("signupRevealRank('passwordConfirm')"),
);

assert(
  "M2B O password <8 shows helper",
  signupChunk.includes("formData.password.length < 8")
    && signupChunk.includes("8자 이상"),
);

assert(
  "M2B P helper clears at valid length",
  signupChunk.includes("{formData.password.length < 8 && (")
    && loginModal.includes("signupPasswordReady"),
);

assert(
  "M2B Q mismatch shows error",
  signupChunk.includes("비밀번호가 일치하지 않습니다.")
    && signupChunk.includes("formData.passwordConfirm.length > 0"),
);

assert(
  "M2B R matching valid pair reveals Phone automatically",
  loginModal.includes("PASSWORD_IDLE_MS")
    && loginModal.includes("signupConfirmReady")
    && loginModal.includes("signupRevealRank('phone')"),
);

assert(
  "M2B S social alternatives present on initial Name state",
  signupChunk.includes("showSignupSocialAlternatives")
    && signupChunk.includes('density="family"')
    && signupChunk.includes("<SocialContinueRow"),
);

assert(
  "M2B T social alternatives hidden after password-signup progression starts",
  loginModal.includes("const showSignupSocialAlternatives = !showSignupUsername")
    && signupChunk.includes("show={showSignupSocialAlternatives}"),
);

assert(
  "M2B U OTP absent before send success",
  signupChunk.includes("otpSent && !otpVerified && showSignupPhone"),
);

assert(
  "M2B V OTP reveals after send success",
  loginModal.includes("setOtpSent(true)")
    && loginModal.includes("signupFocusRef.current = 'signup-otp'")
    && signupChunk.includes('id="signup-otp"'),
);

assert(
  "M2B W no standalone processing modal on Login/Signup path",
  loginModal.includes("settleHidesForms")
    && loginModal.includes("sessionSettling && !isSceneLogin && !isSceneSignup"),
);

assert(
  "M2B X OTP verify uses inline loading",
  signupChunk.includes("확인 중...")
    && signupChunk.includes("전송 중...")
    && signupChunk.includes("otpVerifying"),
);

assert(
  "M2B Y verified phone compresses to summary",
  loginModal.includes("phoneCompressed")
    && loginModal.includes("maskSignupPhoneSummary")
    && signupChunk.includes("인증 완료"),
);

assert(
  "M2B Z Name+ID compress after completion",
  loginModal.includes("identityCompressed")
    && signupChunk.includes("SignupSummaryRow")
    && loginModal.includes("editSignupIdentity"),
);

assert(
  "M2B AA identity summary can re-open via 수정",
  loginModal.includes("수정")
    && loginModal.includes("editSignupIdentity")
    && loginModal.includes("signupFocusRef.current = 'signup-full-name'"),
);

assert(
  "M2B AB password compresses after completion",
  loginModal.includes("passwordCompressed")
    && signupChunk.includes("비밀번호 설정 완료"),
);

assert(
  "M2B AC password summary never exposes secret",
  signupChunk.includes('text="비밀번호 설정 완료"')
    && !signupChunk.includes("text={`${formData.password")
    && !signupChunk.includes("text={formData.password"),
);

assert(
  "M2B AD earlier edits revalidate downstream readiness",
  loginModal.includes("usernameAvailable !== true")
    && loginModal.includes("signupUsernameReady")
    && loginModal.includes("if (name === 'username')"),
);

assert(
  "M2B AE phone verification becomes invalid if phone changes",
  loginModal.includes("editSignupPhone")
    && loginModal.includes("setSignupProof(null)")
    && loginModal.includes("if (name === 'phone_number')"),
);

assert(
  "M2B AF agreements hidden before OTP verify",
  signupChunk.includes("show={Boolean(otpVerified)}")
    && signupChunk.includes("이용약관 동의"),
);

assert(
  "M2B AG agreements reveal after OTP verify",
  signupChunk.includes("otpVerified")
    && signupChunk.includes("가입하기")
    && signupChunk.includes("signupReady"),
);

assert(
  "M2B AH final CTA only in final stage",
  signupChunk.includes("가입하기")
    && signupChunk.includes("show={Boolean(otpVerified)}")
    && !loginChunk.includes("가입하기"),
);

assert(
  "M2B AI marketing remains absent/optional per current contract",
  !signupChunk.toLowerCase().includes("marketing")
    && !signupChunk.includes("광고")
    && loginModal.includes("terms: agreements.terms")
    && loginModal.includes("privacy: agreements.privacy")
    && loginModal.includes("cookie: agreements.cookie")
    && !loginModal.includes("marketing:"),
);

assert(
  "M2B AJ Login submit uses inline Login CTA loading",
  loginChunk.includes("로그인 중...")
    && loginChunk.includes("ml-auth-login-cta"),
);

assert(
  "M2B AK Signup submit uses inline Signup CTA loading",
  signupChunk.includes("가입 중...")
    && signupChunk.includes("ml-auth-login-cta"),
);

assert(
  "M2B AL no standalone generic 확인 중 modal in Login/Signup path",
  loginModal.includes("settleHidesForms &&")
    && loginModal.includes("key=\"auth-settle\"")
    && loginChunk.includes("로그인 중...")
    && !loginChunk.includes("확인 중"),
);

assert(
  "M2B AM errors keep user in form",
  loginModal.includes("setIsLoading(false)")
    && loginModal.includes("setErrorMsg")
    && loginModal.includes("아이디 또는 비밀번호를 확인해주세요."),
);

assert(
  "M2B AN Login visuals/contracts remain M1J",
  loginChunk.includes("ml-auth-login-cta")
    && loginChunk.includes("ml-auth-login-signup")
    && loginChunk.includes("ml-auth-login-or")
    && loginChunk.includes('density="family"')
    && loginChunk.includes("아이디/비밀번호를 모르겠어요")
    && !/>\s*로그인\s*<\/h2>/.test(loginChunk)
    && loginModal.includes("block text-[14px] font-medium tracking-tight mb-2"),
);

assert(
  "M2B AO social username prompt absent",
  !loginModal.includes("아이디를 생성")
    && !loginModal.includes("아이디가 없습니다")
    && !loginModal.includes("generateInternalSocialUsername")
    && loginModal.includes("휴대폰 인증으로 가입을 완료해 주세요."),
);

assert(
  "M2B AP backend contracts untouched",
  loginModal.includes("/api/auth/signup/username-check")
    && loginModal.includes("/api/auth/signup/complete")
    && loginModal.includes("/api/auth/otp/send")
    && loginModal.includes("minLength={8}")
    && !loginModal.includes("generateInternalSocialUsername"),
);

const createUsernameRe = /^[A-Za-z0-9]{4,32}$/;
const loginFn = loginModal.slice(
  loginModal.indexOf("const handleLogin = async"),
  loginModal.indexOf("const sendOtp"),
);

assert(
  "M2C-1 A Identity 수정 clears Name",
  loginModal.includes("const editSignupIdentity")
    && loginModal.includes("full_name: '', username: ''"),
);

assert(
  "M2C-1 B Identity 수정 clears Username",
  loginModal.includes("editSignupIdentity")
    && loginModal.includes("setSignupReveal('name')")
    && loginModal.includes("full_name: '', username: ''"),
);

assert(
  "M2C-1 C Identity 수정 clears usernameAvailable",
  loginModal.includes("usernameCheckSeqRef.current += 1")
    && loginModal.includes("setUsernameAvailable(null)")
    && loginModal.includes("setUsernameChecking(false)")
    && loginModal.includes("setUsernameCheckError(false)"),
);

assert(
  "M2C-1 D Identity does not auto-recomplete after reset",
  loginModal.includes("setSignupReveal('name')")
    && loginModal.includes("usernameAdvanceRef.current = false")
    && loginModal.includes("if (!formData.full_name.trim()) return"),
);

assert(
  "M2C-1 E Password 수정 clears Password",
  loginModal.includes("const editSignupPassword")
    && loginModal.includes("password: '', passwordConfirm: ''"),
);

assert(
  "M2C-1 F Password 수정 clears Confirmation",
  loginModal.includes("editSignupPassword")
    && loginModal.includes("password: '', passwordConfirm: ''")
    && loginModal.includes("setSignupReveal('password')"),
);

assert(
  "M2C-1 G Phone does not remain active from stale valid password state",
  loginModal.includes("setSignupReveal('password')")
    && loginModal.includes("setSignupEdit('password')")
    && loginModal.includes("password: '', passwordConfirm: ''"),
);

assert(
  "M2C-1 H Phone 수정 clears Phone",
  loginModal.includes("const editSignupPhone")
    && loginModal.includes("phone_number: ''"),
);

assert(
  "M2C-1 I Phone 수정 clears OTP",
  loginModal.includes("editSignupPhone")
    && loginModal.includes("setOtpCode('')")
    && loginModal.includes("setOtpSent(false)"),
);

assert(
  "M2C-1 J Phone 수정 clears signupProof / verified state",
  loginModal.includes("editSignupPhone")
    && loginModal.includes("setSignupProof(null)")
    && loginModal.includes("setOtpVerified(false)"),
);

assert(
  "M2C-1 K Agreements/final readiness blocked after phone reset",
  loginModal.includes("Boolean(signupProof)")
    && signupChunk.includes("show={Boolean(otpVerified)}")
    && loginModal.includes("setOtpVerified(false)")
    && loginModal.includes("setSignupProof(null)"),
);

assert(
  "M2C-1 L `.` rejected in NEW Signup username",
  loginModal.includes("/^[A-Za-z0-9]{4,32}$/")
    && loginModal.includes("isSignupCreateUsernameCandidate")
    && !createUsernameRe.test("abc.def"),
);

assert(
  "M2C-1 M `_` rejected",
  loginModal.includes("signupCreateUsernameHasUnsupported")
    && loginModal.includes("/[^A-Za-z0-9]/")
    && !createUsernameRe.test("abc_def"),
);

assert(
  "M2C-1 N `-` rejected",
  !createUsernameRe.test("abc-def")
    && loginModal.includes("영문과 숫자만 입력해 주세요."),
);

assert(
  "M2C-1 O Hangul rejected",
  !createUsernameRe.test("가나다라")
    && loginModal.includes("signupCreateUsernameHasUnsupported"),
);

assert(
  "M2C-1 P alphanumeric 4–32 accepted",
  createUsernameRe.test("abcd")
    && createUsernameRe.test("test11")
    && createUsernameRe.test("A".repeat(32))
    && !createUsernameRe.test("abc")
    && !createUsernameRe.test("A".repeat(33))
    && loginModal.includes("isSignupCreateUsernameCandidate(formData.username)"),
);

assert(
  "M2C-1 Q <4 helper correct",
  loginModal.includes("영문/숫자 4자 이상")
    && loginModal.includes("if (!username) return null"),
);

assert(
  "M2C-1 R invalid-char helper exact",
  loginModal.includes("영문과 숫자만 입력해 주세요.")
    && !loginModal.includes("영문, 숫자와 . _ - 만 사용할 수 있습니다."),
);

assert(
  "M2C-1 S valid candidate progresses to username-check",
  loginModal.includes("if (!isSignupCreateUsernameCandidate(formData.username))")
    && loginModal.includes("/api/auth/signup/username-check")
    && loginModal.includes("usernameAvailable === true"),
);

assert(
  "M2C-1 T stale username-check response cannot validate reset/changed username",
  loginModal.includes("usernameCheckSeqRef")
    && loginModal.includes("seq !== usernameCheckSeqRef.current")
    && loginModal.includes("const requested = normalizeMemberUsername(formData.username)"),
);

assert(
  "M2C-1 U Login legacy username behavior unchanged",
  loginFn.includes("memberAuthEmail(username)")
    && loginFn.includes("username.length < 4")
    && !loginFn.includes("memberUsernameSignupError")
    && !loginFn.includes("MEMBER_USERNAME_RE")
    && !loginFn.includes("SIGNUP_CREATE_USERNAME_RE")
    && !loginFn.includes("isSignupCreateUsernameCandidate"),
);

assert(
  "M2C-1 V M2B backdrop/ESC/X behavior unchanged",
  loginModal.includes("authFormLocksDismiss")
    && loginModal.includes('surfaceView === \'login\' || surfaceView === "signup"')
    && loginModal.includes('aria-label="닫기"'),
);

assert(
  "M2C-1 W M1J Login visual contract unchanged",
  loginChunk.includes("ml-auth-login-cta")
    && loginChunk.includes("ml-auth-login-signup")
    && loginChunk.includes("ml-auth-login-or")
    && loginChunk.includes('density="family"')
    && loginChunk.includes("아이디/비밀번호를 모르겠어요")
    && !/>\s*로그인\s*<\/h2>/.test(loginChunk)
    && loginModal.includes("block text-[14px] font-medium tracking-tight mb-2"),
);

assert(
  "M2D A pending social initial view contains Phone",
  socialChunk.includes('htmlFor="social-phone"')
    && socialChunk.includes("전화번호")
    && socialChunk.includes("sendOtp('identity_link')"),
);

assert(
  "M2D B no username field",
  !socialChunk.includes('id="signup-username"')
    && !socialChunk.includes('id="social-username"')
    && !socialChunk.includes("htmlFor=\"signup-username\""),
);

assert(
  "M2D C no password field",
  !socialChunk.includes('name="password"')
    && !socialChunk.includes('id="signup-password"')
    && !socialChunk.includes("passwordConfirm"),
);

assert(
  "M2D D no internal ml... string rendered",
  !socialChunk.includes("user_custom_id")
    && !socialChunk.includes("generateInternalSocialUsername")
    && !loginModal.includes("아이디를 생성")
    && !loginModal.includes("아이디가 없습니다"),
);

assert(
  "M2D E OTP absent before send success",
  socialChunk.includes("otpSent && !otpVerified")
    && socialChunk.includes('id="social-otp"')
    && socialChunk.includes("SignupStepReveal"),
);

assert(
  "M2D F send loading is inline",
  socialChunk.includes("전송 중...")
    && socialChunk.includes("otpSending")
    && !socialChunk.includes("Loader2 className=\"animate-spin mx-auto\""),
);

assert(
  "M2D G OTP appears after send success",
  socialChunk.includes("show={Boolean(otpSent && !otpVerified)}")
    && loginModal.includes("if (purpose === 'identity_link') signupFocusRef.current = 'social-otp'")
    && socialChunk.includes('id="social-otp"'),
);

assert(
  "M2D H verify loading is inline",
  socialChunk.includes("확인 중...")
    && socialChunk.includes("otpVerifying")
    && socialChunk.includes("verifyOtp('identity_link')"),
);

assert(
  "M2D I agreements hidden before verification",
  socialChunk.includes("show={Boolean(otpVerified)}")
    && socialChunk.includes("이용약관 동의"),
);

assert(
  "M2D J verified phone compresses",
  socialChunk.includes("SignupSummaryRow")
    && socialChunk.includes("maskSignupPhoneSummary")
    && socialChunk.includes("인증 완료")
    && socialChunk.includes("show={phoneCompressed}"),
);

assert(
  "M2D K agreements reveal after verification",
  socialChunk.includes("show={Boolean(otpVerified)}")
    && socialChunk.includes("개인정보처리방침 동의")
    && socialChunk.includes("쿠키 정책 동의"),
);

assert(
  "M2D L required terms remain exact",
  socialChunk.includes("이용약관 동의")
    && socialChunk.includes("개인정보처리방침 동의")
    && socialChunk.includes("쿠키 정책 동의")
    && socialChunk.includes("필수 항목 전체 동의")
    && !socialChunk.toLowerCase().includes("marketing")
    && !socialChunk.includes("광고"),
);

assert(
  "M2D M final activation CTA gated by proof + agreements",
  loginModal.includes("const socialReady = Boolean(identityLinkProof) && allChecked")
    && socialChunk.includes("disabled={isLoading || !socialReady || abandoningPending}")
    && socialChunk.includes("가입하기")
    && socialChunk.includes("show={Boolean(otpVerified)}"),
);

assert(
  "M2D N activation loading inline",
  socialChunk.includes("가입 중...")
    && socialChunk.includes("ml-auth-login-cta")
    && socialChunk.includes("handleSocialComplete"),
);

assert(
  "M2D O no standalone generic 확인 중 modal on pending-social activation path",
  loginModal.includes("sessionSettling && !isSceneLogin && !isSceneSignup && !pendingSocial")
    && socialChunk.includes("가입 중...")
    && !socialChunk.includes("key=\"auth-settle\"")
    && !socialChunk.includes(">확인 중<"),
);

assert(
  "M2D P phone 수정 clears phone",
  loginModal.includes("const editSocialPhone")
    && loginModal.includes("phone_number: ''")
    && socialChunk.includes("onEdit={editSocialPhone}"),
);

assert(
  "M2D Q phone 수정 clears OTP",
  loginModal.includes("editSocialPhone")
    && loginModal.includes("setOtpCode('')")
    && loginModal.includes("setOtpSent(false)")
    && loginModal.includes("signupFocusRef.current = 'social-phone'"),
);

assert(
  "M2D R phone 수정 invalidates proof",
  loginModal.includes("editSocialPhone")
    && loginModal.includes("setIdentityLinkProof(null)")
    && loginModal.includes("setOtpVerified(false)"),
);

assert(
  "M2D S agreements readiness disappears after phone reset",
  loginModal.includes("const socialReady = Boolean(identityLinkProof) && allChecked")
    && socialChunk.includes("show={Boolean(otpVerified)}")
    && loginModal.includes("setIdentityLinkProof(null)"),
);

assert(
  "M2D T R2 collision does not activate",
  loginModal.includes("returnToLoginAfterCollision")
    && loginModal.includes("isPhoneAlreadyRegistered")
    && loginModal.includes("setPhoneCollisionNotice(true)")
    && loginModal.includes("/api/auth/social/complete"),
);

assert(
  "M2D U R2 does not reveal/transfer username",
  !socialChunk.includes("user_custom_id")
    && !socialChunk.includes("recoverableUsername")
    && loginModal.includes("PHONE_ALREADY_REGISTERED_COPY")
    && !loginModal.toLowerCase().includes("naver collision"),
);

assert(
  "M2D V returning social member does not enter pending onboarding",
  loginPage.includes("isUsableMemberProfile(profile)")
    && loginPage.includes("isPendingC1SocialCustomer(user, profile)")
    && loginPage.includes("const pendingSocial = authReady && isPendingC1SocialCustomer"),
);

assert(
  "M2D W Google provider unchanged",
  oauthSdkProvider("google") === "google"
    && JSON.stringify([...C1_SOCIAL_PROVIDERS]) === JSON.stringify(["google", "kakao", "naver"]),
);

assert(
  "M2D X Kakao unchanged",
  oauthSdkProvider("kakao") === "kakao"
    && socialRow.includes("카카오로 계속"),
);

assert(
  "M2D Y custom:naver unchanged",
  oauthSdkProvider("naver") === "custom:naver"
    && !loginModal.includes("custom:naver")
    && !socialRow.includes("custom:naver"),
);

assert(
  "M2D Z Password Signup M2C-1 unchanged",
  loginModal.includes("const editSignupIdentity")
    && loginModal.includes("/^[A-Za-z0-9]{4,32}$/")
    && loginModal.includes("영문과 숫자만 입력해 주세요.")
    && signupChunk.includes("onEdit={editSignupIdentity}")
    && signupChunk.includes("onEdit={editSignupPassword}"),
);

assert(
  "M2D AA Login M1J unchanged",
  loginChunk.includes("ml-auth-login-cta")
    && loginChunk.includes("ml-auth-login-signup")
    && loginChunk.includes("ml-auth-login-or")
    && loginChunk.includes('density="family"')
    && !/>\s*로그인\s*<\/h2>/.test(loginChunk)
    && loginModal.includes("block text-[14px] font-medium tracking-tight mb-2"),
);

assert(
  "M2E A Login recovery action opens unified Recovery",
  loginChunk.includes("아이디/비밀번호를 모르겠어요")
    && loginChunk.includes("goView('recovery')")
    && loginModal.includes('key="recovery"'),
);

assert(
  "M2E B phone is the only initial recovery field",
  recoveryChunk.includes('htmlFor="recovery-phone"')
    && recoveryChunk.includes("show={!recoveryPhoneCompressed}")
    && !recoveryChunk.includes('htmlFor="signup-username"')
    && !recoveryChunk.includes('name="password"'),
);

assert(
  "M2E C no email recovery UI",
  !recoveryChunk.includes('type="email"')
    && !recoveryChunk.includes("htmlFor=\"recovery-email\"")
    && !recoveryChunk.includes("user.email"),
);

assert(
  "M2E D no ID/password-recovery choice screen",
  !loginModal.includes("아이디 찾기")
    && !loginModal.includes("아이디 찾기 / 비밀번호 찾기"),
);

assert(
  "M2E E OTP absent before send success",
  recoveryChunk.includes("otpSent && !otpVerified && !recoveryResolved")
    && recoveryChunk.includes('id="recovery-otp"'),
);

assert(
  "M2E F send loading inline",
  recoveryChunk.includes("전송 중...")
    && recoveryChunk.includes("sendOtp('recovery')")
    && !recoveryChunk.includes("Loader2 className=\"animate-spin mx-auto\""),
);

assert(
  "M2E G OTP appears after send success",
  recoveryChunk.includes("show={Boolean(otpSent && !otpVerified && !recoveryResolved)}")
    && loginModal.includes("if (purpose === 'recovery') signupFocusRef.current = 'recovery-otp'"),
);

assert(
  "M2E H verify loading inline",
  recoveryChunk.includes("확인 중...")
    && recoveryChunk.includes("verifyOtp('recovery')"),
);

assert(
  "M2E I no account result before trusted proof",
  recoveryChunk.includes("show={recoveryResolved}")
    && recoveryChunk.includes("/api/auth/recovery/resolve") === false
    && loginModal.includes("/api/auth/recovery/resolve"),
);

assert(
  "M2E J phone compresses after proof",
  recoveryChunk.includes("recoveryPhoneCompressed")
    && recoveryChunk.includes("maskSignupPhoneSummary")
    && recoveryChunk.includes("인증 완료")
    && recoveryChunk.includes("editRecoveryPhone"),
);

assert(
  "M2E K phone 수정 clears phone",
  loginModal.includes("const editRecoveryPhone")
    && loginModal.includes("phone_number: ''")
    && recoveryChunk.includes("onEdit={editRecoveryPhone}"),
);

assert(
  "M2E L phone 수정 clears OTP",
  loginModal.includes("editRecoveryPhone")
    && loginModal.includes("setOtpCode('')")
    && loginModal.includes("signupFocusRef.current = 'recovery-phone'"),
);

assert(
  "M2E M phone 수정 invalidates recovery proof",
  loginModal.includes("editRecoveryPhone")
    && loginModal.includes("setRecoveryProof(null)")
    && loginModal.includes("setRecoverySession(null)"),
);

assert(
  "M2E N phone 수정 clears account result",
  loginModal.includes("setRecoverableUsername(null)")
    && loginModal.includes("setLinkedProviders([])")
    && loginModal.includes("setPasswordResetAllowed(false)")
    && loginModal.includes("setRecoveryResolved(false)")
    && loginModal.includes("setRecoveryResetOpen(false)"),
);

assert(
  "M2E O password-capable result shows customer login ID",
  recoveryChunk.includes("passwordResetAllowed && recoveryLoginId")
    && recoveryChunk.includes("ml-auth-notice-id")
    && loginModal.includes("isGeneratedSocialUsername"),
);

assert(
  "M2E P password reset action available",
  recoveryChunk.includes("비밀번호 재설정")
    && recoveryChunk.includes("passwordResetAllowed && !recoveryResetOpen"),
);

assert(
  "M2E Q password pair reveals together",
  recoveryChunk.includes("passwordResetAllowed && recoveryResetOpen")
    && recoveryChunk.includes('htmlFor="reset-password"')
    && recoveryChunk.includes('htmlFor="reset-password-confirm"')
    && !loginModal.includes("key=\"reset\""),
);

assert(
  "M2E R min 8 helper",
  recoveryChunk.includes("resetPassword.length < 8")
    && recoveryChunk.includes("8자 이상"),
);

assert(
  "M2E S mismatch helper",
  recoveryChunk.includes("비밀번호가 일치하지 않습니다.")
    && recoveryChunk.includes("resetPasswordConfirm.length > 0"),
);

assert(
  "M2E T valid pair gates reset CTA",
  recoveryChunk.includes("disabled={isLoading || !resetReady}")
    && loginModal.includes("const resetReady = Boolean(recoverySession)"),
);

assert(
  "M2E U reset loading inline",
  recoveryChunk.includes("변경 중...")
    && recoveryChunk.includes("비밀번호 변경"),
);

assert(
  "M2E V reset success returns to Login",
  loginModal.includes("showToast('비밀번호가 변경되었습니다.', 'success')")
    && loginModal.includes("setView('login')")
    && loginModal.includes("/api/auth/password-reset"),
);

assert(
  "M2E W Login password is blank after reset",
  loginModal.includes("username: recoveredId, password: ''")
    && loginModal.includes("isGeneratedSocialUsername(recoverableUsername)"),
);

assert(
  "M2E X internal ml username never rendered",
  !recoveryChunk.includes("generateInternalSocialUsername")
    && !loginModal.includes("아이디가 없습니다")
    && loginModal.includes("isGeneratedSocialUsername")
    && loginModal.includes("if (allowed && username && !isGeneratedSocialUsername(username))"),
);

assert(
  "M2E Y no password reset for social-only account",
  recoveryChunk.includes("passwordResetAllowed && !recoveryResetOpen")
    && recoveryChunk.includes("소셜 로그인으로 가입한 계정입니다.")
    && recoveryChunk.includes("{!passwordResetAllowed && linkedProviders.length === 0 && ("),
);

assert(
  "M2E Z trusted provider mapping only",
  recoveryChunk.includes("providers={linkedProviders}")
    && recoveryChunk.includes("readLinkedProviders") === false
    && loginModal.includes("setLinkedProviders(readLinkedProviders(resolved.json.linked_providers))"),
);

assert(
  "M2E AA no provider guessing from username/email",
  !recoveryChunk.includes("user.email")
    && !recoveryChunk.includes("ml prefix")
    && !recoveryChunk.includes("isInternalSocialUsername")
    && loginModal.includes("readLinkedProviders(resolved.json.linked_providers)"),
);

assert(
  "M2E AB password capability remains available when password + social are both true",
  recoveryChunk.includes("passwordResetAllowed && recoveryLoginId")
    && recoveryChunk.includes("linkedProviders.length > 0")
    && loginModal.includes("password_reset_allowed === true"),
);

assert(
  "M2E AC no account enumeration before proof",
  recoveryChunk.includes("show={recoveryResolved}")
    && !recoveryChunk.includes("account_kind")
    && loginModal.includes("/api/auth/recovery/resolve"),
);

assert(
  "M2E AD stale proof cannot survive phone edit",
  loginModal.includes("const editRecoveryPhone")
    && loginModal.includes("setRecoveryProof(null)")
    && loginModal.includes("setRecoverySession(null)")
    && loginModal.includes("setRecoveryResetOpen(false)"),
);

assert(
  "M2E AE no standalone Recovery processing modal",
  loginModal.includes("!isSceneRecovery")
    && recoveryChunk.includes("전송 중...")
    && recoveryChunk.includes("확인 중...")
    && recoveryChunk.includes("변경 중...")
    && !recoveryChunk.includes("key=\"auth-settle\""),
);

assert(
  "M2E AF backdrop does not dismiss",
  loginModal.includes("isSceneRecovery || isSceneCollision || pendingSocial")
    && loginModal.includes("if (authFormLocksDismiss) return"),
);

assert(
  "M2E AG ESC does not dismiss",
  loginModal.includes('surfaceView === \'login\' || surfaceView === "signup" || surfaceView === "recovery"')
    && loginModal.includes("if (surfaceView !== 'social')"),
);

assert(
  "M2E AH X still closes",
  loginModal.includes('aria-label="닫기"')
    && loginModal.includes("void abandonOrClose()"),
);

assert(
  "M2E AI Login M1J unchanged",
  loginChunk.includes("ml-auth-login-cta")
    && loginChunk.includes("ml-auth-login-signup")
    && loginChunk.includes("아이디/비밀번호를 모르겠어요")
    && !/>\s*로그인\s*<\/h2>/.test(loginChunk),
);

assert(
  "M2E AJ Password Signup M2C-1 unchanged",
  loginModal.includes("const editSignupIdentity")
    && loginModal.includes("/^[A-Za-z0-9]{4,32}$/")
    && signupChunk.includes("onEdit={editSignupIdentity}"),
);

assert(
  "M2E AK Social Pending M2D unchanged",
  socialChunk.includes("sendOtp('identity_link')")
    && socialChunk.includes("editSocialPhone")
    && loginModal.includes("if (surfaceView !== 'social')"),
);

assert(
  "M2E AL R2 unchanged",
  loginModal.includes("returnToLoginAfterCollision")
    && loginModal.includes("isPhoneAlreadyRegistered")
    && loginModal.includes("setPhoneCollisionNotice(true)"),
);

assert(
  "M2F A phone_already_registered enters Collision state",
  loginModal.includes("isPhoneAlreadyRegistered(complete.status, complete.json)")
    && loginModal.includes("await returnToLoginAfterCollision()")
    && loginModal.includes("setPhoneCollisionNotice(true)")
    && collisionChunk.includes('key="login-collision"'),
);

assert(
  "M2F B pending social is not activated",
  loginModal.includes("if (isPhoneAlreadyRegistered(complete.status, complete.json))")
    && loginModal.includes("await returnToLoginAfterCollision()")
    && !collisionChunk.includes("onSuccess"),
);

assert(
  "M2F C collision occurs only after current trusted R2 path",
  loginModal.includes("/api/auth/social/complete")
    && loginModal.includes("isPhoneAlreadyRegistered")
    && loginModal.includes("proof_token: identityLinkProof"),
);

assert(
  "M2F D pending session cleanup still occurs",
  loginModal.includes("const returnToLoginAfterCollision")
    && loginModal.includes("await signOut({ redirect: false, toast: false })")
    && loginModal.includes("resetAuthSurface()")
    && loginModal.includes("setPhoneCollisionNotice(true)"),
);

assert(
  "M2F E primary copy exact / approved",
  loginModal.includes("이미 가입된 휴대폰 번호입니다.")
    && collisionChunk.includes("COLLISION_PRIMARY"),
);

assert(
  "M2F F supporting copy exact / approved",
  loginModal.includes("새 계정으로 연결하지 않았습니다. 기존 계정으로 로그인해 주세요.")
    && collisionChunk.includes("COLLISION_SUPPORT"),
);

assert(
  "M2F G no username rendered",
  !collisionChunk.includes("recoverableUsername")
    && !collisionChunk.includes("recoveryLoginId")
    && !collisionChunk.includes("user_custom_id"),
);

assert(
  "M2F H no ml... rendered",
  !collisionChunk.includes("generateInternalSocialUsername")
    && !collisionChunk.includes("isGeneratedSocialUsername")
    && !collisionChunk.includes("아이디가 없습니다"),
);

assert(
  "M2F I no email rendered",
  !collisionChunk.includes("user.email")
    && !collisionChunk.includes("type=\"email\""),
);

assert(
  "M2F J no provider guessed",
  !collisionChunk.includes("SocialContinueRow")
    && !collisionChunk.includes("linkedProviders")
    && !collisionChunk.includes("Google로 계속"),
);

assert(
  "M2F K no merge/link CTA",
  !collisionChunk.includes("계정 통합")
    && !collisionChunk.includes("계정 연결")
    && !collisionChunk.includes("계속해서 합치기")
    && loginModal.includes("연결하지 않았습니다"),
);

assert(
  "M2F L Login CTA opens frozen M1J Login",
  collisionChunk.includes("로그인")
    && collisionChunk.includes("resetTransientAuth()")
    && collisionChunk.includes("setView('login')")
    && loginChunk.includes("ml-auth-login-cta"),
);

assert(
  "M2F M password remains empty",
  collisionChunk.includes("setFormData(EMPTY_AUTH_FORM)")
    && loginModal.includes("password: ''"),
);

assert(
  "M2F N Recovery CTA opens frozen M2E Recovery initial phone step",
  collisionChunk.includes("아이디/비밀번호 찾기")
    && collisionChunk.includes("goView('recovery')")
    && recoveryChunk.includes('htmlFor="recovery-phone"'),
);

assert(
  "M2F O no stale OTP/proof carried into Recovery",
  loginModal.includes("const goView")
    && loginModal.includes("resetTransientAuth()")
    && loginModal.includes("setIdentityLinkProof(null)")
    && loginModal.includes("setRecoveryProof(null)")
    && loginModal.includes("setOtpSent(false)"),
);

assert(
  "M2F P no navigation back to failed pending-social onboarding",
  !collisionChunk.includes("goBack")
    && !collisionChunk.includes("surfaceView === 'social'")
    && loginModal.includes("isSceneCollision || pendingSocial"),
);

assert(
  "M2F Q Collision clears after navigating to Login",
  collisionChunk.includes("resetTransientAuth()")
    && loginModal.includes("setPhoneCollisionNotice(false)"),
);

assert(
  "M2F R Collision clears after navigating to Recovery",
  collisionChunk.includes("goView('recovery')")
    && loginModal.includes("resetTransientAuth()"),
);

assert(
  "M2F S Collision clears after X close",
  loginModal.includes("void abandonOrClose()")
    && loginModal.includes("resetAuthSurface()")
    && loginModal.includes("setPhoneCollisionNotice(false)"),
);

assert(
  "M2F T reopening Auth does not resurrect stale collision state",
  loginModal.includes("} else {")
    && loginModal.includes("document.body.style.overflow = 'unset'")
    && loginModal.includes("resetAuthSurface()"),
);

assert(
  "M2F U backdrop does not dismiss",
  loginModal.includes("isSceneCollision || pendingSocial")
    && loginModal.includes("if (authFormLocksDismiss) return"),
);

assert(
  "M2F V ESC does not dismiss",
  loginModal.includes('surfaceView === \'login\' || surfaceView === "signup" || surfaceView === "recovery"')
    && loginModal.includes("isSceneCollision"),
);

assert(
  "M2F W X closes",
  loginModal.includes('aria-label="닫기"')
    && loginModal.includes("void abandonOrClose()"),
);

assert(
  "M2F X layered X leaves AccountDrawer open",
  loginPage.includes("setAuthOpen(false)")
    && loginPage.includes("if (pendingSocial)")
    && loginPage.includes("layered={!pendingSocial}"),
);

assert(
  "M2F Y no auto merge",
  !collisionChunk.includes("계정 통합")
    && !loginModal.includes("auto merge")
    && loginModal.includes("returnToLoginAfterCollision"),
);

assert(
  "M2F Z no identity transfer",
  !collisionChunk.includes("identity transfer")
    && loginModal.includes("await signOut({ redirect: false, toast: false })"),
);

assert(
  "M2F AA no session switch",
  !collisionChunk.includes("onSuccess")
    && loginModal.includes("if (isPhoneAlreadyRegistered(complete.status, complete.json))")
    && loginModal.includes("await returnToLoginAfterCollision()"),
);

assert(
  "M2F AB no phone transfer",
  !collisionChunk.includes("phone ownership")
    && loginModal.includes("isPhoneAlreadyRegistered"),
);

assert(
  "M2F AC no username leak",
  !collisionChunk.includes("recoverableUsername")
    && !collisionChunk.includes("user_custom_id")
    && !collisionChunk.includes("ml-auth-notice-id"),
);

assert(
  "M2F AD no account capability/provider enumeration beyond existing trusted collision result",
  !collisionChunk.includes("password_login_enabled")
    && !collisionChunk.includes("social_login_enabled")
    && !collisionChunk.includes("account_kind")
    && !collisionChunk.includes("linkedProviders"),
);

assert(
  "M2F AE no standalone generic 확인 중 modal introduced by collision cleanup",
  loginModal.includes("!isSceneCollision")
    && !collisionChunk.includes("key=\"auth-settle\"")
    && !collisionChunk.includes(">확인 중<"),
);

assert(
  "M2F AF transition ends on compact collision state",
  collisionChunk.includes("COLLISION_PRIMARY")
    && collisionChunk.includes("COLLISION_SUPPORT")
    && !collisionChunk.includes("SocialContinueRow")
    && !collisionChunk.includes("회원가입"),
);

assert(
  "M2F AG Login M1J unchanged",
  loginChunk.includes("ml-auth-login-cta")
    && loginChunk.includes("ml-auth-login-signup")
    && loginChunk.includes("아이디/비밀번호를 모르겠어요")
    && !/>\s*로그인\s*<\/h2>/.test(loginChunk),
);

assert(
  "M2F AH Password Signup M2C-1 unchanged",
  loginModal.includes("const editSignupIdentity")
    && loginModal.includes("/^[A-Za-z0-9]{4,32}$/")
    && signupChunk.includes("onEdit={editSignupIdentity}"),
);

assert(
  "M2F AI Social Pending M2D unchanged",
  socialChunk.includes("sendOtp('identity_link')")
    && socialChunk.includes("editSocialPhone")
    && loginModal.includes("if (surfaceView !== 'social')"),
);

assert(
  "M2F AJ Recovery M2E unchanged",
  recoveryChunk.includes("sendOtp('recovery')")
    && recoveryChunk.includes("editRecoveryPhone")
    && recoveryChunk.includes("가입할 때 인증한 휴대폰 번호를 입력해 주세요."),
);

assert(
  "H1-D A Login primary labels use shared primary foreground",
  loginModal.includes("const loginLabelClass = 'block text-[14px] font-medium tracking-tight mb-2 text-text-primary'")
    && loginChunk.includes("className={loginLabelClass}>아이디")
    && loginChunk.includes("className={loginLabelClass}>비밀번호"),
);

assert(
  "H1-D B Signup primary labels use shared primary foreground",
  signupChunk.includes("className={loginLabelClass}>이름")
    && signupChunk.includes("className={loginLabelClass}>아이디")
    && signupChunk.includes("className={loginLabelClass}>비밀번호")
    && signupChunk.includes("className={loginLabelClass}>전화번호"),
);

assert(
  "H1-D C Social Pending primary label uses shared primary foreground",
  socialChunk.includes("className={loginLabelClass}>전화번호")
    && socialChunk.includes("className={loginLabelClass}>인증번호"),
);

assert(
  "H1-D D Recovery primary label uses shared primary foreground",
  recoveryChunk.includes("className={loginLabelClass}>전화번호")
    && recoveryChunk.includes("className={loginLabelClass}>인증번호")
    && recoveryChunk.includes("className={loginLabelClass}>새 비밀번호")
    && recoveryChunk.includes('className="ml-auth-notice-primary"')
    && loginModal.includes("color: var(--color-text-primary)"),
);

assert(
  "H1-D E Collision primary message uses shared primary foreground",
  collisionChunk.includes("text-[15px] font-medium tracking-tight text-text-primary")
    && collisionChunk.includes("{COLLISION_PRIMARY}")
    && collisionChunk.includes("text-zinc-500"),
);

assert(
  "H1-D F helper text remains secondary",
  loginModal.includes("const statusQuiet = isDark ? 'text-zinc-500' : 'text-zinc-400'")
    && signupChunk.includes("`ml-auth-status ${statusQuiet}`")
    && signupChunk.includes("8자 이상")
    && loginModal.includes("영문/숫자 4자 이상")
    && loginModal.includes("tone: 'quiet'"),
);

assert(
  "H1-D G 또는 remains quiet",
  loginModal.includes(".ml-auth-login-or span")
    && loginModal.includes("font-size: 13px")
    && socialRow.includes("text-[11px] text-zinc-500"),
);

assert(
  "H1-D H placeholders remain secondary",
  loginModal.includes("placeholder:text-zinc-500")
    && loginModal.includes("placeholder:text-zinc-400")
    && !loginModal.includes("placeholder:text-text-primary"),
);

assert(
  "H1-D I Dark mode semantic foreground unchanged",
  loginModal.includes("text-text-primary")
    && !loginModal.includes("loginLabelClass = `block text-[14px] font-medium tracking-tight mb-2 ${isDark")
    && loginModal.includes("isDark ? 'text-zinc-100 placeholder:text-zinc-500' : 'text-zinc-900 placeholder:text-zinc-400'"),
);

assert(
  "H1-D J no layout/typography-size changes",
  loginModal.includes("block text-[14px] font-medium tracking-tight mb-2 text-text-primary")
    && loginModal.includes("font-size: 13px")
    && loginModal.includes("ml-auth-login-wordmark")
    && loginModal.includes("max-w-[26.5rem]"),
);

assert(
  "H1-D K M1J Login contract unchanged",
  loginChunk.includes("ml-auth-login-cta")
    && loginChunk.includes("ml-auth-login-signup")
    && loginChunk.includes("ml-auth-login-or")
    && loginChunk.includes('density="family"')
    && loginChunk.includes("아이디/비밀번호를 모르겠어요"),
);

assert(
  "H1-D L M2C-1 Signup unchanged",
  loginModal.includes("const editSignupIdentity")
    && loginModal.includes("/^[A-Za-z0-9]{4,32}$/")
    && signupChunk.includes("onEdit={editSignupIdentity}"),
);

assert(
  "H1-D M M2D Social Pending unchanged",
  socialChunk.includes("sendOtp('identity_link')")
    && socialChunk.includes("editSocialPhone")
    && loginModal.includes("if (surfaceView !== 'social')"),
);

assert(
  "H1-D N M2E Recovery unchanged",
  recoveryChunk.includes("sendOtp('recovery')")
    && recoveryChunk.includes("editRecoveryPhone")
    && recoveryChunk.includes("가입할 때 인증한 휴대폰 번호를 입력해 주세요."),
);

assert(
  "H1-D O M2F Collision unchanged",
  collisionChunk.includes('key="login-collision"')
    && loginModal.includes("이미 가입된 휴대폰 번호입니다.")
    && loginModal.includes("새 계정으로 연결하지 않았습니다. 기존 계정으로 로그인해 주세요.")
    && collisionChunk.includes("아이디/비밀번호 찾기")
    && collisionChunk.includes("await returnToLoginAfterCollision()") === false
    && loginModal.includes("await returnToLoginAfterCollision()"),
);

assert(
  "S1 A AccountDrawer does not write html overflow hidden",
  !accountDrawer.includes("document.documentElement.style.overflow")
    && !accountDrawer.includes("document.documentElement.style.overflow = 'hidden'"),
);

assert(
  "S1 B AccountDrawer still locks background page scrolling",
  accountDrawer.includes("body.style.overflow = 'hidden'")
    && accountDrawer.includes("addEventListener('wheel'")
    && accountDrawer.includes("addEventListener('touchmove'")
    && accountDrawer.includes("{ passive: false }"),
);

assert(
  "S1 C Drawer cleanup restores original body styles",
  accountDrawer.includes("const prevOverflow = body.style.overflow")
    && accountDrawer.includes("body.style.overflow = prevOverflow")
    && accountDrawer.includes("body.style.paddingRight = prevPaddingRight"),
);

assert(
  "S1 L AccountDrawer visual contract unchanged",
  accountDrawer.includes("로그인하고 제작하기")
    && accountDrawer.includes("오직 당신만의 커스텀 작품을")
    && accountDrawer.includes("sm:w-[24.5rem]")
    && accountDrawer.includes("'fixed inset-0 flex justify-end overflow-hidden'"),
);

assert(
  "S1 M Drawer → Login layering unchanged",
  loginPage.includes("onRequestAuth={() => setAuthOpen(true)}")
    && loginPage.includes("inert={authOpen && !pendingSocial}")
    && loginModal.includes("ml-auth-env--layered"),
);

assert(
  "S1 N Auth C2-5 contract unchanged",
  loginModal.includes("useState<AuthView>('login')")
    && loginModal.includes("const loginLabelClass = 'block text-[14px] font-medium tracking-tight mb-2 text-text-primary'")
    && loginModal.includes("이미 가입된 휴대폰 번호입니다."),
);

const failed = results.filter((item) => !item.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exitCode = 1;
