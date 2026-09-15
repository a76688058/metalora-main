/** Auth/session integrity helpers. No secrets. */

export const AUTH_STORAGE_KEY = 'metalora-auth-token';
export const AUTH_SYNC_CHANNEL = 'metalora-auth-sync';

export const AUTH_PRESERVE_STORAGE_KEYS = ['theme', 'language', 'cookieConsent'] as const;

const PROFILE_COLUMNS =
  'id, user_custom_id, full_name, phone_number, zip_code, address, address_detail, total_spent, is_admin, agreed_to_terms_at, agreed_to_privacy_at, agreed_to_cookie_at, updated_at';

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

export function isUsableMemberProfile(profile: {
  id?: string | null;
  user_custom_id?: string | null;
} | null): boolean {
  if (!profile?.id) return false;
  const username = profile.user_custom_id?.trim() ?? '';
  return username.length > 0;
}

export { PROFILE_COLUMNS };
