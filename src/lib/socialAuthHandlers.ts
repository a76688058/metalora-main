import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isUsableMemberProfile, USABLE_MEMBER_PROFILE_COLUMNS } from "./authIntegrity";
import { recordAuthSecurityEvent } from "./authSecurityEvents";
import { hitAuthRateLimit } from "./authRateLimit";
import { generateInternalSocialUsername } from "./internalSocialUsername";
import { OTP_RATE_WINDOW_SECONDS, otpTicketHmac } from "./otpCrypto";
import { isTrustedSocialIdentityProvider, normalizeSocialProvider } from "./trustedSocialProviders";
import { resolveTrustedIpMode, trustedClientIp } from "./trustedClientIp";
import { recordMembershipPolicyConsents } from "./consentLedger";

const GENERIC_BAD = "요청을 처리할 수 없습니다.";
const GENERIC_AUTH = "인증이 필요합니다.";
const GENERIC_RETRY = "잠시 후 다시 시도해 주세요.";
const GENERIC_CONFIG = "서버 구성 오류가 발생했습니다.";
const PHONE_ALREADY_REGISTERED = "phone_already_registered";

const SOCIAL_COMPLETE_IP_CAP = 20;
const USERNAME_RETRY_CAP = 8;

type JsonRpc = { ok?: boolean; reason?: string; already_complete?: boolean } & Record<string, unknown>;

export type SocialAuthDeps = {
  supabaseAdmin: SupabaseClient | null;
  supabasePublic: SupabaseClient | null;
  getEnv: () => Record<string, string | undefined>;
};

function readPepper(env: Record<string, string | undefined>): string | null {
  const otpPepper = (env.OTP_PEPPER ?? "").trim();
  return otpPepper.length >= 32 ? otpPepper : null;
}

function requestIp(req: Request, deps: SocialAuthDeps): string {
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

function identityProviders(user: User): string[] {
  const fromIdentities = (user.identities ?? [])
    .map((identity) => normalizeSocialProvider(identity.provider))
    .filter(Boolean);
  const meta = user.app_metadata ?? {};
  const fromMeta = Array.isArray(meta.providers)
    ? meta.providers
        .filter((value): value is string => typeof value === "string")
        .map((value) => normalizeSocialProvider(value))
    : [];
  const single = normalizeSocialProvider(meta.provider);
  return [...new Set([...fromIdentities, ...fromMeta, ...(single ? [single] : [])])];
}

export function isTrustedSocialIdentityUser(user: User): boolean {
  return identityProviders(user).some((provider) => isTrustedSocialIdentityProvider(provider));
}

/** C1 name retained: trusted set is now google / kakao / custom:naver. */
export function isC1SocialIdentityUser(user: User): boolean {
  return isTrustedSocialIdentityUser(user);
}

async function handleSocialComplete(req: Request, res: Response, deps: SocialAuthDeps): Promise<void> {
  const requestId = randomUUID();
  const admin = deps.supabaseAdmin;
  const pub = deps.supabasePublic;
  const pepper = readPepper(deps.getEnv());
  if (!admin || !pub || !pepper) {
    logAuth("social_complete", { request_id: requestId, outcome: "config" });
    res.status(500).json({ ok: false, error: GENERIC_CONFIG });
    return;
  }

  const ip = requestIp(req, deps);
  const limited = await hitAuthRateLimit(
    admin,
    pepper,
    "social_complete_ip",
    ip,
    SOCIAL_COMPLETE_IP_CAP,
    OTP_RATE_WINDOW_SECONDS,
  );
  if (limited === "error") {
    res.status(500).json({ ok: false, error: GENERIC_CONFIG });
    return;
  }
  if (limited === "throttled") {
    logAuth("social_complete", { request_id: requestId, outcome: "throttled" });
    res.status(429).json({ ok: false, error: GENERIC_RETRY });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ ok: false, error: GENERIC_AUTH });
    return;
  }
  const accessToken = authHeader.slice(7).trim();
  if (!accessToken) {
    res.status(401).json({ ok: false, error: GENERIC_AUTH });
    return;
  }

  const { data: authData, error: authError } = await pub.auth.getUser(accessToken);
  if (authError || !authData.user?.id) {
    res.status(401).json({ ok: false, error: GENERIC_AUTH });
    return;
  }
  const user = authData.user;
  if (!isC1SocialIdentityUser(user)) {
    logAuth("social_complete", { request_id: requestId, outcome: "not_social" });
    await recordAuthSecurityEvent(admin, pepper, ip, {
      event: "social_complete",
      outcome: "not_social",
      requestId,
      userId: user.id,
    });
    res.status(400).json({ ok: false, error: GENERIC_BAD });
    return;
  }

  const { data: profile } = await admin
    .from("profiles")
    .select(`${USABLE_MEMBER_PROFILE_COLUMNS}, social_login_enabled, password_login_enabled`)
    .eq("id", user.id)
    .maybeSingle();

  if (isUsableMemberProfile(profile)) {
    logAuth("social_complete", { request_id: requestId, outcome: "already_complete" });
    res.status(200).json({ ok: true, already_complete: true });
    return;
  }

  const body = (req.body ?? {}) as { proof_token?: unknown; consents?: unknown };
  if (!signupConsentsAccepted(body.consents)) {
    res.status(400).json({ ok: false, error: GENERIC_BAD });
    return;
  }
  if (typeof body.proof_token !== "string" || !/^[0-9a-f]{64}$/.test(body.proof_token)) {
    res.status(400).json({ ok: false, error: GENERIC_BAD });
    return;
  }

  const ticketHmac = otpTicketHmac(pepper, body.proof_token);
  for (let attempt = 0; attempt < USERNAME_RETRY_CAP; attempt += 1) {
    const username = generateInternalSocialUsername();
    const { data, error } = await admin.rpc("social_activate_pending", {
      p_user_id: user.id,
      p_ticket_hmac: ticketHmac,
      p_username: username,
    });
    const rpc = (data ?? {}) as JsonRpc;
    if (error) {
      logAuth("social_complete", { request_id: requestId, outcome: "rpc_error" });
      res.status(500).json({ ok: false, error: GENERIC_CONFIG });
      return;
    }
    if (rpc.ok === true) {
      const already = rpc.already_complete === true;
      logAuth("social_complete", {
        request_id: requestId,
        outcome: already ? "already_complete" : "accepted",
      });
      await recordAuthSecurityEvent(admin, pepper, ip, {
        event: "social_complete",
        outcome: already ? "already_complete" : "accepted",
        requestId,
        userId: user.id,
      });
      if (!already) {
        await recordMembershipPolicyConsents(admin, user.id, "membership_social");
      }
      res.status(200).json({
        ok: true,
        already_complete: already,
      });
      return;
    }
    if (rpc.reason === "username_collision") {
      continue;
    }
    if (rpc.reason === "phone_already_registered") {
      logAuth("social_complete", { request_id: requestId, outcome: "phone_already_registered" });
      await recordAuthSecurityEvent(admin, pepper, ip, {
        event: "social_complete",
        outcome: "phone_already_registered",
        requestId,
        userId: user.id,
      });
      res.status(409).json({
        ok: false,
        error: GENERIC_BAD,
        code: PHONE_ALREADY_REGISTERED,
      });
      return;
    }
    logAuth("social_complete", { request_id: requestId, outcome: "rejected" });
    await recordAuthSecurityEvent(admin, pepper, ip, {
      event: "social_complete",
      outcome: "rejected",
      requestId,
      userId: user.id,
    });
    res.status(400).json({ ok: false, error: GENERIC_BAD });
    return;
  }

  logAuth("social_complete", { request_id: requestId, outcome: "username_exhausted" });
  res.status(500).json({ ok: false, error: GENERIC_CONFIG });
}

export function registerSocialAuthRoutes(app: Express, deps: SocialAuthDeps): void {
  app.post("/api/auth/social/complete", (req, res) => {
    void handleSocialComplete(req, res, deps);
  });
}
