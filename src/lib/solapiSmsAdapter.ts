/**
 * SOLAPI SMS transport for production OTP. Credentials from env only.
 * Never logs API secret, OTP, full phone, or Authorization material.
 */
import type { SmsSendInput, SmsSendResult } from "./smsAdapter";

export const SOLAPI_ADAPTER_NAME = "solapi";

export type SolapiMessagePayload = {
  to: string;
  from: string;
  text: string;
};

export type SolapiTransport = {
  send(message: SolapiMessagePayload): Promise<unknown>;
};

export type SolapiAdapterConfig = {
  apiKey: string;
  apiSecret: string;
  senderNumber: string;
  transport?: SolapiTransport;
};

const STRIP_RE = /[\s\-().]/g;

/** SOLAPI requires digits only, national form (no +, hyphen). Landline senders allowed. */
export function toSolapiPhoneDigits(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const stripped = raw.trim().replace(STRIP_RE, "");
  if (!stripped) return null;
  let digits = stripped;
  if (digits.startsWith("+82")) {
    const rest = digits.slice(3);
    if (!rest) return null;
    digits = rest.startsWith("0") ? rest : `0${rest}`;
  } else if (digits.startsWith("82") && /^82[0-9]{8,12}$/.test(digits)) {
    const rest = digits.slice(2);
    digits = rest.startsWith("0") ? rest : `0${rest}`;
  }
  if (!/^[0-9]{8,13}$/.test(digits)) return null;
  return digits;
}

export function readSolapiConfig(
  env: Record<string, string | undefined>,
): SolapiAdapterConfig | null {
  const apiKey = (env.SOLAPI_API_KEY ?? "").trim();
  const apiSecret = (env.SOLAPI_API_SECRET ?? "").trim();
  const senderRaw = (env.SMS_SENDER_NUMBER ?? "").trim();
  if (!apiKey || !apiSecret || !senderRaw) return null;
  const senderNumber = toSolapiPhoneDigits(senderRaw);
  if (!senderNumber) return null;
  return { apiKey, apiSecret, senderNumber };
}

/** Transactional OTP body from existing OTP fields. OTP layer does not supply SMS text. */
export function otpGenericSmsText(otp: string, ttlSec: number): string | null {
  if (!/^\d{6}$/.test(otp)) return null;
  if (Number.isInteger(ttlSec) && ttlSec > 0 && ttlSec % 60 === 0) {
    const minutes = ttlSec / 60;
    return `[METALORA] 인증번호 ${otp} (${minutes}분)`;
  }
  return `[METALORA] 인증번호 ${otp}`;
}

function logSms(outcome: string, fields: Record<string, string | number>): void {
  console.info("[SMS] solapi", { outcome, ...fields });
}

function classifyTransportError(error: unknown): Extract<SmsSendResult, { ok: false }> {
  const name = error instanceof Error ? error.name : "";
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  if (
    name === "TimeoutError" ||
    name === "AbortError" ||
    code === "ETIMEDOUT" ||
    code === "ABORT_ERR" ||
    code === "UND_ERR_CONNECT_TIMEOUT"
  ) {
    return { ok: false, class: "timeout" };
  }
  if (
    name === "MessageNotReceivedError" ||
    name === "BadRequestError" ||
    name === "ApiKeyError" ||
    name === "InvalidMessageError" ||
    name === "ClientError" ||
    name === "VariableValidationError"
  ) {
    return { ok: false, class: "rejected" };
  }
  return { ok: false, class: "network" };
}

function providerMessageId(result: unknown, requestId: string): string | null {
  if (!result || typeof result !== "object") return null;
  const rec = result as Record<string, unknown>;
  const groupInfo = rec.groupInfo;
  if (groupInfo && typeof groupInfo === "object") {
    const count = (groupInfo as Record<string, unknown>).count;
    if (count && typeof count === "object") {
      const success = (count as Record<string, unknown>).registeredSuccess;
      if (typeof success === "number" && success < 1) return null;
    }
  }
  const list = rec.resultList;
  if (Array.isArray(list) && list[0] && typeof list[0] === "object") {
    const row = list[0] as Record<string, unknown>;
    const status = typeof row.statusCode === "string" ? row.statusCode : "";
    if (status && status !== "2000" && !status.startsWith("2")) return null;
    if (typeof row.messageId === "string" && row.messageId.trim()) {
      return row.messageId.trim();
    }
  }
  if (groupInfo && typeof groupInfo === "object") {
    const count = (groupInfo as Record<string, unknown>).count;
    if (count && typeof count === "object") {
      const success = (count as Record<string, unknown>).registeredSuccess;
      if (typeof success === "number" && success >= 1) {
        const groupId = (groupInfo as Record<string, unknown>).groupId;
        if (typeof groupId === "string" && groupId.trim()) return groupId.trim();
        return `solapi-${requestId}`;
      }
    }
  }
  return null;
}

async function defaultTransport(apiKey: string, apiSecret: string): Promise<SolapiTransport> {
  const { SolapiMessageService } = await import("solapi");
  const service = new SolapiMessageService(apiKey, apiSecret);
  return {
    send: (message) => service.send(message),
  };
}

export class SolapiSmsAdapter {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly senderNumber: string;
  private readonly transport: SolapiTransport | undefined;

  constructor(config: SolapiAdapterConfig) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.senderNumber = config.senderNumber;
    this.transport = config.transport;
  }

  async send(input: SmsSendInput): Promise<SmsSendResult> {
    const to = toSolapiPhoneDigits(input.e164);
    const text = otpGenericSmsText(input.otp, input.ttlSec);
    if (!to || input.templateId !== "otp_generic" || !text) {
      logSms("rejected", { class: "rejected" });
      return { ok: false, class: "rejected" };
    }

    try {
      const transport =
        this.transport ?? (await defaultTransport(this.apiKey, this.apiSecret));
      const result = await transport.send({
        to,
        from: this.senderNumber,
        text,
      });
      const messageId = providerMessageId(result, input.requestId);
      if (!messageId) {
        logSms("rejected", { class: "rejected" });
        return { ok: false, class: "rejected" };
      }
      logSms("accepted", { provider_message_id: messageId });
      return { ok: true, providerMessageId: messageId };
    } catch (error) {
      const failed = classifyTransportError(error);
      logSms("failed", { class: failed.class });
      return failed;
    }
  }
}

export function isSolapiSmsAdapter(adapter: unknown): adapter is SolapiSmsAdapter {
  return adapter instanceof SolapiSmsAdapter;
}
