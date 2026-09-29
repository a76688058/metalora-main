import { MEMBER_EMAIL_DOMAIN, isGeneratedSocialUsername } from "./memberUsername";
import {
  CUSTOMER_VISIBLE_SOCIAL_PROVIDERS,
  type CustomerVisibleSocialProvider,
  customerVisibleSocialProvider,
} from "./trustedSocialProviders";

export type AccountKind = "password" | "social" | "none";

export { CUSTOMER_VISIBLE_SOCIAL_PROVIDERS, type CustomerVisibleSocialProvider };

export type AccountClassification = {
  kind: AccountKind;
  passwordResetAllowed: boolean;
  recoverableUsername: string | null;
};

/**
 * Customer-visible recovery providers from REAL `auth.identities` only.
 * Maps `custom:naver` → `naver`. Never infers from email, `ml` prefix,
 * bare `naver`, or `custom:*` wildcards.
 */
export function customerVisibleLinkedProviders(
  providers: readonly string[] | null | undefined,
): CustomerVisibleSocialProvider[] {
  const seen = new Set<CustomerVisibleSocialProvider>();
  for (const raw of providers ?? []) {
    const mapped = customerVisibleSocialProvider(raw);
    if (mapped) seen.add(mapped);
  }
  return CUSTOMER_VISIBLE_SOCIAL_PROVIDERS.filter((provider) => seen.has(provider));
}

/**
 * Legacy social-first username *shape*. Not a security authority.
 * Generated social-first usernames are exactly `ml` + 10 lowercase alphanumeric.
 */
export const INTERNAL_SOCIAL_USERNAME_RE = /^ml[a-z0-9]{4,}$/;

export function isInternalSocialUsername(username: string | null | undefined): boolean {
  const value = username?.trim().toLowerCase() ?? "";
  return INTERNAL_SOCIAL_USERNAME_RE.test(value);
}

function closed(kind: AccountKind): AccountClassification {
  return { kind, passwordResetAllowed: false, recoverableUsername: null };
}

function fromCapabilityFlags(
  passwordLoginEnabled: boolean,
  socialLoginEnabled: boolean,
  userCustomId: string | null | undefined,
): AccountClassification | null {
  const username = userCustomId?.trim() ?? "";
  if (passwordLoginEnabled) {
    const hideGenerated = socialLoginEnabled && isGeneratedSocialUsername(username);
    return {
      kind: "password",
      passwordResetAllowed: true,
      recoverableUsername: hideGenerated || !username ? null : username,
    };
  }
  if (socialLoginEnabled) {
    return closed("social");
  }
  return null;
}

/**
 * Prefer explicit capability flags. Heuristic fallback is only for pre-C1 rows
 * where both flags are absent/false. `ml…` prefix is never authority.
 */
export function classifyAccount(input: {
  userCustomId: string | null | undefined;
  authEmail?: string | null | undefined;
  providers?: string[] | null;
  passwordLoginEnabled?: boolean | null;
  socialLoginEnabled?: boolean | null;
}): AccountClassification {
  const fromFlags = fromCapabilityFlags(
    input.passwordLoginEnabled === true,
    input.socialLoginEnabled === true,
    input.userCustomId,
  );
  if (input.passwordLoginEnabled === true || input.socialLoginEnabled === true) {
    return fromFlags ?? closed("none");
  }

  const username = input.userCustomId?.trim() ?? "";
  const usernameKey = username.toLowerCase();
  const email = input.authEmail?.trim().toLowerCase() ?? "";
  const providers = (input.providers ?? []).map((p) => p.trim().toLowerCase()).filter(Boolean);
  const oauth = providers.filter((p) => p !== "email");
  const hasEmailIdentity = providers.includes("email");
  const metaloraEmail = email.endsWith(`@${MEMBER_EMAIL_DOMAIN}`);

  if (!usernameKey && !email && oauth.length === 0) return closed("none");

  if (!metaloraEmail && (oauth.length > 0 || Boolean(email))) {
    return closed("social");
  }

  if (metaloraEmail && usernameKey) {
    if (oauth.length > 0 && !hasEmailIdentity) {
      return closed("none");
    }
    return {
      kind: "password",
      passwordResetAllowed: true,
      recoverableUsername: username,
    };
  }

  return closed("none");
}

export function classifyAccountKind(input: {
  userCustomId: string | null | undefined;
  authEmail?: string | null | undefined;
  providers?: string[] | null;
  passwordLoginEnabled?: boolean | null;
  socialLoginEnabled?: boolean | null;
}): AccountKind {
  return classifyAccount(input).kind;
}

export function recoverableUsernameForKind(
  kind: AccountKind,
  userCustomId: string | null | undefined,
): string | null {
  if (kind !== "password") return null;
  const username = userCustomId?.trim() ?? "";
  return username || null;
}
