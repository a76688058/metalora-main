import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Express, Request, Response } from "express";
import { classifyAccount, type AccountClassification } from "./accountKind";
import { isUsableMemberProfile, USABLE_MEMBER_PROFILE_COLUMNS } from "./authIntegrity";
import { recordAuthSecurityEvent } from "./authSecurityEvents";
import { hitAuthRateLimit } from "./authRateLimit";
import {
  memberAuthEmail,
  memberStoredUsername,
  memberUsernameSignupError,
} from "./memberUsername";
import {
  OTP_RATE_WINDOW_SECONDS,
  OTP_TICKET_TTL_SECONDS,
  generateProofToken,
  otpNamedTokenHmac,
  otpTicketHmac,
} from "./otpCrypto";
import { memberPasswordError } from "./passwordPolicy";
import { resolveTrustedIpMode, trustedClientIp } from "./trustedClientIp";

const GENERIC_BAD = "요청을 처리할 수 없습니다.";
const GENERIC_AUTH = "인증이 필요합니다.";
const GENERIC_RETRY = "잠시 후 다시 시도해 주세요.";
const GENERIC_CONFIG = "서버 구성 오류가 발생했습니다.";
const CURRENT_PASSWORD_BAD = "현재 비밀번호를 확인해주세요.";

const RECOVERY_RESOLVE_IP_CAP = 20;
const PASSWORD_RESET_IP_CAP = 10;
const PASSWORD_CHANGE_CAP = 5;
const PASSWORD_CHANGE_WINDOW_SECONDS = 300;
const SIGNUP_USERNAME_CHECK_IP_CAP = 30;
export const SIGNUP_COMPLETE_IP_CAP = 20;
const SIGNUP_COMPLETE_TICKET_CAP = 8;
const SIGNUP_COMPLETE_FINGERPRINT_CAP = 8;
const SIGNUP_FULL_NAME_MAX_LEN = 100;
const SIGNUP_USERNAME_UNAVAILABLE = "사용할 수 없는 아이디입니다.";
const SIGNUP_PHONE_UNAVAILABLE = "이미 가입된 휴대폰 번호입니다.";

type JsonRpc = { ok?: boolean; reason?: string } & Record<string, unknown>;

type SignupCompleteBody = {
  proofToken: string;
  username: string;
  password: string;
  fullName: string;
};

export type PasswordAuthDeps = {
  supabaseAdmin: SupabaseClient | null;
  supabasePublic: SupabaseClient | null;
  getEnv: () => Record<string, string | undefined>;
};

function readSecrets(env: Record<string, string | undefined>): {
  identityKey: string;
  otpPepper: string;
  supabaseUrl: string;
  anonKey: string;
} | null {
  const identityKey = (env.PHONE_IDENTITY_KEY ?? "").trim();
  const otpPepper = (env.OTP_PEPPER ?? "").trim();
  const supabaseUrl = (env.VITE_SUPABASE_URL ?? "").trim();
  const anonKey = (env.VITE_SUPABASE_ANON_KEY ?? "").trim();
  if (identityKey.length < 32 || otpPepper.length < 32 || !supabaseUrl || !anonKey) return null;
  return { identityKey, otpPepper, supabaseUrl, anonKey };
}

function requestIp(req: Request, deps: PasswordAuthDeps): string {
  return trustedClientIp(req, resolveTrustedIpMode(deps.getEnv()));
}

function logAuth(event: string, fields: Record<string, string | boolean | number>): void {
  console.info(`[AUTH] ${event}`, fields);
}

function signupConsentsAccepted(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const consents = raw as { terms?: unknown; privacy?: unknown; cookie?: unknown };
  return consents.terms === true && consents.privacy === true && consents.cookie === true;
}

function parseSignupCompleteBody(raw: unknown): SignupCompleteBody | { error: string } {
  if (!raw || typeof raw !== "object") return { error: GENERIC_BAD };
  const body = raw as {
    proof_token?: unknown;
    username?: unknown;
    password?: unknown;
    full_name?: unknown;
    consents?: unknown;
  };
  if (typeof body.proof_token !== "string" || !/^[0-9a-f]{64}$/.test(body.proof_token)) {
    return { error: GENERIC_BAD };
  }
  if (typeof body.username !== "string" || memberUsernameSignupError(body.username)) {
    return { error: GENERIC_BAD };
  }
  if (typeof body.password !== "string" || memberPasswordError(body.password)) {
    return { error: "비밀번호는 8자 이상이어야 합니다." };
  }
  if (typeof body.full_name !== "string") return { error: GENERIC_BAD };
  const fullName = body.full_name.trim();
  if (fullName.length < 1 || fullName.length > SIGNUP_FULL_NAME_MAX_LEN) {
    return { error: GENERIC_BAD };
  }
  if (!signupConsentsAccepted(body.consents)) return { error: GENERIC_BAD };
  return {
    proofToken: body.proof_token,
    username: memberStoredUsername(body.username),
    password: body.password,
    fullName,
  };
}

function isAuthUsernameConflict(error: { code?: string; message?: string } | null | undefined): boolean {
  const code = (error?.code ?? "").toLowerCase();
  if (code === "email_exists" || code === "user_already_exists") return true;
  const message = (error?.message ?? "").toLowerCase();
  return (
    message.includes("already registered") ||
    message.includes("already been registered") ||
    message.includes("user already exists") ||
    message.includes("user_custom_id")
  );
}

async function readUsableMember(
  deps: PasswordAuthDeps,
  authHeader: string | undefined,
): Promise<{ userId: string } | null> {
  if (!deps.supabaseAdmin || !deps.supabasePublic) return null;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const accessToken = authHeader.slice(7).trim();
  if (!accessToken) return null;
  const { data, error } = await deps.supabasePublic.auth.getUser(accessToken);
  if (error || !data.user?.id) return null;
  const { data: profile, error: profileError } = await deps.supabaseAdmin
    .from("profiles")
    .select(USABLE_MEMBER_PROFILE_COLUMNS)
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError || !isUsableMemberProfile(profile)) return null;
  return { userId: data.user.id };
}

async function classifyUser(
  admin: SupabaseClient,
  userId: string,
  userCustomId: string | null,
): Promise<AccountClassification> {
  const { data } = await admin.auth.admin.getUserById(userId);
  const email = data.user?.email ?? null;
  const providers = (data.user?.identities ?? []).map((identity) => identity.provider ?? "");
  return classifyAccount({ userCustomId, authEmail: email, providers });
}

async function handleRecoveryResolve(req: Request, res: Response, deps: PasswordAuthDeps): Promise<void> {
  const requestId = randomUUID();
  const admin = deps.supabaseAdmin;
  const secrets = readSecrets(deps.getEnv());
  if (!admin || !secrets) {
    logAuth("recovery_resolve_config", { request_id: requestId, outcome: "config" });
    res.status(500).json({ ok: false, error: GENERIC_CONFIG });
    return;
  }

  const ip = requestIp(req, deps);
  const limited = await hitAuthRateLimit(
    admin,
    secrets.otpPepper,
    "recovery_resolve_ip",
    ip,
    RECOVERY_RESOLVE_IP_CAP,
    OTP_RATE_WINDOW_SECONDS,
  );
  if (limited === "error") {
    res.status(500).json({ ok: false, error: GENERIC_CONFIG });
    return;
  }
  if (limited === "throttled") {
    logAuth("recovery_resolve", { request_id: requestId, outcome: "throttled" });
    res.status(429).json({ ok: false, error: GENERIC_RETRY });
    return;
  }

  const proofToken = (req.body as { proof_token?: unknown } | undefined)?.proof_token;
  if (typeof proofToken !== "string" || !/^[0-9a-f]{64}$/.test(proofToken)) {
    res.status(400).json({ ok: false, error: GENERIC_BAD });
    return;
  }

  const proofHmac = otpTicketHmac(secrets.otpPepper, proofToken);
  const { data: proofRow } = await admin
    .from("phone_verification_tickets")
    .select("id, purpose, status, expires_at, phone_fingerprint")
    .eq("ticket_hmac", proofHmac)
    .maybeSingle();

  let classification: AccountClassification = {
    kind: "none",
    passwordResetAllowed: false,
    recoverableUsername: null,
  };
  let userId: string | null = null;

  const proofUsable =
    proofRow &&
    proofRow.purpose === "recovery" &&
    proofRow.status === "issued" &&
    typeof proofRow.expires_at === "string" &&
    new Date(proofRow.expires_at).getTime() > Date.now();

  if (proofUsable && typeof proofRow.phone_fingerprint === "string") {
    const { data: profile } = await admin
      .from("profiles")
      .select("id, user_custom_id")
      .eq("verified_phone_fingerprint", proofRow.phone_fingerprint)
      .maybeSingle();
    if (profile?.id) {
      userId = profile.id;
      const username = typeof profile.user_custom_id === "string" ? profile.user_custom_id : null;
      classification = await classifyUser(admin, profile.id, username);
    }
  }

  const sessionToken = generateProofToken();
  const resetToken = classification.passwordResetAllowed ? generateProofToken() : null;
  const expiresAt = new Date(Date.now() + OTP_TICKET_TTL_SECONDS * 1000).toISOString();

  const { data, error } = await admin.rpc("recovery_consume_and_open_session", {
    p_proof_ticket_hmac: proofHmac,
    p_session_hmac: otpNamedTokenHmac(secrets.otpPepper, "recovery", sessionToken),
    p_reset_ticket_hmac:
      resetToken == null ? null : otpNamedTokenHmac(secrets.otpPepper, "reset", resetToken),
    p_user_id: userId,
    p_account_kind: classification.kind,
    p_request_id: requestId,
    p_expires_at: expiresAt,
  });

  if (error || (data as JsonRpc | null)?.ok !== true) {
    logAuth("recovery_resolve", { request_id: requestId, outcome: "rejected" });
    await recordAuthSecurityEvent(admin, secrets.otpPepper, ip, {
      event: "recovery_resolve",
      outcome: "rejected",
      requestId,
    });
    res.status(400).json({ ok: false, error: GENERIC_BAD });
    return;
  }

  logAuth("recovery_resolve", { request_id: requestId, outcome: "accepted", kind: classification.kind });
  await recordAuthSecurityEvent(admin, secrets.otpPepper, ip, {
    event: "recovery_resolve",
    outcome: "accepted",
    requestId,
    userId,
    meta: { account_kind: classification.kind },
  });

  res.status(200).json({
    ok: true,
    recovery_session_token: sessionToken,
    expires_in: OTP_TICKET_TTL_SECONDS,
    account_kind: classification.kind,
    recoverable_username: classification.recoverableUsername,
    password_reset_allowed: classification.passwordResetAllowed,
  });
}

async function handlePasswordReset(req: Request, res: Response, deps: PasswordAuthDeps): Promise<void> {
  const requestId = randomUUID();
  const admin = deps.supabaseAdmin;
  const secrets = readSecrets(deps.getEnv());
  if (!admin || !secrets) {
    res.status(500).json({ ok: false, error: GENERIC_CONFIG });
    return;
  }

  const ip = requestIp(req, deps);
  await admin.rpc("password_reset_mark_stale_claimed");

  const limited = await hitAuthRateLimit(
    admin,
    secrets.otpPepper,
    "password_reset_ip",
    ip,
    PASSWORD_RESET_IP_CAP,
    OTP_RATE_WINDOW_SECONDS,
  );
  if (limited === "error") {
    res.status(500).json({ ok: false, error: GENERIC_CONFIG });
    return;
  }
  if (limited === "throttled") {
    res.status(429).json({ ok: false, error: GENERIC_RETRY });
    return;
  }

  const body = (req.body ?? {}) as { recovery_session_token?: unknown; new_password?: unknown };
  const sessionToken = body.recovery_session_token;
  const newPassword = body.new_password;
  if (typeof sessionToken !== "string" || !/^[0-9a-f]{64}$/.test(sessionToken)) {
    res.status(400).json({ ok: false, error: GENERIC_BAD });
    return;
  }
  if (typeof newPassword !== "string" || memberPasswordError(newPassword)) {
    res.status(400).json({ ok: false, error: "비밀번호는 8자 이상이어야 합니다." });
    return;
  }

  const sessionHmac = otpNamedTokenHmac(secrets.otpPepper, "recovery", sessionToken);
  const { data, error } = await admin.rpc("password_reset_claim_by_session", {
    p_session_hmac: sessionHmac,
  });
  const rpc = (data ?? {}) as JsonRpc;
  if (error || rpc.ok !== true || typeof rpc.ticket_id !== "string" || typeof rpc.user_id !== "string") {
    logAuth("password_reset", { request_id: requestId, outcome: "rejected" });
    await recordAuthSecurityEvent(admin, secrets.otpPepper, ip, {
      event: "password_reset",
      outcome: "rejected",
      requestId,
    });
    res.status(400).json({ ok: false, error: GENERIC_BAD });
    return;
  }

  const ticketId = rpc.ticket_id;
  const userId = rpc.user_id;
  try {
    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });
    if (updateError) {
      await admin.rpc("password_reset_finish", { p_ticket_id: ticketId, p_outcome: "failed" });
      logAuth("password_reset", { request_id: requestId, outcome: "failed" });
      await recordAuthSecurityEvent(admin, secrets.otpPepper, ip, {
        event: "password_reset",
        outcome: "failed",
        requestId,
        userId,
      });
      res.status(400).json({ ok: false, error: GENERIC_BAD });
      return;
    }

    await admin.rpc("password_reset_finish", { p_ticket_id: ticketId, p_outcome: "completed" });
    // Session contract: Auth Admin password update is expected to make refresh
    // tokens unusable. Already-issued access JWTs may remain valid until expiry.
    // No supported user-id admin logout on hosted GoTrue 2.99 / this project.
    logAuth("password_reset", { request_id: requestId, outcome: "completed" });
    await recordAuthSecurityEvent(admin, secrets.otpPepper, ip, {
      event: "password_reset",
      outcome: "completed",
      requestId,
      userId,
    });
    res.status(200).json({ ok: true });
  } catch {
    await admin.rpc("password_reset_finish", { p_ticket_id: ticketId, p_outcome: "indeterminate" });
    logAuth("password_reset", { request_id: requestId, outcome: "indeterminate" });
    await recordAuthSecurityEvent(admin, secrets.otpPepper, ip, {
      event: "password_reset",
      outcome: "indeterminate",
      requestId,
      userId,
    });
    res.status(500).json({ ok: false, error: GENERIC_CONFIG });
  }
}

async function handlePasswordChange(req: Request, res: Response, deps: PasswordAuthDeps): Promise<void> {
  const requestId = randomUUID();
  const admin = deps.supabaseAdmin;
  const secrets = readSecrets(deps.getEnv());
  if (!admin || !secrets) {
    res.status(500).json({ ok: false, error: GENERIC_CONFIG });
    return;
  }

  const member = await readUsableMember(deps, req.headers.authorization);
  if (!member) {
    res.status(401).json({ ok: false, error: GENERIC_AUTH });
    return;
  }

  const ip = requestIp(req, deps);
  const limited = await hitAuthRateLimit(
    admin,
    secrets.otpPepper,
    "password_change_ip_user",
    `${ip}\0${member.userId}`,
    PASSWORD_CHANGE_CAP,
    PASSWORD_CHANGE_WINDOW_SECONDS,
  );
  if (limited === "error") {
    res.status(500).json({ ok: false, error: GENERIC_CONFIG });
    return;
  }
  if (limited === "throttled") {
    res.status(429).json({ ok: false, error: GENERIC_RETRY });
    return;
  }

  const body = (req.body ?? {}) as { current_password?: unknown; new_password?: unknown };
  if (typeof body.current_password !== "string" || typeof body.new_password !== "string") {
    res.status(400).json({ ok: false, error: GENERIC_BAD });
    return;
  }
  if (memberPasswordError(body.new_password)) {
    res.status(400).json({ ok: false, error: "비밀번호는 8자 이상이어야 합니다." });
    return;
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("user_custom_id")
    .eq("id", member.userId)
    .maybeSingle();
  const username = typeof profile?.user_custom_id === "string" ? profile.user_custom_id : null;
  const classified = await classifyUser(admin, member.userId, username);
  if (!classified.passwordResetAllowed) {
    logAuth("password_change", { request_id: requestId, outcome: "rejected" });
    await recordAuthSecurityEvent(admin, secrets.otpPepper, ip, {
      event: "password_change",
      outcome: "rejected",
      requestId,
      userId: member.userId,
    });
    res.status(400).json({ ok: false, error: GENERIC_BAD });
    return;
  }

  const { data: authUser } = await admin.auth.admin.getUserById(member.userId);
  const email = authUser.user?.email;
  if (!email) {
    res.status(400).json({ ok: false, error: GENERIC_BAD });
    return;
  }

  const isolated = createClient(secrets.supabaseUrl, secrets.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const reauth = await isolated.auth.signInWithPassword({
    email,
    password: body.current_password,
  });
  await isolated.auth.signOut({ scope: "local" }).catch(() => undefined);
  if (reauth.error || !reauth.data.user) {
    await recordAuthSecurityEvent(admin, secrets.otpPepper, ip, {
      event: "password_change",
      outcome: "reauth_failed",
      requestId,
      userId: member.userId,
    });
    res.status(400).json({ ok: false, error: CURRENT_PASSWORD_BAD });
    return;
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(member.userId, {
    password: body.new_password,
  });
  if (updateError) {
    await recordAuthSecurityEvent(admin, secrets.otpPepper, ip, {
      event: "password_change",
      outcome: "failed",
      requestId,
      userId: member.userId,
    });
    res.status(400).json({ ok: false, error: GENERIC_BAD });
    return;
  }

  logAuth("password_change", { request_id: requestId, outcome: "completed" });
  await recordAuthSecurityEvent(admin, secrets.otpPepper, ip, {
    event: "password_change",
    outcome: "completed",
    requestId,
    userId: member.userId,
  });
  res.status(200).json({ ok: true });
}

async function handleSignupComplete(req: Request, res: Response, deps: PasswordAuthDeps): Promise<void> {
  const requestId = randomUUID();
  const admin = deps.supabaseAdmin;
  const secrets = readSecrets(deps.getEnv());
  if (!admin || !secrets) {
    logAuth("signup_complete", { request_id: requestId, outcome: "config" });
    res.status(500).json({ ok: false, error: GENERIC_CONFIG });
    return;
  }

  const ip = requestIp(req, deps);
  const ipLimit = await hitAuthRateLimit(
    admin,
    secrets.otpPepper,
    "signup_complete_ip",
    ip,
    SIGNUP_COMPLETE_IP_CAP,
    OTP_RATE_WINDOW_SECONDS,
  );
  if (ipLimit === "error") {
    res.status(500).json({ ok: false, error: GENERIC_CONFIG });
    return;
  }
  if (ipLimit === "throttled") {
    logAuth("signup_complete", { request_id: requestId, outcome: "throttled" });
    await recordAuthSecurityEvent(admin, secrets.otpPepper, ip, {
      event: "signup_complete",
      outcome: "throttled",
      requestId,
    });
    res.status(429).json({ ok: false, error: GENERIC_RETRY });
    return;
  }

  const parsed = parseSignupCompleteBody(req.body);
  if ("error" in parsed) {
    logAuth("signup_complete", { request_id: requestId, outcome: "rejected" });
    await recordAuthSecurityEvent(admin, secrets.otpPepper, ip, {
      event: "signup_complete",
      outcome: "rejected",
      requestId,
    });
    res.status(400).json({ ok: false, error: parsed.error });
    return;
  }

  const ticketLimit = await hitAuthRateLimit(
    admin,
    secrets.otpPepper,
    "signup_complete_ticket",
    parsed.proofToken,
    SIGNUP_COMPLETE_TICKET_CAP,
    OTP_RATE_WINDOW_SECONDS,
  );
  if (ticketLimit === "error") {
    res.status(500).json({ ok: false, error: GENERIC_CONFIG });
    return;
  }
  if (ticketLimit === "throttled") {
    logAuth("signup_complete", { request_id: requestId, outcome: "throttled" });
    await recordAuthSecurityEvent(admin, secrets.otpPepper, ip, {
      event: "signup_complete",
      outcome: "throttled",
      requestId,
    });
    res.status(429).json({ ok: false, error: GENERIC_RETRY });
    return;
  }

  const proofHmac = otpTicketHmac(secrets.otpPepper, parsed.proofToken);
  const { data: proofRow } = await admin
    .from("phone_verification_tickets")
    .select("purpose, status, expires_at, phone_fingerprint")
    .eq("ticket_hmac", proofHmac)
    .maybeSingle();

  const proofIssued =
    proofRow &&
    proofRow.purpose === "signup" &&
    proofRow.status === "issued" &&
    typeof proofRow.expires_at === "string" &&
    new Date(proofRow.expires_at).getTime() > Date.now() &&
    typeof proofRow.phone_fingerprint === "string";

  if (
    proofRow &&
    proofRow.purpose === "signup" &&
    (proofRow.status === "claimed" || proofRow.status === "consumed" || proofRow.status === "failed")
  ) {
    logAuth("signup_complete", { request_id: requestId, outcome: "replay" });
    await recordAuthSecurityEvent(admin, secrets.otpPepper, ip, {
      event: "signup_complete",
      outcome: "replay",
      requestId,
    });
    res.status(400).json({ ok: false, error: GENERIC_BAD });
    return;
  }

  if (!proofIssued || typeof proofRow.phone_fingerprint !== "string") {
    logAuth("signup_complete", { request_id: requestId, outcome: "rejected" });
    await recordAuthSecurityEvent(admin, secrets.otpPepper, ip, {
      event: "signup_complete",
      outcome: "rejected",
      requestId,
    });
    res.status(400).json({ ok: false, error: GENERIC_BAD });
    return;
  }

  const fingerprintLimit = await hitAuthRateLimit(
    admin,
    secrets.otpPepper,
    "signup_complete_fingerprint",
    proofRow.phone_fingerprint,
    SIGNUP_COMPLETE_FINGERPRINT_CAP,
    OTP_RATE_WINDOW_SECONDS,
  );
  if (fingerprintLimit === "error") {
    res.status(500).json({ ok: false, error: GENERIC_CONFIG });
    return;
  }
  if (fingerprintLimit === "throttled") {
    logAuth("signup_complete", { request_id: requestId, outcome: "throttled" });
    await recordAuthSecurityEvent(admin, secrets.otpPepper, ip, {
      event: "signup_complete",
      outcome: "throttled",
      requestId,
    });
    res.status(429).json({ ok: false, error: GENERIC_RETRY });
    return;
  }

  const { data: usernameTaken, error: usernameError } = await admin.rpc("profiles_username_exists", {
    username: parsed.username,
  });
  if (usernameError) {
    logAuth("signup_complete", { request_id: requestId, outcome: "rejected" });
    res.status(500).json({ ok: false, error: GENERIC_CONFIG });
    return;
  }
  if (usernameTaken === true) {
    logAuth("signup_complete", { request_id: requestId, outcome: "username_conflict" });
    await recordAuthSecurityEvent(admin, secrets.otpPepper, ip, {
      event: "signup_complete",
      outcome: "username_conflict",
      requestId,
    });
    res.status(409).json({ ok: false, error: SIGNUP_USERNAME_UNAVAILABLE, conflict: "username" });
    return;
  }

  const { data: phoneOwner } = await admin
    .from("profiles")
    .select("id")
    .eq("verified_phone_fingerprint", proofRow.phone_fingerprint)
    .maybeSingle();
  if (phoneOwner?.id) {
    logAuth("signup_complete", { request_id: requestId, outcome: "phone_conflict" });
    await recordAuthSecurityEvent(admin, secrets.otpPepper, ip, {
      event: "signup_complete",
      outcome: "phone_conflict",
      requestId,
    });
    res.status(409).json({ ok: false, error: SIGNUP_PHONE_UNAVAILABLE, conflict: "phone" });
    return;
  }

  const { data: claimData, error: claimError } = await admin.rpc("signup_claim_proof", {
    p_ticket_hmac: proofHmac,
  });
  const claimRpc = (claimData ?? {}) as JsonRpc;
  if (claimError || claimRpc.ok !== true) {
    const used = claimRpc.reason === "used";
    logAuth("signup_complete", { request_id: requestId, outcome: used ? "replay" : "rejected" });
    await recordAuthSecurityEvent(admin, secrets.otpPepper, ip, {
      event: "signup_complete",
      outcome: used ? "replay" : "rejected",
      requestId,
    });
    res.status(400).json({ ok: false, error: GENERIC_BAD });
    return;
  }

  const nowIso = new Date().toISOString();
  const created = await admin.auth.admin.createUser({
    email: memberAuthEmail(parsed.username),
    password: parsed.password,
    email_confirm: true,
    user_metadata: {
      user_custom_id: parsed.username,
      full_name: parsed.fullName,
      agreed_to_terms_at: nowIso,
      agreed_to_privacy_at: nowIso,
      agreed_to_cookie_at: nowIso,
    },
  });

  if (created.error || !created.data.user?.id) {
    await admin.rpc("signup_fail_proof", { p_ticket_hmac: proofHmac });
    const usernameConflict = isAuthUsernameConflict(created.error);
    logAuth("signup_complete", {
      request_id: requestId,
      outcome: usernameConflict ? "username_conflict" : "auth_failed",
    });
    await recordAuthSecurityEvent(admin, secrets.otpPepper, ip, {
      event: "signup_complete",
      outcome: usernameConflict ? "username_conflict" : "auth_failed",
      requestId,
    });
    if (usernameConflict) {
      res.status(409).json({ ok: false, error: SIGNUP_USERNAME_UNAVAILABLE, conflict: "username" });
      return;
    }
    res.status(400).json({ ok: false, error: GENERIC_BAD });
    return;
  }

  const userId = created.data.user.id;
  const { data: bindData, error: bindError } = await admin.rpc("phone_bind_signup", {
    p_user_id: userId,
    p_ticket_hmac: proofHmac,
  });
  const bindRpc = (bindData ?? {}) as JsonRpc;
  if (bindError || bindRpc.ok !== true) {
    await admin.rpc("signup_fail_proof", { p_ticket_hmac: proofHmac });
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error) {
      logAuth("signup_complete", { request_id: requestId, outcome: "cleanup_failed" });
      await recordAuthSecurityEvent(admin, secrets.otpPepper, ip, {
        event: "signup_complete",
        outcome: "cleanup_failed",
        requestId,
        userId,
      });
      res.status(500).json({ ok: false, error: GENERIC_CONFIG });
      return;
    }
    const phoneConflict = bindRpc.reason === "conflict";
    logAuth("signup_complete", {
      request_id: requestId,
      outcome: phoneConflict ? "phone_conflict" : "bind_failed",
    });
    await recordAuthSecurityEvent(admin, secrets.otpPepper, ip, {
      event: "signup_complete",
      outcome: phoneConflict ? "phone_conflict" : "bind_failed",
      requestId,
    });
    if (phoneConflict) {
      res.status(409).json({ ok: false, error: SIGNUP_PHONE_UNAVAILABLE, conflict: "phone" });
      return;
    }
    res.status(400).json({ ok: false, error: GENERIC_BAD });
    return;
  }

  logAuth("signup_complete", { request_id: requestId, outcome: "accepted" });
  await recordAuthSecurityEvent(admin, secrets.otpPepper, ip, {
    event: "signup_complete",
    outcome: "accepted",
    requestId,
    userId,
  });
  res.status(200).json({ ok: true });
}

async function handleSignupUsernameCheck(req: Request, res: Response, deps: PasswordAuthDeps): Promise<void> {
  const requestId = randomUUID();
  const admin = deps.supabaseAdmin;
  const secrets = readSecrets(deps.getEnv());
  if (!admin || !secrets) {
    res.status(500).json({ ok: false, error: GENERIC_CONFIG });
    return;
  }

  const ip = requestIp(req, deps);
  const limited = await hitAuthRateLimit(
    admin,
    secrets.otpPepper,
    "signup_username_check_ip",
    ip,
    SIGNUP_USERNAME_CHECK_IP_CAP,
    OTP_RATE_WINDOW_SECONDS,
  );
  if (limited === "throttled") {
    res.status(429).json({ ok: false, error: GENERIC_RETRY });
    return;
  }
  if (limited === "error") {
    res.status(500).json({ ok: false, error: GENERIC_CONFIG });
    return;
  }

  const username = (req.body as { username?: unknown } | undefined)?.username;
  if (typeof username !== "string" || memberUsernameSignupError(username)) {
    res.status(400).json({ ok: false, error: GENERIC_BAD });
    return;
  }

  const { data, error } = await admin.rpc("profiles_username_exists", { username });
  if (error) {
    res.status(500).json({ ok: false, error: GENERIC_CONFIG });
    return;
  }

  logAuth("signup_username_check", { request_id: requestId, outcome: "ok" });
  res.status(200).json({ ok: true, available: data !== true });
}

export function registerPasswordAuthRoutes(app: Express, deps: PasswordAuthDeps): void {
  app.post("/api/auth/recovery/resolve", (req, res) => {
    void handleRecoveryResolve(req, res, deps);
  });
  app.post("/api/auth/password-reset", (req, res) => {
    void handlePasswordReset(req, res, deps);
  });
  app.post("/api/auth/password-change", (req, res) => {
    void handlePasswordChange(req, res, deps);
  });
  app.post("/api/auth/signup/username-check", (req, res) => {
    void handleSignupUsernameCheck(req, res, deps);
  });
  app.post("/api/auth/signup/complete", (req, res) => {
    void handleSignupComplete(req, res, deps);
  });
}
