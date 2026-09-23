/** Auth/session integrity helpers. No secrets. */

export const AUTH_STORAGE_KEY = 'metalora-auth-token';
export const AUTH_SYNC_CHANNEL = 'metalora-auth-sync';

export const AUTH_PRESERVE_STORAGE_KEYS = ['theme', 'language', 'cookieConsent'] as const;

const PROFILE_COLUMNS =
  'id, user_custom_id, full_name, phone_number, verified_phone_fingerprint, phone_verified_at, zip_code, address, address_detail, total_spent, is_admin, agreed_to_terms_at, agreed_to_privacy_at, agreed_to_cookie_at, updated_at';

/** Minimal columns for server usable-member checks. Does not include verified_phone_e164. */
export const USABLE_MEMBER_PROFILE_COLUMNS =
  'id, user_custom_id, verified_phone_fingerprint, phone_verified_at';

/** Same-origin relative path only. Blocks open redirects. */
export function safeInternalPath(raw: string | null | undefined): string {
  if (!raw) return '/';
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/')) return '/';
  if (trimmed.startsWith('//')) return '/';
  if (trimmed.includes('://')) return '/';
  if (trimmed.includes('\\')) return '/';
  return trimmed;
}

export function broadcastAuthLogout(): void {
  try {
    const channel = new BroadcastChannel(AUTH_SYNC_CHANNEL);
    channel.postMessage({ type: 'LOGOUT' });
    channel.close();
  } catch {
    // BroadcastChannel may be unavailable.
  }
}

/** Remove the persisted JWT without wiping theme / consent / analytics markers. */
export function clearPersistedAuthToken(): void {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // ignore
  }
}

const TRANSIENT_AUTH_CODES = new Set([
  'request_timeout',
  'over_request_rate_limit',
  'hook_timeout',
  'hook_timeout_after_retry',
]);

const DEFINITIVE_REFRESH_CODES = new Set([
  'refresh_token_not_found',
  'refresh_token_already_used',
  'session_not_found',
  'session_expired',
  'user_not_found',
  'user_banned',
  'bad_jwt',
]);

function authErrorName(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const name = (error as { name?: unknown }).name;
  return typeof name === 'string' ? name : '';
}

function authErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : '';
}

function authErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' && Number.isFinite(status) ? status : undefined;
}

function authErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? '');
}

/**
 * Transport/infrastructure failures that must not force logout.
 * Includes GoTrue AuthRetryableFetchError, timeouts, and 5xx/429-class statuses.
 */
export function isTransientAuthTransportFailure(error: unknown): boolean {
  if (!error) return false;
  const name = authErrorName(error);
  if (name === 'AuthRetryableFetchError' || name === 'AbortError' || name === 'TimeoutError') {
    return true;
  }
  if (error instanceof TypeError) return true;
  const code = authErrorCode(error);
  if (TRANSIENT_AUTH_CODES.has(code)) return true;
  const status = authErrorStatus(error);
  if (status === 408 || status === 429 || (typeof status === 'number' && status >= 500)) {
    return true;
  }
  const message = authErrorMessage(error).toLowerCase();
  return message.includes('lock was stolen') || message.includes('failed to fetch') || message.includes('networkerror');
}

/**
 * Refresh capability is dead/revoked. Clear local React auth only.
 * Does not mean an already-issued access JWT was remotely revoked.
 */
export function isDefinitiveAuthRefreshFailure(error: unknown): boolean {
  if (!error || isTransientAuthTransportFailure(error)) return false;
  const name = authErrorName(error);
  if (name === 'AuthSessionMissingError') return true;
  const code = authErrorCode(error);
  if (DEFINITIVE_REFRESH_CODES.has(code)) return true;
  const message = authErrorMessage(error).toLowerCase();
  if (
    message.includes('invalid refresh token')
    || message.includes('refresh token not found')
    || message.includes('refresh_token_not_found')
    || message.includes('auth session missing')
  ) {
    return true;
  }
  const status = authErrorStatus(error);
  return status === 401 || status === 403;
}

export function isUsableMemberProfile(profile: {
  id?: string | null;
  user_custom_id?: string | null;
  verified_phone_fingerprint?: string | null;
  phone_verified_at?: string | null;
  phone_number?: string | null;
} | null): boolean {
  if (!profile?.id) return false;
  const username = profile.user_custom_id?.trim() ?? '';
  if (!username) return false;
  const fingerprint = profile.verified_phone_fingerprint?.trim() ?? '';
  if (!fingerprint) return false;
  const verifiedAt = typeof profile.phone_verified_at === 'string'
    ? profile.phone_verified_at.trim()
    : '';
  if (!verifiedAt) return false;
  return true;
}

export { PROFILE_COLUMNS };
