/** Member identity: profiles.user_custom_id and auth email local-part. */

export const MEMBER_USERNAME_MIN_LEN = 4;
export const MEMBER_USERNAME_MAX_LEN = 32;
export const MEMBER_EMAIL_DOMAIN = 'metalora.me';

/** New member signups only. Existing rows are not rewritten. */
export const MEMBER_USERNAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{3,31}$/;

export function normalizeMemberUsername(raw: string): string {
  return raw.trim();
}

export function memberAuthEmail(username: string): string {
  return `${normalizeMemberUsername(username).toLowerCase()}@${MEMBER_EMAIL_DOMAIN}`;
}

export function memberStoredUsername(username: string): string {
  return normalizeMemberUsername(username).toLowerCase();
}

export function memberUsernameSignupError(username: string): string | null {
  const normalized = normalizeMemberUsername(username);
  if (normalized.length < MEMBER_USERNAME_MIN_LEN) {
    return '아이디는 4자 이상으로 입력해주세요.';
  }
  if (normalized.length > MEMBER_USERNAME_MAX_LEN) {
    return '아이디는 32자 이하로 입력해주세요.';
  }
  if (!MEMBER_USERNAME_RE.test(normalized)) {
    return '아이디는 영문, 숫자와 . _ - 만 사용할 수 있습니다.';
  }
  return null;
}
