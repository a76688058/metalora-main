# NEW 2 P0.9A — Production Before User Created hook source

Status: **DONE** (source checkpoint). Function later installed in P0.9B; **P0.9B is not certified** (A5 blocked on `service_role` EXECUTE). P0.9B-R1 remediates source ACL only.

Date: 2026-10-01

Decision: Production gets a source-controlled Before User Created function matching the closed NEW2 provider contract. Hosted mapping is **not** done from P0.9A. `supabase db push` remains **FORBIDDEN**.

A5 independently reviewed P0.9A: **PASS — READY FOR CHECKPOINT**. Admin `createUser` compatibility is **PROVEN** from existing payment-test Hosted hook evidence. Do **not** claim new production live proof from P0.9A. P0.9B applied the function; A5 then **blocked** live certification because default privileges left explicit `service_role` EXECUTE. See `docs/decisions/NEW-2_p09b-r1-service-role-acl.md`.

---

## Status

| Item | Value |
|------|--------|
| P0.8 DB parity | **CERTIFIED** (prior ticket) |
| P0.9A | **DONE** — source SQL + verifier |
| P0.9B | Function applied; **A5 BLOCKED** (`service_role` EXECUTE) |
| P0.9B-R1 | Source `REVOKE ... FROM service_role`; live REVOKE **not** applied |
| Production SQL apply | **DONE** (function body, P0.9B) — **not certified** |
| Hosted mapping | **NOT DONE** (blocked until live ACL narrowed) |

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
- EXECUTE: `supabase_auth_admin` only. Source must revoke PUBLIC / anon / authenticated / **service_role** (P0.9B-R1). Live production still had explicit `service_role` EXECUTE after P0.9B install; that live REVOKE is not applied in P0.9B-R1.
- Verifier: `npm run verify:new2-prod-before-user-hook`

Payment-test script `scripts/sql/payment-test-2f-b2b-before-user-created.sql` is **unchanged**.

Payload fields used (GoTrue Before User Created event, already proven on payment-test):

- `event.user.is_anonymous`
- `event.user.app_metadata.provider`

Allow `{}`. Reject `{ "error": { "http_code": 403, "message": "Public password signup is not allowed." } }`. Do not `RAISE EXCEPTION` for policy rejection.

---

## Later tickets (not P0.9A)

1. P0.9B applied the function body (A5 blocked certification on `service_role` EXECUTE).
2. Apply updated source (explicit `service_role` REVOKE) via controlled SQL — **not this P0.9A note**.
3. After live ACL reverify: map Hosted Before User Created to `pg-functions://postgres/public/hook_before_user_created`.
4. Separately enable Google / Kakao / `custom:naver` and Site URL / redirect parity.
5. Prove public email `signUp` 403, Admin `createUser` + `/api/auth/signup/complete` still work, `custom:naver` missing-email still allowed.

---

## Do Not Do

- Do not `supabase db push`
- Do not apply or map from this ticket
- Do not grant PUBLIC/anon/authenticated/`service_role` EXECUTE
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
- `docs/operations.md` (hook + ledger notes)
- `docs/decisions/NEW-2_p09b-r1-service-role-acl.md`
