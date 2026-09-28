# NEW 2F B2b — Before User Created hook contract (payment-test)

Status: **DONE**

Date: 2026-09-28

Decision: Payment-test hosted Before User Created hook is **ENABLED and LIVE**. Function `public.hook_before_user_created(jsonb)` is mapped as `pg-functions://postgres/public/hook_before_user_created`. Public `provider=email` `signUp` returns **403** `Public password signup is not allowed.` with no user/session leftover. This also blocks non-`@metalora.me` public email signup. Production `qifloweuwyhvukabgnoa` was **NOT** mutated.

## Completed

- Payment-test only (`bvihpoorwriejybixmoc`). Production untouched.
- Hook SQL lives in `scripts/sql/payment-test-2f-b2b-before-user-created.sql` (not `supabase/migrations/`).
- Function returns the official Auth Hook reject object `{ error: { http_code: 403, message: "Public password signup is not allowed." } }` for email / empty / anonymous, and `{}` for google / kakao / naver.
- EXECUTE granted to `supabase_auth_admin`. Direct execute revoked from PUBLIC / anon / authenticated.
- Hosted Auth mapping is live: `pg-functions://postgres/public/hook_before_user_created`.
- Live proof: public email `signUp` and non-`@metalora.me` email signup both **403** `Public password signup is not allowed.` No leftover user/session.
- Trusted `/api/auth/signup/complete`, Admin `createUser` 8+, and existing `signInWithPassword` still PASS.
- `profiles_username_exists` public grants remain revoked. Official UI uses `POST /api/auth/signup/username-check`.
- Hosted password min 8: 7-char Admin createUser → **422** `weak_password`; 8 chars accepted when otherwise valid.
- Global signup was **not** disabled. Email/password provider remains usable for trusted Admin createUser and existing password login.
- Hook allow-list for google / kakao / naver is **not** SNS implementation. C1 / C2 remain **NOT STARTED**.

## Historical / debug chronology (NOT current state)

Before hosted enablement, the Postgres function existed but was **not** invoked by hosted Auth. Member-email `500 unexpected_failure` and `handle_new_user` / P0001 were **not** hook proof. Those findings are historical only. Do not leave them as current documentation.

## Blocker / Open Item

None for B2b ingress.

## Do Not Do

- Do not add workaround layers (do not weaken `handle_new_user` to fake a 403).
- Do not RAISE EXCEPTION in the hook for expected policy rejection.
- Do not use email-domain inference in the hook.
- Do not set `disable_signup=true` or disable the email provider.
- No production mutation. No SNS implementation from this note. No A3 source edits from this note.
- Do not acquire a Management API token unless a later ticket explicitly authorizes it.
- Do not document current state as “hook not invoked” or “hook still needs to be enabled”.

## Resume Condition

Not required for B2b close. Later SNS/C1 must not globally disable signup and must keep this hook allow-list.

## Resume Procedure

Hosted enablement is already live on payment-test. Later C1/C2:

1. Keep Before User Created enabled on payment-test.
2. Do not globally disable signup.
3. Re-run `npx tsx scripts/verify-2f-b2b-ingress.ts` if hook SQL or mapping changes.
4. Re-prove Admin 8+, trusted signup complete, password login, username RPC revoke, username-check.

## Ownership

A6. Payment-test ref `bvihpoorwriejybixmoc`.

## Relevant Files

- `scripts/sql/payment-test-2f-b2b-before-user-created.sql`
- `scripts/verify-2f-b2b-ingress.ts`
- `scripts/inspect-2f-b2b-hook-500.ts`
- `docs/decisions/NEW-2F_auth-expansion.md`
