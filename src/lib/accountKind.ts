import { MEMBER_EMAIL_DOMAIN } from "./memberUsername";

export type AccountKind = "password" | "social" | "none";

/** Internal social-first username. Never return to customers as recoverable id. */
export const INTERNAL_SOCIAL_USERNAME_RE = /^ml[a-z0-9]{4,}$/;

export function isInternalSocialUsername(username: string | null | undefined): boolean {
  const value = username?.trim().toLowerCase() ?? "";
  return INTERNAL_SOCIAL_USERNAME_RE.test(value);
}

/**
 * Password accounts: Auth email `*@metalora.me` plus a stored username.
 * Internal `ml…` usernames are never returned as recoverable ids even if the
 * Auth email is the virtual-email password architecture.
 * Social: non-metalora email, oauth-only identities, or internal ml… without metalora email.
 */
export function classifyAccountKind(input: {
  userCustomId: string | null | undefined;
  authEmail: string | null | undefined;
  providers?: string[] | null;
}): AccountKind {
  const username = input.userCustomId?.trim().toLowerCase() ?? "";
  const email = input.authEmail?.trim().toLowerCase() ?? "";
  const providers = (input.providers ?? []).map((p) => p.trim().toLowerCase()).filter(Boolean);
  const oauthProviders = providers.filter((p) => p !== "email");
  const metaloraEmail = email.endsWith(`@${MEMBER_EMAIL_DOMAIN}`);

  if (!username && !email && oauthProviders.length === 0) return "none";
  if (oauthProviders.length > 0 && !metaloraEmail) return "social";
  if (metaloraEmail && username) return "password";
  if (isInternalSocialUsername(username)) return "social";
  if (email && !metaloraEmail) return "social";
  if (username && !metaloraEmail) return "social";
  return "none";
}

export function recoverableUsernameForKind(
  kind: AccountKind,
  userCustomId: string | null | undefined,
): string | null {
  if (kind !== "password") return null;
  const username = userCustomId?.trim() ?? "";
  if (!username || isInternalSocialUsername(username)) return null;
  return username;
}
