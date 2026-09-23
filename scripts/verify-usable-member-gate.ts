/**
 * Local usable-member fail-close checks. No DB. No production mutation.
 */
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import {
  PROFILE_COLUMNS,
  USABLE_MEMBER_PROFILE_COLUMNS,
  isUsableMemberProfile,
} from "../src/lib/authIntegrity";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

type TestResult = { name: string; pass: boolean };
const results: TestResult[] = [];

function assert(name: string, condition: boolean): void {
  results.push({ name, pass: condition });
  console.log(`${condition ? "PASS" : "FAIL"}: ${name}`);
}

const completeMember = {
  id: "11111111-1111-1111-1111-111111111111",
  user_custom_id: "trusteduser",
  verified_phone_fingerprint: "a".repeat(64),
  phone_verified_at: "2026-09-24T00:00:00.000Z",
  phone_number: "010-1111-2222",
};

assert(
  "A complete member is usable",
  isUsableMemberProfile(completeMember) === true,
);

assert(
  "B missing fingerprint is not usable",
  isUsableMemberProfile({
    ...completeMember,
    verified_phone_fingerprint: "",
  }) === false,
);

assert(
  "C missing verified_at is not usable",
  isUsableMemberProfile({
    ...completeMember,
    phone_verified_at: null,
  }) === false,
);

assert(
  "D contact phone only is not usable",
  isUsableMemberProfile({
    id: completeMember.id,
    user_custom_id: completeMember.user_custom_id,
    phone_number: "010-9999-0000",
    verified_phone_fingerprint: null,
    phone_verified_at: null,
  }) === false,
);

assert(
  "E admin is_admin does not bypass customer member rule",
  isUsableMemberProfile({
    id: completeMember.id,
    user_custom_id: "adminuser",
    is_admin: true,
    verified_phone_fingerprint: null,
    phone_verified_at: null,
  } as typeof completeMember & { is_admin: boolean }) === false,
);

const appSrc = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
assert(
  "F ProtectedRoute inherits isUsableMemberProfile and admin path does not",
  appSrc.includes("const usable = isUsableMemberProfile(resolved);")
    && appSrc.includes("if (requireAdmin)")
    && /if \(requireAdmin\) \{[\s\S]*return <>\{children\}<\/>;[\s\S]*if \(!sessionUser \|\| !usable\)/.test(appSrc),
);

const authSrc = fs.readFileSync(path.join(root, "src/context/AuthContext.tsx"), "utf8");
assert(
  "G AuthContext does not drop session solely for incomplete member",
  !authSrc.includes("isUsableMemberProfile")
    && authSrc.includes("PROFILE_COLUMNS"),
);

assert(
  "H trusted completed signup fixture is usable",
  isUsableMemberProfile({
    id: "22222222-2222-2222-2222-222222222222",
    user_custom_id: "happyotp",
    verified_phone_fingerprint: "b".repeat(64),
    phone_verified_at: "2026-09-24T01:00:00.000Z",
  }) === true,
);

assert(
  "I raw public-signup shaped profile is not usable",
  isUsableMemberProfile({
    id: "33333333-3333-3333-3333-333333333333",
    user_custom_id: "rawsignup",
    phone_number: "010-3333-4444",
  }) === false,
);

assert(
  "PROFILE_COLUMNS includes fingerprint and verified_at, not e164",
  PROFILE_COLUMNS.includes("verified_phone_fingerprint")
    && PROFILE_COLUMNS.includes("phone_verified_at")
    && !PROFILE_COLUMNS.includes("verified_phone_e164"),
);

assert(
  "USABLE_MEMBER_PROFILE_COLUMNS is the server member-select contract",
  USABLE_MEMBER_PROFILE_COLUMNS ===
    "id, user_custom_id, verified_phone_fingerprint, phone_verified_at",
);

const passwordSrc = fs.readFileSync(path.join(root, "src/lib/passwordAuthHandlers.ts"), "utf8");
const otpSrc = fs.readFileSync(path.join(root, "src/lib/otpAuthHandlers.ts"), "utf8");
assert(
  "password-change/change_phone read usable member with verified columns",
  passwordSrc.includes("USABLE_MEMBER_PROFILE_COLUMNS")
    && otpSrc.includes("USABLE_MEMBER_PROFILE_COLUMNS"),
);

const cartSrc = fs.readFileSync(path.join(root, "src/components/Cart.tsx"), "utf8");
assert(
  "Cart checkout inherits isUsableMemberProfile",
  cartSrc.includes("isUsableMemberProfile(checkoutProfile)"),
);

const failed = results.filter((item) => !item.pass);
console.log(
  `verify-usable-member-gate ${failed.length === 0 ? "PASS" : "FAIL"} (${results.length - failed.length}/${results.length})`,
);
if (failed.length > 0) process.exit(1);
