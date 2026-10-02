# NEW 2 P0.6 — SOLAPI production SMS adapter

Status: **DONE** (source checkpoint). **CURRENT LIVE STATE SUPERSEDED** by `docs/decisions/NEW-2_production-release.md` (SOLAPI runtime / real SMS / OTP **CERTIFIED**). Historical body below is the P0.6 source checkpoint only (real SMS was deferred then).

Date: 2026-10-01

Decision: Production OTP transport is an explicit `SMS_ADAPTER=solapi` adapter using the official Node SDK (`solapi`). DevCapture remains payment-test-only. No production secrets, Cloud Run env, or live send in this ticket.

A5 independently reviewed P0.6: **PASS — READY FOR CHECKPOINT**. Sender-number registration is **APPROVED**. Real SMS is **NOT TESTED — INTENTIONALLY DEFERRED**.

---

## Status

| Item | Value |
|------|--------|
| NEW 2 | **CLOSED** (customer UX) |
| P0.6 | **DONE** — SOLAPI adapter in source |
| A5 | **PASS — READY FOR CHECKPOINT** |
| Sender registration | **APPROVED** |
| API Key | **ISSUED** (not in git; not bound) |
| API Secret | **ISSUED** (not in git; not bound) |
| Real SMS | **NOT TESTED — DEFERRED** |
| Production | **UNCHANGED** |
| Next | **GPT REVIEW**. Do **not** bind secrets or send SMS from this checkpoint. |

---

## Decision

Existing `SmsAdapter.send` is transport-only. OTP generation, rate limits, challenge RPC, and fail-closed SMS cleanup stay in `otpAuthHandlers`.

Selection:

- `SMS_ADAPTER=dev-capture` → existing payment-test + non-production-host gate → `DevCaptureSmsAdapter`
- `SMS_ADAPTER=solapi` + `SOLAPI_API_KEY` + `SOLAPI_API_SECRET` + usable `SMS_SENDER_NUMBER` → `SolapiSmsAdapter`
- anything else, or missing SOLAPI config → fail closed

Credentials present without `SMS_ADAPTER=solapi` must **not** select SOLAPI.

Official SDK path (`solapi` 6.x, `SolapiMessageService.send`) was chosen over hand-rolled HMAC HTTPS so auth/signing is not invented. Node engine `>=18` matches Cloud Run `node:22`. Transitive `effect` / `date-fns` come with the SDK.

The existing OTP layer does not supply SMS body text (`otp` + `templateId` + `ttlSec` only). Adapter builds a short transactional body:

`[METALORA] 인증번호 {code} ({ttl minutes}분)`

No marketing copy.

SOLAPI requires national digits (`01012345678` / registered sender). Recipient E.164 `+82…` is converted. Sender is env-only; not hardcoded.

---

## Completed

- `src/lib/solapiSmsAdapter.ts` + resolver update in `src/lib/smsAdapter.ts`
- Mocked verifier `npm run verify:new2-solapi-sms`
- Docker graph includes `solapiSmsAdapter.ts` via `src/lib/*.ts`

---

## OTP send consistency

Challenge is created **before** SMS send. Failed provider send marks `otp_challenges.status=failed`. That existing sequence is preserved.

Known limitation (not restructured here): if the failed-status UPDATE itself errors, an `active` challenge row can remain. Report only; no OTP refactor in P0.6.

---

## Future production mapping (do not apply in this ticket)

Secret Manager:

- `SOLAPI_API_KEY`
- `SOLAPI_API_SECRET`
- `PHONE_IDENTITY_KEY`
- `OTP_PEPPER`

Cloud Run env:

- `SMS_ADAPTER=solapi`
- `SMS_SENDER_NUMBER` = approved sender digits

SOLAPI documented no official SDK dry-run used here. Do not fabricate a sandbox.

SOLAPI API-key IP allowlists are operator config, not application logic.

---

## Do Not Do

- Do not send real SMS until controlled Secret Manager / Cloud Run env binding and the deferred real-send proof
- Do not bind Cloud Run secrets from this ticket
- Do not fall back to DevCapture on production host
- Do not log OTP, API secret, Authorization, or full provider payloads
- Do not open NEW 3 / NEW 4 from this note

---

## Resume Condition

Source adapter is check-pointed. Sender-number registration is **APPROVED**. API Key and API Secret are **ISSUED** but not in git and not bound. Real SMS remains **NOT TESTED**. The future single real-send proof must occur only after controlled secret/env binding.

Sender-number approval is **not** a remaining production blocker.

---

## Ownership

A6. Auth UX / migrations / providers frozen.

---

## Relevant Files

- `src/lib/smsAdapter.ts`
- `src/lib/solapiSmsAdapter.ts`
- `scripts/verify-new2-solapi-sms.ts`
- `docs/operations.md` (env names only)
