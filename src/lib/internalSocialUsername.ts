/** Server-only social-first username generator. Do not import from client modules. */
import { randomInt } from "node:crypto";
import {
  GENERATED_SOCIAL_USERNAME_RE,
  memberUsernameSignupError,
} from "./memberUsername";

const SOCIAL_USERNAME_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function generateInternalSocialUsername(): string {
  let suffix = "";
  for (let i = 0; i < 10; i += 1) {
    suffix += SOCIAL_USERNAME_ALPHABET[randomInt(0, SOCIAL_USERNAME_ALPHABET.length)]!;
  }
  const username = `ml${suffix}`;
  if (!GENERATED_SOCIAL_USERNAME_RE.test(username) || memberUsernameSignupError(username)) {
    throw new Error("internal social username generator invariant failed");
  }
  return username;
}
