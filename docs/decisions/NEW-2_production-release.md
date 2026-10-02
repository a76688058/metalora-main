# NEW 2 — Production release closure

Status: **CLOSED** (2026-10-03)

Decision: NEW2 **customer UX/source** remains **CLOSED**. NEW2 **production release** is now **CLOSED**. This is **not** LIVE. This does **not** open NEW 3 / NEW 4. Production payment remains **NOT ACTIVATED**.

GPT governance decision (2026-10-03): production full social phone activation (`pending-social` → phone verification → `POST /api/auth/social/complete` → `verified_phone_*` bind → `social_login_enabled=true` → usable-member) is **NOT REQUIRED FOR NEW2 PRODUCTION RELEASE CLOSURE**. It is **NOT TESTED IN PRODUCTION**. Do **not** write PASS / CERTIFIED / equivalent for it. It is **not** a NEW2 blocker.

No current pipeline stage (NEW 5 / 6 / 7 / 8) explicitly owns that production E2E. Recorded as:

**PRE-LIVE E2E FOLLOW-UP — OWNER STAGE TO BE RESOLVED BEFORE LIVE**

---

## Pipeline

| Item | Value |
|------|--------|
| NEW 1 | **CLOSED** |
| NEW 2 customer UX/source | **CLOSED** |
| NEW 2 production release | **CLOSED** |
| NEW 2 production deployment | **CERTIFIED** |
| NEW 2 production Auth provider parity | **CERTIFIED** |
| NEW 2 production SMS/OTP runtime | **CERTIFIED** |
| NEW 3 | **NOT OPENED** |
| NEW 4 | **NOT OPENED** |
| NEW 5 | **BLOCKED BY NEW 3 + NEW 4** |
| NEW 6–9 | **NOT OPENED** |
| LIVE | **NOT REACHED** |
| Production payment | **NOT ACTIVATED** |

---

## Current production

| Item | Value |
|------|--------|
| Cloud Run project | `metalora-auth` |
| Region | `us-west1` |
| Service | `metalora-direct` |
| Production revision | `metalora-direct-00093-car` @ **100%** |
| Rollback / `stable` | `metalora-direct-00090-kig` |
| `DEPLOY_SHA` | `d38e41ad1173ad542a5b68eaccc7e96cb0b1367c` |
| Production Supabase | `qifloweuwyhvukabgnoa` |
| `METALORA_ENV` | **UNSET** |
| Payment | **OFF / NOT ACTIVATED** |

---

## Auth provider certifications

| Item | Value |
|------|--------|
| Google initiation | **CERTIFIED** |
| Google full OAuth | **CERTIFIED** |
| Kakao initiation | **CERTIFIED** |
| Kakao provider full OAuth | **CERTIFIED VIA VERIFIED-EMAIL AUTO-LINK** |
| Kakao standalone first-time new-user creation | **NOT TESTED** — **NOT REQUIRED FOR NEW2 CLOSURE** |
| Naver initiation | **CERTIFIED** |
| Naver full OAuth | **CERTIFIED** |
| Naver first-time new-user creation | **CERTIFIED** |
| Naver email-optional | **CERTIFIED** |

Hosted providers (production): Google **ENABLED**; Kakao **ENABLED**; custom OAuth **ENABLED**; `custom:naver` **PRESENT + ENABLED** (`provider_type=oidc`, `email_optional=true`). Site URL `https://metalora.art`. Redirect allow-list: `https://metalora.art/auth/callback`, `https://metalora.art/auth/callback*`.

Initial Kakao full-login proof hit operator config (redirect URI, consent-scope mismatch, REST API Key / Client Secret mismatch). User corrected them. Final Kakao OAuth **CERTIFIED**. No secrets recorded.

---

## Hosted Before User Created — current live

| Item | Value |
|------|--------|
| Enabled | **true** |
| URI | `pg-functions://postgres/public/hook_before_user_created` |
| Hook secrets | **UNSET** |
| Function | `public.hook_before_user_created(jsonb)` |
| SECURITY | **INVOKER** |
| `search_path` | `public, pg_catalog` |
| Owner | `postgres` |
| `supabase_auth_admin` EXECUTE | **YES** |
| `service_role` EXECUTE | **NO** |
| PUBLIC / `anon` / `authenticated` EXECUTE | **NO** |
| Current `proacl` | `{postgres=X/postgres,supabase_auth_admin=X/postgres}` |

Older notes that say `service_role` EXECUTE remains, or that Hosted mapping is not applied, are **STALE as current state**. Historical P0.9A / P0.9B-R1 bodies remain historical.

---

## SOLAPI / OTP

SOLAPI runtime, API acceptance, real SMS delivery, OTP verification, and one-time OTP semantics: **CERTIFIED**.

Controlled production test artifacts (do **not** delete): signup = 2 verified challenges / 2 issued tickets; `identity_link` = 1 verified challenge / 1 issued ticket; total `otp_challenges` = 3; `phone_verification_tickets` = 3.

---

## Production aggregates (no PII)

`auth.users` = 21 · `profiles` = 21 · `auth.identities` = 22

Provider mix: `email` = 18 · `google` = 2 · `kakao` = 1 · `custom:naver` = 1 · bare `naver` = 0

Verified-phone production profiles: `verified_phone_e164` = 0 · `verified_phone_fingerprint` = 0 · `phone_verified_at` = 0

OAuth test users/identities remain retained. Cleanup **NOT CERTIFIED**, **NOT REQUIRED FOR NEW2 CLOSURE**, **NOT AUTHORIZED**.

---

## Full social phone activation — production

**NOT TESTED.** Do **not** write PASS / CERTIFIED.

Includes: ticket consumption by `/api/auth/social/complete`; final `verified_phone_*` bind; production social `user_custom_id` assignment; `social_login_enabled=true`; transition to usable-member.

**NOT A NEW2 PRODUCTION-RELEASE BLOCKER.**

**PRE-LIVE E2E FOLLOW-UP — OWNER STAGE TO BE RESOLVED BEFORE LIVE**

---

## Do Not Do

- Do not treat social activation as production-certified
- Do not assign that E2E to NEW 5 / 6 / 7 / 8 without a later SoT decision
- Do not open NEW 3 / NEW 4 from this note
- Do not activate production payment
- Do not delete production test users
- Do not claim LIVE

Ownership: A0. Runbook: `docs/operations.md`. Live handoff: `docs/METALORA_PROJECT_STATE.md`.
