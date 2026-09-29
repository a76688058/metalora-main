/** Proven Hosted identity providers. Not customer-visible tokens. Not a UI allow-list. */

export const TRUSTED_SOCIAL_IDENTITY_PROVIDERS = ["google", "kakao", "custom:naver"] as const;
export type TrustedSocialIdentityProvider = (typeof TRUSTED_SOCIAL_IDENTITY_PROVIDERS)[number];

export const CUSTOMER_VISIBLE_SOCIAL_PROVIDERS = ["google", "kakao", "naver"] as const;
export type CustomerVisibleSocialProvider = (typeof CUSTOMER_VISIBLE_SOCIAL_PROVIDERS)[number];

const IDENTITY_TO_CUSTOMER = {
  google: "google",
  kakao: "kakao",
  "custom:naver": "naver",
} as const satisfies Record<TrustedSocialIdentityProvider, CustomerVisibleSocialProvider>;

export function normalizeSocialProvider(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

export function isTrustedSocialIdentityProvider(
  value: string,
): value is TrustedSocialIdentityProvider {
  return (TRUSTED_SOCIAL_IDENTITY_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Map a real `auth.identities[].provider` to the customer/recovery token.
 * Bare `naver` and `custom:*` other than `custom:naver` do not map.
 */
export function customerVisibleSocialProvider(
  identityProvider: string,
): CustomerVisibleSocialProvider | null {
  const normalized = normalizeSocialProvider(identityProvider);
  if (!isTrustedSocialIdentityProvider(normalized)) return null;
  return IDENTITY_TO_CUSTOMER[normalized];
}
