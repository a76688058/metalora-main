import { MEMBER_EMAIL_DOMAIN } from "./memberUsername";

export type AccountKind = "password" | "social" | "none";

export type AccountClassification = {
  kind: AccountKind;
  passwordResetAllowed: boolean;
  recoverableUsername: string | null;
};

/**
 * Legacy social-first username *shape*. Not a security authority.
 * Slice C must store an explicit login-capability field
 * (`profiles.password_login_enabled` or equivalent). Do not add that column in B1.
 */
export const INTERNAL_SOCIAL_USERNAME_RE = /^ml[a-z0-9]{4,}$/;

export function isInternalSocialUsername(username: string | null | undefined): boolean {
  const value = username?.trim().toLowerCase() ?? "";
  return INTERNAL_SOCIAL_USERNAME_RE.test(value);
}

function closed(kind: AccountKind): AccountClassification {
  return { kind, passwordResetAllowed: false, recoverableUsername: null };
}

/**
 * B1 classifier — fail closed when password vs social-first cannot be proven.
 *
 * Proven password: Auth email `*@metalora.me` AND a stored username AND
 * (email identity present OR no oauth identities).
 * A later SNS link on a proven password account remains password-capable.
 *
 * Ambiguous (fail closed → kind none, no reset, no username):
 * metalora virtual email + oauth identities without an email identity.
 *
 * `ml…` prefix is never sole authority. A proven password account that chose
 * a username beginning with `ml` remains recoverable.
 */
export function classifyAccount(input: {
  userCustomId: string | null | undefined;
  authEmail: string | null | undefined;
  providers?: string[] | null;
}): AccountClassification {
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
  authEmail: string | null | undefined;
  providers?: string[] | null;
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
