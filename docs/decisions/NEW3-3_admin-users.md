# NEW3-3 — Admin member management rebuild

Status: **READY FOR NEW3-3 FINAL QA**

Date: 2026-10-05

Decision: `/admin/users` is a read-only operational member console. Accurate display beats editing. Customer profile/auth WIP is untouched. Schema is unchanged.

## Searchable fields

View-only, applied before count/range on the full `profiles` set:

- `user_custom_id`
- `phone_number`
- `full_name`

Email is not searchable. Auth email is not available to the browser admin client. `verified_phone_e164` is display-only masked data and is not searched.

## Available member fields (display)

From `public.profiles` via admin SELECT:

- `user_custom_id`
- `full_name`
- `phone_number`
- `verified_phone_e164` (fetched only to produce a masked display string; raw value is never kept on the member model, never rendered, never logged)
- `phone_verified_at` (boolean + timestamp)
- `password_login_enabled`
- `social_login_enabled`
- `is_admin`
- `zip_code`, `address`, `address_detail`
- `agreed_to_terms_at`, `agreed_to_privacy_at`, `agreed_to_cookie_at`
- `updated_at`

Login method is derived from the two capability flags only: 비밀번호 / 소셜 / 비밀번호 · 소셜 / 미설정. Provider names are not inferred.

`profiles` has no `created_at`. 가입일 is not shown.

## Fields intentionally read-only

NEW3-3 has **no admin writes**.

Protected / not editable from this console:

- `phone_number` (treated as verified identity contact when present)
- `verified_phone_fingerprint` (not selected, not shown)
- `verified_phone_e164` (selected only for masking; raw never shown)
- `phone_verified_at`
- Auth email
- `password_login_enabled`
- `social_login_enabled`
- `is_admin`
- `user_custom_id`
- `total_spent`

No admin promotion/demotion UI. Profile address/name are displayed only.

## Email availability

**Not available.** Email is not a `profiles` column. Browser `supabase` cannot call `auth.admin`. Do not display, search, or claim email.

## Phone-integrity protection

Verified-phone authority stays frozen by existing DB trigger. This UI never offers phone edits. `verified_phone_fingerprint` is not selected.

`verified_phone_e164` may be fetched only for masked admin display. Mapping drops the raw value immediately. List/detail show a masked national form such as `010-****-5678`. If the number cannot be formatted safely, a conservative mask is shown. Raw E.164 is never rendered or logged.

Contact display priority: masked verified E.164 when `phone_verified_at` is set; otherwise `phone_number`; otherwise `—`. A verified member never shows `전화번호 —` while labeled 인증됨.

## Admin-role protection

`is_admin` is visible as 관리자 / 일반 회원. It is not editable here. Existing privileged-field trigger still blocks client writes.

## Order / LTV source

`profiles.total_spent` is **not** shown. It can diverge from live orders and is not treated as authoritative.

For the current page of members, one batched `orders` query (`.in('user_id', ids)`) sums count and `total_price` for statuses `PAID`, `PRODUCTION`, `SHIPPING`, `COMPLETED` only. No per-member N+1. PENDING/other statuses are excluded. Empty page skips the orders query.

Profile rows and that page’s order summary are produced by one load pipeline and applied only together.

## Async load generation

Member loads use latest-request-wins. A monotonically increasing generation is captured at the start of each load (search, filters, page, retry). Profiles query and order-summary query run as one pipeline; that combined result is applied only if the generation is still current. Stale success/error/loading updates are ignored. Unmount increments generation so in-flight loads cannot set state. Profile + order-summary results belong to the same generation; they are never mixed across requests.

## Pagination

Page size 25. PostgREST `range` + `count: exact`. Search and filters apply before count/range. Previous/next. Page resets when search or filter changes. No silent hard-cap.

Sort: `updated_at DESC`, `id DESC`.

## Filters

- 회원 구분: 전체 / 일반 회원 / 관리자 (`is_admin`)
- 로그인 방식: 전체 / 비밀번호 / 소셜 / 비밀번호 · 소셜 / 미설정 (stored flag combinations only)

Dead Filter button removed. No invented account states (no VVIP, no withdrawal).

## Do Not Do

- Do not edit `src/components/ProfileEditModal.tsx` or other preserved WIP.
- Do not change profile/order schema.
- Do not mutate production.
- Do not commit / deploy from this ticket.
- Do not expose fingerprint, tokens, password hashes, raw verified phones, or secrets.
