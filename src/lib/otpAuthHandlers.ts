import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isUsableMemberProfile } from "./authIntegrity";
import {
  OTP_RATE_WINDOW_SECONDS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_SEND_IP_HOUR_CAP,
  OTP_SEND_PHONE_HOUR_CAP,
  OTP_TICKET_TTL_SECONDS,
  OTP_TTL_SECONDS,
  OTP_VERIFY_IP_HOUR_CAP,
  fixedWindowBucketStart,
  generateOtpCode,
  generateProofToken,
  isOtpPurpose,
  otpCodeHmac,
  otpRateKeyHmac,
  otpTicketHmac,
  type OtpPurpose,
} from "./otpCrypto";
import { phoneFingerprint } from "./phoneHmac";
import { normalizeKrMobilePhone } from "./phoneNormalize";
import type { SmsAdapter } from "./smsAdapter";
import { resolveSmsAdapter } from "./smsAdapter";

const GENERIC_BAD = "요청을 처리할 수 없습니다.";
const GENERIC_AUTH = "인증이 필요합니다.";
const GENERIC_RETRY = "잠시 후 다시 시도해 주세요.";
const GENERIC_CONFIG = "서버 구성 오류가 발생했습니다.";

type JsonRpc = { ok?: boolean; reason?: string } & Record<string, unknown>;

export type OtpAuthDeps = {
  supabaseAdmin: SupabaseClient | null;
  supabasePublic: SupabaseClient | null;
  getEnv: () => Record<string, string | undefined>;
  smsAdapter?: SmsAdapter | null;
};

function clientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]!.trim();
  }
  return req.ip || req.socket.remoteAddress || "0.0.0.0";
}

function readSecrets(env: Record<string, string | undefined>): {
  identityKey: string;
  otpPepper: string;
} | null {
  const identityKey = (env.PHONE_IDENTITY_KEY ?? "").trim();
  const otpPepper = (env.OTP_PEPPER ?? "").trim();
  if (identityKey.length < 32 || otpPepper.length < 32) return null;
  return { identityKey, otpPepper };
}

function logOtp(event: string, fields: Record<string, string | boolean | number>): void {
  console.info(`[OTP] ${event}`, fields);
}

async function readBearerUser(
  deps: OtpAuthDeps,
  authHeader: string | undefined,
): Promise<{ userId: string } | null> {
  if (!deps.supabasePublic) return null;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const accessToken = authHeader.slice(7).trim();
  if (!accessToken) return null;
  const { data, error } = await deps.supabasePublic.auth.getUser(accessToken);
  if (error || !data.user?.id) return null;
  return { userId: data.user.id };
}

async function readUsableMember(
  deps: OtpAuthDeps,
  authHeader: string | undefined,
): Promise<{ userId: string } | null> {
  if (!deps.supabaseAdmin) return null;
  const user = await readBearerUser(deps, authHeader);
  if (!user) return null;
  const { data: profile, error } = await deps.supabaseAdmin
    .from("profiles")
    .select("id, user_custom_id")
    .eq("id", user.userId)
    .maybeSingle();
  if (error || !isUsableMemberProfile(profile)) return null;
  return { userId: user.userId };
}

function resolveAdapter(deps: OtpAuthDeps): SmsAdapter | null {
  if (deps.smsAdapter) return deps.smsAdapter;
  const resolved = resolveSmsAdapter(deps.getEnv());
  return resolved.ok ? resolved.adapter : null;
}

async function hitRateLimit(
  admin: SupabaseClient,
  pepper: string,
  scope: string,
  material: string,
  cap: number,
): Promise<"ok" | "throttled" | "error"> {
  const bucket = fixedWindowBucketStart(Date.now(), OTP_RATE_WINDOW_SECONDS);
  const { data, error } = await admin.rpc("auth_rate_limit_hit", {
    p_scope: scope,
    p_key_hmac: otpRateKeyHmac(pepper, scope, material),
    p_window_seconds: OTP_RATE_WINDOW_SECONDS,
    p_bucket_started_at: bucket.toISOString(),
  });
  if (error) {
    logOtp("rate_limit_error", { scope, outcome: "error" });
    return "error";
  }
  const count = typeof data === "number" ? data : Number(data);
  if (!Number.isFinite(count) || count > cap) return "throttled";
  return "ok";
}

async function handleOtpSend(req: Request, res: Response, deps: OtpAuthDeps): Promise<void> {
  const requestId = randomUUID();
  const admin = deps.supabaseAdmin;
  const secrets = readSecrets(deps.getEnv());
  if (!admin || !secrets) {
    logOtp("send_config", { request_id: requestId, outcome: "config" });
    res.status(500).json({ ok: false, error: GENERIC_CONFIG });
    return;
  }

  const purposeRaw = (req.body as { purpose?: unknown } | undefined)?.purpose;
  const phoneRaw = (req.body as { phone?: unknown } | undefined)?.phone;
  if (!isOtpPurpose(purposeRaw) || typeof phoneRaw !== "string") {
    res.status(400).json({ ok: false, error: GENERIC_BAD });
    return;
  }
  const purpose: OtpPurpose = purposeRaw;
  const normalized = normalizeKrMobilePhone(phoneRaw);
  if (!normalized.ok) {
    res.status(400).json({ ok: false, error: GENERIC_BAD });
    return;
  }

  let callerUserId: string | null = null;
  if (purpose === "change_phone") {
    const member = await readUsableMember(deps, req.headers.authorization);
    if (!member) {
      res.status(401).json({ ok: false, error: GENERIC_AUTH });
      return;
    }
    callerUserId = member.userId;
  } else if (purpose === "identity_link") {
    const user = await readBearerUser(deps, req.headers.authorization);
    if (!user) {
      res.status(401).json({ ok: false, error: GENERIC_AUTH });
      return;
    }
    callerUserId = user.userId;
  }

  const fingerprint = phoneFingerprint(normalized.e164, secrets.identityKey);
  const ipHmac = otpRateKeyHmac(secrets.otpPepper, "ip", clientIp(req));
  const challengeUserId = purpose === "signup" || purpose === "recovery" ? null : callerUserId;

  const phoneLimit = await hitRateLimit(
    admin,
    secrets.otpPepper,
    "otp_send_phone",
    fingerprint,
    OTP_SEND_PHONE_HOUR_CAP,
  );
  if (phoneLimit === "error") {
    res.status(500).json({ ok: false, error: GENERIC_CONFIG });
    return;
  }
  if (phoneLimit === "throttled") {
    logOtp("send_throttled", { request_id: requestId, purpose, outcome: "phone" });
    res.status(429).json({ ok: false, error: GENERIC_RETRY });
    return;
  }

  const ipLimit = await hitRateLimit(
    admin,
    secrets.otpPepper,
    "otp_send_ip",
    clientIp(req),
    OTP_SEND_IP_HOUR_CAP,
  );
  if (ipLimit === "error") {
    res.status(500).json({ ok: false, error: GENERIC_CONFIG });
    return;
  }
  if (ipLimit === "throttled") {
    logOtp("send_throttled", { request_id: requestId, purpose, outcome: "ip" });
    res.status(429).json({ ok: false, error: GENERIC_RETRY });
    return;
  }

  const adapter = resolveAdapter(deps);
  if (!adapter) {
    logOtp("send_sms_fail_closed", { request_id: requestId, purpose, outcome: "fail_closed" });
    res.status(500).json({ ok: false, error: GENERIC_CONFIG });
    return;
  }

  const challengeId = randomUUID();
  const code = generateOtpCode();
  const codeHmac = otpCodeHmac(secrets.otpPepper, purpose, fingerprint, code);
  const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString();

  const { data, error } = await admin.rpc("otp_create_active_challenge", {
    p_id: challengeId,
    p_purpose: purpose,
    p_phone_fingerprint: fingerprint,
    p_user_id: challengeUserId,
    p_code_hmac: codeHmac,
    p_ip_hmac: ipHmac,
    p_request_id: requestId,
    p_expires_at: expiresAt,
    p_cooldown_seconds: OTP_RESEND_COOLDOWN_SECONDS,
  });

  if (error) {
    logOtp("send_create_error", { request_id: requestId, purpose, outcome: "error" });
    res.status(500).json({ ok: false, error: GENERIC_CONFIG });
    return;
  }

  const rpc = (data ?? {}) as JsonRpc;
  if (rpc.ok !== true) {
    const reason = rpc.reason === "cooldown" || rpc.reason === "conflict" ? "retry" : "invalid";
    logOtp("send_rejected", { request_id: requestId, purpose, outcome: reason });
    if (rpc.reason === "cooldown" || rpc.reason === "conflict") {
      res.status(429).json({ ok: false, error: GENERIC_RETRY });
      return;
    }
    res.status(400).json({ ok: false, error: GENERIC_BAD });
    return;
  }

  const sms = await adapter.send({
    e164: normalized.e164,
    templateId: "otp_generic",
    otp: code,
    requestId,
    ttlSec: OTP_TTL_SECONDS,
  });

  if (sms.ok === false) {
    await admin
      .from("otp_challenges")
      .update({ status: "failed" })
      .eq("id", challengeId)
      .eq("status", "active");
    logOtp("send_sms_failed", { request_id: requestId, purpose, outcome: sms.class });
    res.status(500).json({ ok: false, error: GENERIC_CONFIG });
    return;
  }

  logOtp("send_accepted", { request_id: requestId, purpose, outcome: "accepted" });
  res.status(200).json({ ok: true });
}

async function handleOtpVerify(req: Request, res: Response, deps: OtpAuthDeps): Promise<void> {
  const requestId = randomUUID();
  const admin = deps.supabaseAdmin;
  const secrets = readSecrets(deps.getEnv());
  if (!admin || !secrets) {
    logOtp("verify_config", { request_id: requestId, outcome: "config" });
    res.status(500).json({ ok: false, error: GENERIC_CONFIG });
    return;
  }

  const body = (req.body ?? {}) as { purpose?: unknown; phone?: unknown; code?: unknown };
  if (!isOtpPurpose(body.purpose) || typeof body.phone !== "string" || typeof body.code !== "string") {
    res.status(400).json({ ok: false, error: GENERIC_BAD });
    return;
  }
  const purpose = body.purpose;
  const normalized = normalizeKrMobilePhone(body.phone);
  const code = body.code.trim();
  if (!normalized.ok || !/^\d{6}$/.test(code)) {
    res.status(200).json({ ok: false });
    return;
  }

  let callerUserId: string | null = null;
  if (purpose === "change_phone") {
    const member = await readUsableMember(deps, req.headers.authorization);
    if (!member) {
      res.status(401).json({ ok: false, error: GENERIC_AUTH });
      return;
    }
    callerUserId = member.userId;
  } else if (purpose === "identity_link") {
    const user = await readBearerUser(deps, req.headers.authorization);
    if (!user) {
      res.status(401).json({ ok: false, error: GENERIC_AUTH });
      return;
    }
    callerUserId = user.userId;
  }

  const ipLimit = await hitRateLimit(
    admin,
    secrets.otpPepper,
    "otp_verify_ip",
    clientIp(req),
    OTP_VERIFY_IP_HOUR_CAP,
  );
  if (ipLimit === "error") {
    res.status(500).json({ ok: false, error: GENERIC_CONFIG });
    return;
  }
  if (ipLimit === "throttled") {
    logOtp("verify_throttled", { request_id: requestId, purpose, outcome: "ip" });
    res.status(429).json({ ok: false, error: GENERIC_RETRY });
    return;
  }

  const fingerprint = phoneFingerprint(normalized.e164, secrets.identityKey);
  const proofToken = generateProofToken();
  const ticketHmac = otpTicketHmac(secrets.otpPepper, proofToken);
  const ticketExpiresAt = new Date(Date.now() + OTP_TICKET_TTL_SECONDS * 1000).toISOString();

  const { data, error } = await admin.rpc("otp_verify_and_issue_ticket", {
    p_purpose: purpose,
    p_phone_fingerprint: fingerprint,
    p_code_hmac: otpCodeHmac(secrets.otpPepper, purpose, fingerprint, code),
    p_ticket_hmac: ticketHmac,
    p_phone_e164: normalized.e164,
    p_caller_user_id: callerUserId,
    p_request_id: requestId,
    p_ticket_expires_at: ticketExpiresAt,
  });

  if (error) {
    logOtp("verify_error", { request_id: requestId, purpose, outcome: "error" });
    res.status(200).json({ ok: false });
    return;
  }

  const rpc = (data ?? {}) as JsonRpc;
  if (rpc.ok !== true) {
    logOtp("verify_rejected", { request_id: requestId, purpose, outcome: "rejected" });
    res.status(200).json({ ok: false });
    return;
  }

  logOtp("verify_accepted", { request_id: requestId, purpose, outcome: "accepted" });
  res.status(200).json({
    ok: true,
    proof_token: proofToken,
    expires_in: OTP_TICKET_TTL_SECONDS,
  });
}

async function handlePhoneBind(req: Request, res: Response, deps: OtpAuthDeps): Promise<void> {
  const requestId = randomUUID();
  const admin = deps.supabaseAdmin;
  const secrets = readSecrets(deps.getEnv());
  if (!admin || !secrets) {
    logOtp("bind_config", { request_id: requestId, outcome: "config" });
    res.status(500).json({ ok: false, error: GENERIC_CONFIG });
    return;
  }

  const member = await readUsableMember(deps, req.headers.authorization);
  if (!member) {
    res.status(401).json({ ok: false, error: GENERIC_AUTH });
    return;
  }

  const proofToken = (req.body as { proof_token?: unknown } | undefined)?.proof_token;
  if (typeof proofToken !== "string" || !/^[0-9a-f]{64}$/.test(proofToken)) {
    res.status(400).json({ ok: false, error: GENERIC_BAD });
    return;
  }

  const { data, error } = await admin.rpc("phone_bind_change_phone", {
    p_user_id: member.userId,
    p_ticket_hmac: otpTicketHmac(secrets.otpPepper, proofToken),
  });

  if (error) {
    const code = typeof error.code === "string" ? error.code : "";
    logOtp("bind_rejected", {
      request_id: requestId,
      purpose: "change_phone",
      outcome: code === "23505" ? "conflict" : "rejected",
    });
    if (code === "23505") {
      res.status(409).json({ ok: false, error: GENERIC_BAD });
      return;
    }
    res.status(400).json({ ok: false, error: GENERIC_BAD });
    return;
  }

  const rpc = (data ?? {}) as JsonRpc;
  if (rpc.ok !== true) {
    logOtp("bind_rejected", { request_id: requestId, purpose: "change_phone", outcome: "rejected" });
    res.status(400).json({ ok: false, error: GENERIC_BAD });
    return;
  }

  logOtp("bind_accepted", { request_id: requestId, purpose: "change_phone", outcome: "accepted" });
  res.status(200).json({ ok: true });
}

export function registerOtpAuthRoutes(app: Express, deps: OtpAuthDeps): void {
  app.post("/api/auth/otp/send", (req, res) => {
    void handleOtpSend(req, res, deps);
  });
  app.post("/api/auth/otp/verify", (req, res) => {
    void handleOtpVerify(req, res, deps);
  });
  app.post("/api/auth/phone/bind", (req, res) => {
    void handlePhoneBind(req, res, deps);
  });
}
