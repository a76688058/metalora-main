# NEW 2F M2C-0 — New password username charset

Status: **DONE** (server/trusted contract + A3 UI alignment COMPLETE)

Date: 2026-09-30; closed 2026-10-01 with NEW 2

Decision: NEW password-account usernames are English letters + digits only, length 4–32. Enforced server-side. Existing Login lookup is **not** tightened. Production not mutated.

---

## Status

| Item | Value |
|------|--------|
| NEW 2 / NEW 2F | **CLOSED** |
| M2C-0 | **COMPLETE** — payment-test + Node contract + A3 helpers |
| A3 Signup helper copy | **COMPLETE** |
| Production | **UNCHANGED** — not applied by NEW 2 closure |
| Next | **GPT REVIEW** of NEW 2 closure |

---

## Decision

NEW password username creation:

`^[A-Za-z0-9]{4,32}$`

Storage still lowercases (unchanged). Social internal `ml` + 10 lowercase alphanumeric is unchanged and remains valid.

Login lookup remains conservative. Historical password usernames may contain `.` `_` `-`. `handleLogin` still only requires length ≥ 4, then `memberAuthEmail`. `MEMBER_USERNAME_LEGACY_LOOKUP_RE` documents that shape and is **not** applied as a new Login gate.

---

## Completed

- `memberUsernameSignupError` / `MEMBER_USERNAME_RE` reject punctuation, Hangul, spaces, `<4`, `>32`
- `/api/auth/signup/username-check` and `/api/auth/signup/complete` use that validator
- Payment-test `handle_new_user` for `@metalora.me` requires `^[a-z0-9]{4,32}$` via additive `20260930193000_2f_m2c0_password_username_alnum.sql`
- Historical `20260928160000_2f_c1_0a_login_capability.sql` remains identical to its durable committed source for the legacy create rule
- `profiles_user_custom_id_format` CHECK **not** tightened (legacy rows stay valid)
- A3 Signup helpers aligned to the contract below

---

## A3 UI copy contract — COMPLETE

- Initial/minimum: `영문/숫자 4자 이상`
- Invalid character: `영문과 숫자만 입력해 주세요.`
- Availability: `확인 중...` / `사용 가능` / `이미 사용 중인 아이디입니다.`

API format failures still return generic `요청을 처리할 수 없습니다.` (established). Do not leak regex.

Login input is **not** tightened to the new regex.

---

## Do Not Do

- Apply this SQL to production from NEW 2 closure
- Tighten Login lookup
- Rewrite existing `user_custom_id` rows
- Rewrite historical `20260928160000_2f_c1_0a_login_capability.sql`

---

## Resume

1. **GPT REVIEW** of NEW 2 closure
2. Keep Login compatible with legacy punctuation until a later explicit audit

Ownership: A6 (contract/migration). A3 owns visible helpers.

Relevant files: `src/lib/memberUsername.ts`; `src/lib/passwordAuthHandlers.ts`; `src/components/LoginModal.tsx`; `scripts/sql/payment-test-2f-m2c-0-username-create.sql`; `supabase/migrations/20260930193000_2f_m2c0_password_username_alnum.sql`; `supabase/migrations/20260928160000_2f_c1_0a_login_capability.sql` (historical, unchanged); `scripts/verify-2f-m2c-0-username-create.ts`
