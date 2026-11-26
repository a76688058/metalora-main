/**
 * Existing password member without a verified phone stays signed in
 * only long enough to reach /member-enroll. No DB. No SMS. No accounts.
 */
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import {
  isExistingPasswordEnrollmentCandidate,
  isUsableMemberProfile,
} from "../src/lib/authIntegrity";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const results: boolean[] = [];
function assert(name: string, condition: boolean): void {
  results.push(condition);
  console.log(`${condition ? "PASS" : "FAIL"}: ${name}`);
}

const userId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const passwordUser = { id: userId, identities: [{ provider: "email" }], app_metadata: { provider: "email" } };
const phoneLess = {
  id: userId,
  user_custom_id: "legacyuser",
  verified_phone_fingerprint: null,
  phone_verified_at: null,
  password_login_enabled: true,
  is_admin: false,
  withdrawn_at: null,
};
const enrolled = {
  ...phoneLess,
  verified_phone_fingerprint: "c".repeat(64),
  phone_verified_at: "2026-01-01T00:00:00.000Z",
};

assert(
  "phone-less password member can enroll",
  isExistingPasswordEnrollmentCandidate(passwordUser, phoneLess) === true
    && isUsableMemberProfile(phoneLess) === false,
);
assert(
  "null password flag still can enroll",
  isExistingPasswordEnrollmentCandidate(passwordUser, { ...phoneLess, password_login_enabled: null }) === true,
);
assert(
  "enrolled member is usable and does not enroll again",
  isUsableMemberProfile(enrolled) === true
    && isExistingPasswordEnrollmentCandidate(passwordUser, enrolled) === false,
);
assert(
  "admin without phone cannot enroll",
  isExistingPasswordEnrollmentCandidate(passwordUser, { ...phoneLess, is_admin: true }) === false,
);
assert(
  "withdrawn account cannot enroll",
  isExistingPasswordEnrollmentCandidate(passwordUser, { ...phoneLess, withdrawn_at: "2026-01-01T00:00:00.000Z" }) === false,
);
assert(
  "disabled password login cannot enroll",
  isExistingPasswordEnrollmentCandidate(passwordUser, { ...phoneLess, password_login_enabled: false }) === false,
);
assert(
  "google identity keeps social completion",
  isExistingPasswordEnrollmentCandidate(
    { id: userId, identities: [{ provider: "google" }] },
    phoneLess,
  ) === false,
);
assert(
  "kakao and custom naver keep social completion",
  isExistingPasswordEnrollmentCandidate({ id: userId, identities: [{ provider: "kakao" }] }, phoneLess) === false
    && isExistingPasswordEnrollmentCandidate({ id: userId, identities: [{ provider: "custom:naver" }] }, phoneLess) === false,
);
assert(
  "missing profile or mismatched id cannot enroll",
  isExistingPasswordEnrollmentCandidate(passwordUser, null) === false
    && isExistingPasswordEnrollmentCandidate(passwordUser, { ...phoneLess, id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" }) === false,
);

const loginModal = fs.readFileSync(path.join(root, "src/components/LoginModal.tsx"), "utf8");
const finishStart = loginModal.indexOf("const finishAuthenticated");
const finishEnd = loginModal.indexOf("const handleLogin", finishStart);
const finishSrc = loginModal.slice(finishStart, finishEnd);
const socialStart = loginModal.indexOf("const handleSocialComplete");
const socialEnd = loginModal.indexOf("const handleInputChange", socialStart);
const socialSrc = loginModal.slice(socialStart, socialEnd);
assert(
  "password finish sends only the enrollment candidate to /member-enroll before sign-out",
  finishSrc.includes("isExistingPasswordEnrollmentCandidate(authUser, profileRow)")
    && finishSrc.includes("navigate('/member-enroll', { replace: true })")
    && finishSrc.indexOf("navigate('/member-enroll'") < finishSrc.indexOf("await signOut"),
);
assert(
  "social completion does not use the password enrollment route",
  !socialSrc.includes("/member-enroll")
    && !socialSrc.includes("isExistingPasswordEnrollmentCandidate"),
);
assert(
  "usable password finish still closes through onSuccess",
  finishSrc.includes("isUsableMemberProfile(profileRow)")
    && finishSrc.includes("if (onSuccess) onSuccess()"),
);

const appSrc = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
const protectedStart = appSrc.indexOf("function ProtectedRoute");
const protectedEnd = appSrc.indexOf("function AnimatedRoutes", protectedStart);
const protectedSrc = appSrc.slice(protectedStart, protectedEnd);
assert(
  "protected customer routes send an enrollment candidate to /member-enroll",
  protectedSrc.includes("isExistingPasswordEnrollmentCandidate(user, resolved)")
    && protectedSrc.includes('return <Navigate to="/member-enroll" replace />;')
    && protectedSrc.indexOf("requireAdmin") < protectedSrc.indexOf("/member-enroll"),
);
assert(
  "admin route still requires is_admin and does not use enrollment",
  protectedSrc.includes("resolved?.is_admin === true")
    && protectedSrc.includes('return <Navigate to="/admin/login" replace />;'),
);

const cartSrc = fs.readFileSync(path.join(root, "src/components/Cart.tsx"), "utf8");
assert(
  "checkout still requires a usable member and sends a candidate to enrollment",
  cartSrc.includes("isUsableMemberProfile(checkoutProfile)")
    && cartSrc.includes("isExistingPasswordEnrollmentCandidate(user, checkoutProfile)")
    && cartSrc.includes("navigate('/member-enroll', { replace: true })"),
);

const paymentSrc = fs.readFileSync(path.join(root, "src/lib/paymentMemberAuth.ts"), "utf8");
assert(
  "payment member gate still requires a usable profile",
  paymentSrc.includes("isUsableMemberProfile(ownerProfile)"),
);

const enrollSrc = fs.readFileSync(path.join(root, "src/pages/MemberEnrollExisting.tsx"), "utf8");
assert(
  "enrollment page keeps OTP on the existing account",
  enrollSrc.includes("isExistingPasswordEnrollmentCandidate(user, profile)")
    && enrollSrc.includes("purpose: 'identity_link'")
    && enrollSrc.includes("'/api/auth/member-enroll-existing'")
    && !enrollSrc.includes("createUser")
    && !enrollSrc.includes("signUp("),
);

const authSrc = fs.readFileSync(path.join(root, "src/context/AuthContext.tsx"), "utf8");
assert(
  "incomplete enrollment does not auto-open Workshop",
  authSrc.includes("isExistingPasswordEnrollmentCandidate(user, profile)")
    && authSrc.includes("isPendingC1SocialCustomer(user, profile)"),
);

const failed = results.filter((item) => !item).length;
console.log(`ENROLL_GATE_FAILURES=${failed}`);
if (failed) process.exit(1);
