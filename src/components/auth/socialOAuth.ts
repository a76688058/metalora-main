import { safeInternalPath } from '../../lib/authIntegrity';

export const C1_SOCIAL_PROVIDERS = ['google', 'kakao'] as const;
export type C1SocialProvider = (typeof C1_SOCIAL_PROVIDERS)[number];

export const SOCIAL_OAUTH_FAIL = '지금은 소셜 로그인을 진행할 수 없습니다.';
export const PHONE_ALREADY_REGISTERED_COPY = '이미 가입된 번호입니다.\n기존 로그인으로 이용해 주세요.';

export function isC1SocialProvider(value: string): value is C1SocialProvider {
  return value === 'google' || value === 'kakao';
}

/** Same-origin callback only. Optional redirect uses A0 AuthCallback `?redirect=` + safeInternalPath. */
export function oauthCallbackUrl(origin: string, redirectUrl?: string | null): string {
  const base = origin.replace(/\/$/, '');
  const callback = `${base}/auth/callback`;
  const dest = safeInternalPath(redirectUrl);
  if (dest === '/') return callback;
  return `${callback}?redirect=${encodeURIComponent(dest)}`;
}

/**
 * Trusted recovery provider list only. Ignore email, ml prefix, account_kind inference.
 */
export function readLinkedProviders(raw: unknown): C1SocialProvider[] {
  if (!Array.isArray(raw)) return [];
  const out: C1SocialProvider[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const value = item.trim().toLowerCase();
    if (!isC1SocialProvider(value)) continue;
    if (!out.includes(value)) out.push(value);
  }
  return out;
}

export type SocialOAuthClient = {
  auth: {
    signInWithOAuth: (args: {
      provider: C1SocialProvider;
      options: { redirectTo: string };
    }) => Promise<{ error: { message?: string } | null }>;
  };
};

export async function startBrowserSocialOAuth(
  client: SocialOAuthClient,
  provider: C1SocialProvider,
  redirectTo: string,
): Promise<{ ok: true } | { ok: false }> {
  try {
    const { error } = await client.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    if (error) return { ok: false };
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
