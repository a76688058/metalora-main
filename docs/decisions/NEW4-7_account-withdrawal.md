# NEW4-7 — Admin-assisted account withdrawal backend

Status: **READY FOR A5/A6 WITHDRAWAL REVIEW**

Date: 2026-10-07

Decision: Implement **disable + anonymize** (Model B), not hard-delete of `auth.users`. Keep the Auth UUID as a non-personal technical subject so statutory order/payment/consent/CS rows stay valid. Production was not mutated. Payment remains frozen until NEW7.

---

## Chosen model

**DISABLE + ANONYMIZE**

Hard-delete is unsafe on the current graph:

- `profiles`, `user_agreements`, `cs_inquiries`, `cart_items`, `user_progress` historically `ON DELETE CASCADE` from `auth.users`
- `orders.user_id` is `NOT NULL` and FK to `auth.users` (NO ACTION)
- `payment_intents.user_id` is `NOT NULL` and FK to `auth.users` (NO ACTION)
- NEW4-5 consent evidence would vanish under CASCADE
- NEW4-6 purge already keys Storage paths / order ids, not a live login, but fulfillment still needs those order JSON image URLs until the 3-day clock

Keeping the UUID and banning/anonymizing the Auth user is the smallest truthful split: membership ends; retained records keep a stable internal subject.

---

## Withdrawal state

Table: `public.account_withdrawals`

| Field | Role |
|---|---|
| `user_id` | retained subject UUID (unique) |
| `status` | `in_progress` \| `withdrawn` |
| `source` | `admin_assisted` \| `self_service` |
| `requested_at` | set on first insert |
| `completed_at` | set only on successful completion |
| `actor_user_id` | admin (or later self) actor; SET NULL if that Auth row later goes away |
| `failure_reason_class` | retry hint; not PII |

Equivalent membership state:

- **ACTIVE** — no withdrawal row and `profiles.withdrawn_at` is null
- **IN PROGRESS** — `account_withdrawals.status = in_progress`
- **WITHDRAWN** — `status = withdrawn` and `profiles.withdrawn_at` set

No historic backfill.

Idempotency: a second call on an already-withdrawn subject returns success (`already_complete`) without repeating destructive work beyond no-op deletes.

---

## Auth

- Ban (`ban_duration = 876000h`)
- Email replaced with `withdrawn.{uuid}@users.invalid` (RFC 2606; not a mailbox)
- Password rotated to an unknown random value
- Phone cleared when present
- `user_metadata` cleared; `app_metadata.withdrawn = true`
- Provider identities unlinked via GoTrue admin identity DELETE when that route exists (404 is non-fatal because ban still blocks login)
- Hosted GoTrue 2.99 has no user-id admin logout; leftover access JWTs may last until expiry, then `user_banned`. Usable-member checks fail after profile anonymize even if a JWT remains.

Future login blocked: **YES**

OAuth/password: password no longer matches; OAuth hits a banned user with identities removed when the admin API allows it. `password_login_enabled` / `social_login_enabled` set false.

---

## Profile

Removed/anonymized: `full_name`, `phone_number`, `verified_phone_e164`, `verified_phone_fingerprint`, `phone_verified_at`, `zip_code`, `address`, `address_detail`, `user_custom_id`, login capability flags.

Retained on the subject row: `id` (UUID), `is_admin` (must already be false), `total_spent`, unversioned `agreed_to_*` timestamps (non-PII clocks; versioned evidence lives in `user_agreements`), `withdrawn_at`.

Order shipping snapshots are **not** taken from the profile and are not erased.

---

## Phone / OTP / security

| Store | Treatment |
|---|---|
| profile verified phone / fingerprint / e164 | DELETE (null) |
| `otp_challenges` | DELETE ON WITHDRAWAL |
| `phone_verification_tickets` (includes raw e164) | DELETE ON WITHDRAWAL |
| `recovery_sessions` / `password_reset_tickets` | DELETE ON WITHDRAWAL |
| `auth_rate_limits` | left (HMAC keys, windowed; not user FK) |
| `auth_security_events` | RETENTION REQUIRED / SECURITY — keep rows; `user_id` has no FK; no extra PII |

---

## Orders / payments

Orders retained: **YES** (no row delete). `user_id` stays the banned UUID.

Payments retained: **YES**. `payment_intents` are immutable (SELECT/INSERT only) and stay attached to the same UUID.

Auth dependency for *usability* removed; the UUID FK remains on purpose so statutory records stay consistent.

5-year capability: `orders.created_at` / `payment_finalized_at` / `payment_intents.created_at` are the anchors. **Automatic 5-year destruction is NOT implemented.**

---

## Consent evidence

Survives: **YES**

WHO (subject UUID) / type / version / `agreed_at`: **YES** — rows are not updated.

CASCADE issue resolved: **YES** — `user_agreements_user_id_fkey` is now `ON DELETE RESTRICT`. Authenticated clients still cannot INSERT/UPDATE/DELETE; `record_policy_consent` is unchanged. A withdrawn subject trigger blocks new authenticated consent writes.

---

## CS

Survives: **YES**. FK now `ON DELETE RESTRICT`. Title/content/answer/timestamps kept as the dispute record.

3-year capability: `cs_inquiries.created_at` is the anchor. **Automatic 3-year destruction is NOT implemented.**

Profile PII is not copied onto CS. Admin may still UPDATE answers (`profiles_is_current_user_admin` bypass on UPDATE). Customer INSERT/UPDATE after withdrawal is rejected.

InquiryModal was not edited.

---

## Cart / progress

Removed: **YES** (`cart_items`, `user_progress`, unused `collections`).

Unordered Workshop objects under `originals/{uid}/` and `previews/{uid}/` that are **not** referenced by that user’s unpurged orders / payment snapshots are Storage-API-removed immediately. Remaining objects stay eligible for NEW4-6 abandoned purge if anything is left.

---

## Active Workshop order

Withdrawal allowed: **YES** (account level). Existence of PAID/PRODUCTION/SHIPPING does not block withdrawal.

Fulfillment assets preserved: **YES** — paths from unpurged `orders.ordered_items` and `payment_intents.validated_snapshot` are not deleted.

NEW4-6 purge still works: **YES** — job keys order id/number and Storage paths, not a live Auth profile.

---

## Admin operation

`POST /api/admin/account-withdrawal`

Authorization: caller Bearer JWT → `supabasePublic.auth.getUser` → `profiles.is_admin = true` and not withdrawn. Target is `user_id` UUID only (not email).

Ordinary user: **NO** (401/403).

Admin target: **409** `target_is_admin`. Admins cannot withdraw privileged accounts.

Body `source` defaults to `admin_assisted`. `self_service` is accepted by `runAccountWithdrawal` for NEW5 (actor must equal target); the HTTP admin route still requires an admin caller.

Idempotent: **YES**.

---

## Failure / retry

1. Authorize admin  
2. Precheck (not found / admin / already withdrawn)  
3. Mark `in_progress`  
4. Disable Auth (ban / email / password / identities)  
5. Delete cart / progress / OTP / tickets / recovery  
6. Remove unordered Workshop objects only  
7. Anonymize profile + `withdrawn_at`  
8. Stamp `withdrawn` + `completed_at`

Auth is disabled **before** PII wipe so a partial failure does not leave a usable login with stripped profile. `in_progress` + `failure_reason_class` remains; retry resumes. Completion is reported only after step 8.

---

## Automatic retention expiry

orders/payments: **NOT IMPLEMENTED**  
CS: **NOT IMPLEMENTED**

NEW4-4 must not promise automatic destruction after 5/3 years. Anchors exist (`created_at` / `payment_finalized_at`) for a later dedicated expiry ticket.

---

## NEW5 boundary

`runAccountWithdrawal()` in `src/lib/accountWithdrawal.ts` is the reusable operation. NEW5 may add a self-service HTTP route that calls the same function with `source: 'self_service'` and `actorUserId === targetUserId`. No direct DB writes from the future frontend. Protected Member/Account WIP was not touched.

---

## Migrations

`supabase/migrations/20261007080000_new4_7_account_withdrawal.sql`

Production applied: **NO**

Historical timestamps fabricated: **NO**

Cumulative order before any future NEW4 promote:

1. `20261006220000_new4_5_consent_ledger.sql`  
2. `20261006223000_new4_5a_restrict_consent_rpc.sql`  
3. `20261007070000_new4_6_workshop_retention.sql`  
4. `20261007080000_new4_7_account_withdrawal.sql`  
5. app revision containing this endpoint  

No app-first promotion. Do not apply now.

---

## Public copy

Not rewritten. Do not publish instant-delete, hard-delete, or self-service availability. Future truthful direction remains supportable and unpublished.

---

## Production mutation

deploy NONE · Supabase NONE · Auth deletion NONE · Storage NONE · payment NONE

---

## Do Not Do

- Do not hard-delete `auth.users` from this model
- Do not apply migrations / push / deploy
- Do not edit protected A3 WIP or AdminUsers UI
- Do not enable payment
- Do not promise 5y/3y auto-delete in NEW4-4 beyond this backend

---

## Ownership

A6. Relevant files: the NEW4-7 migration, `src/lib/accountWithdrawal.ts`, `server.ts` route, `src/lib/authIntegrity.ts` withdrawn fail-closed, `scripts/verify-new4-7-account-withdrawal.ts`.
