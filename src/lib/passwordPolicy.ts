/** Shared password length contract. Signup UI, recovery/reset, trusted backend, and hosted GoTrue all enforce >= 8. */

export const MEMBER_PASSWORD_MIN_LEN = 8;

export function memberPasswordError(raw: string): string | null {
  if (typeof raw !== "string" || raw.length < MEMBER_PASSWORD_MIN_LEN) {
    return "비밀번호는 8자 이상이어야 합니다.";
  }
  return null;
}
