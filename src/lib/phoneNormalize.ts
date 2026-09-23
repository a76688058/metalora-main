/** KR mobile normalization for verified-phone / OTP. Pure; no I/O. */

export type PhoneNormalizeResult =
  | { ok: true; e164: string }
  | { ok: false };

const STRIP_RE = /[\s\-().]/g;
const DIGITS_OR_PLUS_RE = /^\+?[0-9]+$/;
const MOBILE_010_RE = /^010\d{8}$/;
const MOBILE_LEGACY_RE = /^01[16789]\d{7,8}$/;

function fail(): PhoneNormalizeResult {
  return { ok: false };
}

/**
 * Accept only KR mobiles. Canonical store form is E.164 `+82…`.
 * Equivalents: 01012345678, 010-1234-5678, +821012345678, 821012345678.
 */
export function normalizeKrMobilePhone(raw: string): PhoneNormalizeResult {
  if (typeof raw !== "string") return fail();
  const stripped = raw.trim().replace(STRIP_RE, "");
  if (!stripped || !DIGITS_OR_PLUS_RE.test(stripped)) return fail();

  let national: string;
  if (stripped.startsWith("+82")) {
    const rest = stripped.slice(3);
    if (!rest) return fail();
    national = rest.startsWith("0") ? rest : `0${rest}`;
  } else if (stripped.startsWith("82") && stripped.length >= 11) {
    const rest = stripped.slice(2);
    if (!rest) return fail();
    national = rest.startsWith("0") ? rest : `0${rest}`;
  } else if (stripped.startsWith("0")) {
    national = stripped;
  } else {
    return fail();
  }

  if (MOBILE_010_RE.test(national) || MOBILE_LEGACY_RE.test(national)) {
    return { ok: true, e164: `+82${national.slice(1)}` };
  }

  return fail();
}
