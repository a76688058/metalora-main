/** Auth/session integrity helpers. No secrets. */

export const AUTH_STORAGE_KEY = 'metalora-auth-token';
export const AUTH_SYNC_CHANNEL = 'metalora-auth-sync';

export const AUTH_PRESERVE_STORAGE_KEYS = ['theme', 'language', 'cookieConsent'] as const;

const PROFILE_COLUMNS =
  'id, user_custom_id, full_name, phone_number, verified_phone_fingerprint, phone_verified_at, password_login_enabled, social_login_enabled, zip_code, address, address_detail, total_spent, is_admin, agreed_to_terms_at, agreed_to_privacy_at, agreed_to_cookie_at, updated_at';

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

/** C1 social providers. Naver is hook-allowed but not a C1 onboarding identity. */
export const C1_SOCIAL_PROVIDERS = ['google', 'kakao'] as const;

function normalizeAuthProvider(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

/**
 * Trusted Auth identity metadata only. Not ml-prefix, not email domain,
 * not a client-supplied provider query string.
 */
export function hasC1SocialIdentity(user: {
  identities?: Array<{ provider?: string | null }> | null;
  app_metadata?: { provider?: unknown; providers?: unknown } | null;
} | null | undefined): boolean {
  if (!user) return false;
  const fromIdentities = (user.identities ?? [])
    .map((identity) => normalizeAuthProvider(identity.provider))
    .filter(Boolean);
  if (fromIdentities.some((provider) =>
    (C1_SOCIAL_PROVIDERS as readonly string[]).includes(provider)
  )) {
    return true;
  }
  const metaProvider = normalizeAuthProvider(user.app_metadata?.provider);
  if ((C1_SOCIAL_PROVIDERS as readonly string[]).includes(metaProvider)) {
    return true;
  }
  const metaProviders = user.app_metadata?.providers;
  if (Array.isArray(metaProviders)) {
    if (metaProviders.some((provider) => {
      const value = normalizeAuthProvider(provider);
      return (C1_SOCIAL_PROVIDERS as readonly string[]).includes(value);
    })) {
      return true;
    }
  }
  return false;
}

export function isPendingC1SocialCustomer(
  user: {
    identities?: Array<{ provider?: string | null }> | null;
    app_metadata?: { provider?: unknown; providers?: unknown } | null;
  } | null | undefined,
  profile: {
    id?: string | null;
    user_custom_id?: string | null;
    verified_phone_fingerprint?: string | null;
    phone_verified_at?: string | null;
    phone_number?: string | null;
  } | null,
): boolean {
  return hasC1SocialIdentity(user) && !isUsableMemberProfile(profile);
}

export function authCallbackHasOAuthError(search: {
  get(name: string): string | null;
}): boolean {
  const error = search.get('error')?.trim() ?? '';
  const errorCode = search.get('error_code')?.trim() ?? '';
  const errorDescription = search.get('error_description')?.trim() ?? '';
  return Boolean(error || errorCode || errorDescription);
}

export function authCallbackLoginPath(redirectRaw?: string | null): string {
  const dest = safeInternalPath(redirectRaw);
  if (dest === '/') return '/login';
  return `/login?redirect=${encodeURIComponent(dest)}`;
}

/**
 * Settled OAuth callback destination. Session is never signed out here.
 * Pending social and other incomplete members both go to /login; A3 detects
 * C1 social via Auth identities, not this path.
 */
export function resolveAuthCallbackPath(input: {
  oauthError: boolean;
  sessionUser: {
    identities?: Array<{ provider?: string | null }> | null;
    app_metadata?: { provider?: unknown; providers?: unknown } | null;
  } | null;
  profile: {
    id?: string | null;
    user_custom_id?: string | null;
    verified_phone_fingerprint?: string | null;
    phone_verified_at?: string | null;
    phone_number?: string | null;
    is_admin?: boolean;
  } | null;
  redirectRaw?: string | null;
}): string {
  if (input.oauthError || !input.sessionUser) return '/login';
  if (isUsableMemberProfile(input.profile)) {
    return safeInternalPath(input.redirectRaw);
  }
  return authCallbackLoginPath(input.redirectRaw);
}

export { PROFILE_COLUMNS };
