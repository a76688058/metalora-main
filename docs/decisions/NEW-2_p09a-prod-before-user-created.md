# NEW 2 P0.9A — Production Before User Created hook source

Status: **DONE** (source checkpoint; production Auth/DB unchanged)

Date: 2026-10-01

Decision: Production gets a source-controlled Before User Created function matching the closed NEW2 provider contract. It is **not applied** and **not mapped** in this ticket. `supabase db push` remains **FORBIDDEN**.

A5 independently reviewed P0.9A: **PASS — READY FOR CHECKPOINT**. Admin `createUser` compatibility is **PROVEN** from existing payment-test Hosted hook evidence. Do **not** claim new production live proof. Production hook remains **NOT APPLIED**.

---

## Status

| Item | Value |
|------|--------|
| P0.8 DB parity | **CERTIFIED** (prior ticket) |
| P0.9A | **DONE** — source SQL + verifier |
| A5 | **PASS — READY FOR CHECKPOINT** |
| Admin createUser compatibility | **PROVEN** (payment-test Hosted hook evidence) |
| Production SQL apply | **NOT DONE** |
| Hosted mapping | **NOT DONE** |
| Google / Kakao / custom:naver Hosted enablement | **NOT DONE** |
| Next | **GPT REVIEW**. Do not apply or map from this checkpoint. |

---

## Decision

Trusted social creation allow-list is exact: `google`, `kakao`, `custom:naver`. Reject bare `naver`, other `custom:*`, Apple, unknown, anonymous, empty/malformed provider, and public `provider=email` signup.

Approved METALORA password members are **not** created by public GoTrue `signUp`. They are created by **service-role Admin `createUser`** on `POST /api/auth/signup/complete` (`src/lib/passwordAuthHandlers.ts`). The UI posts that route (`LoginModal`). The hook therefore blocks public email creation without adding an email-provider bypass. Sign-in is not this hook.

Naver missing email remains allowed when `app_metadata.provider` is `custom:naver`. The hook does not read email.

Hook authorizes or rejects creation only. No `ml…` username generation, no verified-phone writes, no R2 merge/link.

---

## Artifact

- SQL: `scripts/sql/production-2f-before-user-created.sql` (not in `supabase/migrations/`)
- Function: `public.hook_before_user_created(jsonb)`
- Future Hosted URI: `pg-functions://postgres/public/hook_before_user_created`
- Mode: `SECURITY INVOKER`, `search_path = public, pg_catalog`, owner `postgres`
- EXECUTE: `supabase_auth_admin` only (revoked from PUBLIC / anon / authenticated)
- Verifier: `npm run verify:new2-prod-before-user-hook`

Payment-test script `scripts/sql/payment-test-2f-b2b-before-user-created.sql` is **unchanged**.

Payload fields used (GoTrue Before User Created event, already proven on payment-test):

- `event.user.is_anonymous`
- `event.user.app_metadata.provider`

Allow `{}`. Reject `{ "error": { "http_code": 403, "message": "Public password signup is not allowed." } }`. Do not `RAISE EXCEPTION` for policy rejection.

---

## Future apply (NOT this ticket)

1. Controlled production SQL apply of the artifact to `qifloweuwyhvukabgnoa` (SELECT-then-apply; no `db push`).
2. Map Hosted Before User Created to `pg-functions://postgres/public/hook_before_user_created`.
3. Separately enable Google / Kakao / `custom:naver` and Site URL / redirect parity.
4. Prove public email `signUp` 403, Admin `createUser` + `/api/auth/signup/complete` still work, `custom:naver` missing-email still allowed.

---

## Do Not Do

- Do not `supabase db push`
- Do not apply or map from this ticket
- Do not grant PUBLIC/anon/authenticated EXECUTE
- Do not use `LIKE 'custom:%'` or `provider != 'email'`
- Do not require email on `custom:naver`
- Do not generate usernames or bind phones in the hook
- Do not open NEW 3 / NEW 4

---

## Ownership

A6. Production Auth mapping remains a later controlled mutation.

---

## Relevant Files

- `scripts/sql/production-2f-before-user-created.sql`
- `scripts/verify-new2-prod-before-user-hook.ts`
- `docs/operations.md` (hook source note)
