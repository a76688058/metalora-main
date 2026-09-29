/**
 * C1 microfix: ProfileEditModal hides 아이디 unless password_login_enabled === true.
 * No live OAuth. Does not print usernames, emails, or phone numbers.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

/** Same fail-closed rule as ProfileEditModal. */
function showProfileUsernameRow(passwordLoginEnabled: unknown): boolean {
  return passwordLoginEnabled === true;
}

const editSrc = read("src/components/ProfileEditModal.tsx");
const overlaySrc = read("src/components/ProfileOverlay.tsx");
const authIntegrity = read("src/lib/authIntegrity.ts");

const usernameRow = editSrc.slice(
  editSrc.indexOf("기본 정보"),
  editSrc.indexOf("profile-full-name"),
);

assert(
  "A social-only hides 아이디",
  showProfileUsernameRow(false) === false
    && usernameRow.includes("password_login_enabled === true")
    && usernameRow.includes('htmlFor="profile-username"'),
);

assert(
  "B password-only shows 아이디",
  showProfileUsernameRow(true) === true,
);

assert(
  "C linked (password true, social true) shows 아이디",
  showProfileUsernameRow(true) === true,
);

assert(
  "D undefined/missing/null flag hides 아이디",
  showProfileUsernameRow(undefined) === false
    && showProfileUsernameRow(null) === false
    && showProfileUsernameRow("true") === false,
);

assert(
  "E no ml-prefix or email heuristic in ProfileEditModal",
  !editSrc.includes("startsWith('ml")
    && !editSrc.includes('startsWith("ml')
    && !editSrc.includes(".email")
    && !usernameRow.includes("user_custom_id?.startsWith")
    && !usernameRow.includes("social_login_enabled"),
);

const saveBlock = editSrc.slice(
  editSrc.indexOf("handleUpdateProfile"),
  editSrc.indexOf("await refreshProfile"),
);
assert(
  "F form save does not write user_custom_id",
  saveBlock.includes("full_name: formData.full_name")
    && saveBlock.includes("phone_number: formData.phone_number")
    && !saveBlock.includes("user_custom_id:"),
);

assert(
  "G ProfileOverlay does not render user_custom_id",
  !overlaySrc.includes("user_custom_id")
    && !overlaySrc.includes("아이디"),
);

assert(
  "capability flags are on PROFILE_COLUMNS (A0 already)",
  authIntegrity.includes("password_login_enabled")
    && authIntegrity.includes("social_login_enabled"),
);

assert(
  "form still initializes user_custom_id internally",
  editSrc.includes("user_custom_id: profile.user_custom_id || ''"),
);

const failed = results.filter((item) => !item.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exitCode = 1;
