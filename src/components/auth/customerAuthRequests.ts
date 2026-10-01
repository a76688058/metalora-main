/** Customer-auth fetch helpers. A3 UX only. No secrets, no logging of tokens/passwords. */

export type AuthJson = Record<string, unknown>;

export type AuthResponse = {
  status: number;
  json: AuthJson;
};

const GENERIC_RETRY = '잠시 후 다시 시도해 주세요.';
const GENERIC_FAIL = '요청을 처리할 수 없습니다.';
const OTP_BAD = '인증번호를 확인해주세요.';
const PHONE_BAD = '휴대폰 번호를 확인해주세요.';
const OTP_EXPIRED = '인증이 만료되었습니다. 다시 시도해 주세요.';
const COMPLETE_FAIL = '가입을 완료하지 못했습니다. 다시 시도해 주세요.';

export async function postCustomerAuth(
  path: string,
  body: Record<string, unknown>,
  options?: { accessToken?: string },
): Promise<AuthResponse> {
  try {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const accessToken = options?.accessToken?.trim();
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const res = await fetch(path, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    let json: AuthJson = {};
    try {
      json = (await res.json()) as AuthJson;
    } catch {
      json = {};
    }
    return { status: res.status, json };
  } catch {
    return { status: 0, json: {} };
  }
}

export function mapOtpSendError(status: number): string {
  if (status === 0 || status === 429 || status >= 500) return GENERIC_RETRY;
  if (status === 400) return PHONE_BAD;
  return GENERIC_FAIL;
}

export function mapOtpVerifyError(status: number, json: AuthJson): string {
  if (status === 0 || status === 429 || status >= 500) return GENERIC_RETRY;
  if (status === 200 && json.ok === false) return '인증에 실패했습니다. 다시 시도해 주세요.';
  if (status === 400) return OTP_EXPIRED;
  return GENERIC_FAIL;
}

export function mapSignupCompleteError(status: number, json: AuthJson): string {
  if (status === 0 || status === 429 || status >= 500) return GENERIC_RETRY;
  if (status === 409 && json.conflict === 'username') return '사용할 수 없는 아이디입니다.';
  if (status === 409 && json.conflict === 'phone') return '이미 가입된 휴대폰 번호입니다.';
  if (typeof json.error === 'string' && json.error.includes('8자')) {
    return '비밀번호는 8자 이상이어야 합니다.';
  }
  if (status === 400 && isProofExpirySignal(json)) return OTP_EXPIRED;
  if (status === 400) return COMPLETE_FAIL;
  return GENERIC_FAIL;
}

export function mapRecoveryResolveError(status: number): string {
  if (status === 0 || status === 429 || status >= 500) return GENERIC_RETRY;
  return '인증을 다시 진행해 주세요.';
}

export function mapPasswordResetError(status: number, json: AuthJson): string {
  if (status === 0 || status === 429 || status >= 500) return GENERIC_RETRY;
  if (typeof json.error === 'string' && json.error.includes('8자')) {
    return '비밀번호는 8자 이상이어야 합니다.';
  }
  return '비밀번호를 변경하지 못했습니다. 다시 시도해 주세요.';
}

export function mapUsernameCheckError(status: number): string {
  if (status === 0 || status === 429 || status >= 500) return GENERIC_RETRY;
  return GENERIC_FAIL;
}

export const PHONE_ALREADY_REGISTERED_CODE = 'phone_already_registered';

export function isPhoneAlreadyRegistered(status: number, json: AuthJson): boolean {
  return status === 409 && json.code === PHONE_ALREADY_REGISTERED_CODE;
}

export function isProofExpirySignal(json: AuthJson): boolean {
  const code = typeof json.code === 'string' ? json.code.trim().toLowerCase() : '';
  return code === 'proof_expired' || code === 'otp_expired';
}

export function isOtpExpiryCustomerCopy(message: string): boolean {
  return message === OTP_EXPIRED;
}

export function mapSocialCompleteError(status: number, json: AuthJson): string {
  if (isPhoneAlreadyRegistered(status, json)) {
    return '이미 가입된 번호입니다.\n기존 로그인으로 이용해 주세요.';
  }
  if (status === 0 || status === 429 || status >= 500) return GENERIC_RETRY;
  if (status === 401) return '인증이 필요합니다.';
  if (status === 400 && isProofExpirySignal(json)) return OTP_EXPIRED;
  if (status === 400) return COMPLETE_FAIL;
  return GENERIC_FAIL;
}

export function readProofToken(json: AuthJson): string | null {
  const token = json.proof_token;
  return typeof token === 'string' && /^[0-9a-f]{64}$/.test(token) ? token : null;
}

export function readRecoverySessionToken(json: AuthJson): string | null {
  const token = json.recovery_session_token;
  return typeof token === 'string' && /^[0-9a-f]{64}$/.test(token) ? token : null;
}
