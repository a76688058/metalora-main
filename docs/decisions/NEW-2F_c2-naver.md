# NEW 2F C2 — Naver social auth

Status: **CLOSED** (with NEW 2F)

Date: 2026-09-29 (STAGE OPEN); closed 2026-10-01 with NEW 2

Decision: C2 Naver is **CLOSED** with the NEW 2 customer UX family. Functional/security contracts **PASS**. Unified Auth UX (C2-5) is **COMPLETE**. A5 integrated NEW2 QA **ALL PASS**. USER visually approved inspected core Auth/Header states. Certain live Social Pending / Recovery / R2 terminal screens remain **VISUAL DEFERRED — NON-BLOCKING**.

Parent: `docs/decisions/NEW-2F_account-profile-auth-ux.md`. Expansion: `docs/decisions/NEW-2F_auth-expansion.md`. C1: `docs/decisions/NEW-2F_c1-google-kakao.md`.

Historical evidence below (C2-0–C2-4 matrix, C2-5 milestones) is preserved. Prior “C2 OPEN / waiting visual / do not start A5” headlines are **SUPERSEDED**.

---

## Status

| Item | Value |
|------|--------|
| NEW 2 / NEW 2F | **CLOSED** |
| C1 | **CLOSED** — functional/security PASS; unified visual of inspected core states APPROVED |
| C2 | **CLOSED** — functional/security PASS; C2-5 COMPLETE; A5 ALL PASS |
| C2-0 | **PROOF PASS** — native OIDC `custom:naver`; userinfo proxy **NOT REQUIRED** |
| C2-1 | **IMPLEMENTED** — trusted backend |
| C2-2 | **IMPLEMENTED** — shared pending-social routing includes `custom:naver` |
| C2-3 | **IMPLEMENTED** — customer Naver entry/recovery UI |
| C2-4 | **FUNCTIONALLY COMPLETE** — matrix below |
| C2-5 | **COMPLETE** — unified Auth UX polish; USER visual of inspected core states; A5 215/215 |
| H1 | **COMPLETE** — Home Header hero/content contract; Light primary `#0a0a0a` |
| S1 | **COMPLETE** — AccountDrawer owns scroll lock |
| C2-6 | **COMPLETE** — A5 READ ONLY integrated NEW2 QA ALL PASS |
| Naver | **COMPLETE** (payment-test) |
| Apple | **OUT** |
| Production | **UNCHANGED** |
| Next | **GPT REVIEW** of NEW 2 closure. Do **not** open NEW 3/4 from this note. |

C1 durable HEAD at functional checkpoint: `7b874e3771a42c5b07352ac0e5de312a06e92f6a`. C2 functional checkpoint: `6fbc6e8a5ac12e42b61a8a339c362380fe41bd71`.

---

## Sequence — LOCKED

1. C2 Naver functional implementation
2. Real Naver login/signup/R2/recovery proof
3. Functional QA
4. Final unified Auth UX polish for Google + Kakao + Naver
5. USER final visual approval

Do **not** finalize Auth UX before Naver. Do **not** treat existing A3 C1 polish as final approval.

---

## Implementation slices — LOCKED

Do **not** build the customer Naver button before C2-0 proves the actual provider identity/userinfo contract.

1. **C2-0 A6** — payment-test Naver Hosted/custom OAuth proof
2. **C2-1 A6** — trusted provider / backend / recovery support
3. **C2-2 A0** — shared pending-social identity/session routing if required
4. **C2-3 A3** — Naver customer Auth UI
5. **C2-4** — REAL/FIXTURE matrix execution
6. **C2-5** — unified Auth UX polish for Google/Kakao/Naver → USER visual approval
7. **C2-6 A5** — READ ONLY final QA

---

## C2-0 first principle — LOCKED

Hosted Supabase has no native Naver provider in the C1 PRE-STAGE finding. Candidate identifier `custom:naver` is **not trusted as fact** until payment-test proves `auth.identities[].provider`.

C2-0 must establish, without encoding assumptions:

- exact provider string
- successful PKCE callback
- whether Hosted userinfo mapping succeeds
- whether email is present
- whether email is verified / treated as verified by Hosted Auth
- whether `email_optional` or equivalent is needed
- whether Naver nested userinfo requires a proxy/adapter

---

## C2-0 findings — 2026-09-29 (payment-test only)

Status: **PROOF PASS**, then **REAL ACTIVATED**. Native OIDC `custom:naver`. Userinfo proxy **NOT REQUIRED**. The same singleton Auth user completed social activation on payment-test (matrix A + G). Do **not** delete, merge, or move its identity.

| Fact | Result |
|------|--------|
| Target | `bvihpoorwriejybixmoc` only |
| Production contacted | **NO** |
| Custom provider | `identifier=custom:naver` `provider_type=oidc` `enabled=true` `email_optional=true` `pkce_enabled=true` |
| Issuer | `https://nid.naver.com` |
| Native OIDC | **PASS** |
| Userinfo proxy | **NOT REQUIRED** |
| `auth.identities[].provider` | **`custom:naver`** (proven) |
| `app_metadata.provider` | **`custom:naver`** |
| Provider subject | **PRESENT** |
| Email | **ABSENT** (valid) |
| Profile | **PRESENT**, pending: username / fingerprint / `phone_verified_at` **ABSENT**; capability flags **false** |
| Usable-member / payment | **REJECTED** |
| Hosted auto-link | **NONE** — separate canonical Auth user |
| Native `provider=naver` | still `400 validation_failed` |
| Bare `naver` identity | **NOT** the Hosted identity string |

Inspect scripts: `scripts/inspect-2f-c2-0-naver-provider.ts`, `scripts/inspect-2f-c2-0-naver-live.ts`. Temporary C2-0 browser proof harness `public/c2-0-naver-proof.html` was removed at functional checkpoint (not product/runtime/test).

---

## Security allowlist — LOCKED (C2-1)

Trusted Hosted identity providers (explicit, no wildcards):

- `google`
- `kakao`
- `custom:naver`

Reject: `email`, empty, `anonymous`, bare `naver`, `custom:anything`, unknown.

Customer-visible / recovery token mapping (explicit):

- `google` → `google`
- `kakao` → `kakao`
- `custom:naver` → `naver`

Bare `naver` and `custom:*` other than `custom:naver` do **not** map. No email inference.

Payment-test Before User Created (`scripts/sql/payment-test-2f-b2b-before-user-created.sql`) is the only applied hook. Not a production migration.

---

## Identity / member / recovery — UNCHANGED from C1

- `profiles.id = auth.users.id`
- METALORA reconciliation authority = verified phone, **not** email
- Hosted same-verified-email auto-link remains a platform invariant
- No METALORA email merge, silent identity transfer, or `linkIdentity` UI
- R2: pending social + phone owned by another canonical member → fail closed **after** OTP proof; no activation/merge/transfer/disclosure
- Capability flags: `password_login_enabled` / `social_login_enabled`
- Usable member: id + nonblank username + fingerprint + `phone_verified_at`
- Naver OAuth session alone is **not** usable and **not** payable
- Activated Naver social-only: `password_login_enabled=false`, `social_login_enabled=true`
- Internal username: same `ml` + 10 lowercase alphanumeric, server-only, never customer-facing
- Recovery after Naver activation: no password reset, no recoverable username, `linked_providers` from real `auth.identities` after verified-phone proof; one customer-facing Naver control

---

## Scope

**IN:** payment-test Naver OAuth feasibility/proof; Hosted custom OAuth/OIDC if supported; exact provider string; userinfo/email behavior; trusted classification; pending social; social complete; verified-phone onboarding; R2; recovery `linked_providers`; Login/Signup Naver entry; returning login; real activation; real recovery; C2 matrix; C2 functional/security QA; then unified Auth UX polish.

**OUT:** Apple; production Naver/credentials/redirects/schema/deploy/payment activation; R1 identity transfer; connect/disconnect UI; social-first password set; MFA; withdrawal; marketing-consent expansion; permanent CAPTCHA; session-management UI.

Do not expand C2.

---

## Test matrix

| | Case | Proof |
|--|------|--------|
| A | New Naver + unowned phone | **REAL PASS** |
| B | Same Naver subject returning | **REAL PASS** |
| C | Naver pending + password-member phone | **FIXTURE PASS** |
| D | Naver pending + existing Google member phone | **REAL PASS** |
| E | Naver social recovery after activation | **REAL PASS** |
| F | Same verified-email Hosted auto-link | **NOT NATURALLY EXERCISED** |
| G | Missing/unverified email | **REAL PASS** |

Do not manufacture unnecessary live identities. Production untouched. No merge. No identity transfer. Internal `ml`+10 username never exposed. Activated Naver: `password_login_enabled=false`, `social_login_enabled=true`. Pending collision Auth row remains unusable and is **not** deleted.

---

## Environments

Payment-test only: `bvihpoorwriejybixmoc`. Production `qifloweuwyhvukabgnoa` **MUST** remain untouched. No production provider enablement, credentials, redirects, migrations, deploy, or payment activation.

---

## Ownership

| Slice | Owner |
|------|--------|
| C2-0 / C2-1 | **A6** |
| C2-2 | **A0** if routing required |
| C2-3 / C2-5 | **A3** |
| C2-6 | **A5** READ ONLY |

Preserve dirty WIP (do not revert/stage/edit unless re-owned):

- `src/components/InquiryModal.tsx`
- `src/components/OrdersModal.tsx`
- `src/components/ProfileEditModal.tsx`
- `src/components/ProfileOverlay.tsx`
- `src/pages/ProfileComplete.tsx`

---

## Do Not Do

- Reopen C1/C2 or NEW 2F implementation from this note
- Claim live visual proof for deferred Social Pending / Recovery / R2 terminal screens
- Delete the second pending `custom:naver` Auth user
- Delete, merge, or move the activated Naver identity
- Claim Matrix F
- Trust `custom:*`, bare `naver`, or arbitrary custom providers
- Require or synthesize Naver email
- Change `isUsableMemberProfile` / `verifyPaymentMember`
- Touch production
- Deploy

---

## C2-1 — trusted backend (A6)

Status: **IMPLEMENTED** (functional checkpoint).

- Social complete accepts trusted identity `custom:naver` with the same activation contract as Google/Kakao
- R2: pending `custom:naver` + owned phone → `409 phone_already_registered` after OTP only
- Recovery: `auth.identities` `custom:naver` → `linked_providers=["naver"]`; social-only: `recoverable_username=null`, `password_reset_allowed=false`
- Email absence does not block trusted social activation
- Internal username remains `ml` + 10 lowercase alphanumeric, server-only

Verification: `npm run verify:2f-c2-1` (fixture/disposable only).

---

## C2-2 — pending-social routing (A0)

Status: **IMPLEMENTED** (functional checkpoint).

- Shared `hasC1SocialIdentity` / `isPendingC1SocialCustomer` consume the explicit C2-1 set: `google`, `kakao`, `custom:naver`
- Bare `naver` and `custom:anything` remain rejected
- AuthCallback generic path unchanged: pending/unusable → `/login` with session kept; usable → safe redirect
- AuthContext Workshop skip inherits the helper; pending Naver does not open Workshop
- LoginModal still consumes `isPendingC1SocialCustomer`; a pending `custom:naver` session shows existing generic social onboarding.

Verification: `npx tsx scripts/verify-2f-c2-2-pending-routing.ts`

---

## C2-3 — customer Naver Auth UI (A3)

Status: **IMPLEMENTED** (functional checkpoint). Not final Auth UX polish.

- Login/Signup social entry adds **Naver로 계속** beside Google/Kakao
- Customer token `naver` → Hosted `signInWithOAuth({ provider: "custom:naver" })` + same-origin `/auth/callback`
- Visible UI never renders `custom:naver`
- Recovery `linked_providers=["naver"]` renders the Naver continue control
- Pending onboarding, pending X sign-out, social complete, and R2 collision remain the generic C1 paths
- Bare `naver` and other `custom:*` are not accepted as OAuth/recovery tokens

Verification: `npm run verify:2f-c2-3`

---

## C2-4 — real Naver activation (A6 READ ONLY)

Status: **FUNCTIONALLY COMPLETE**. Two `custom:naver` Auth users remain: (1) activated canonical member; (2) Hosted-OAuth **pending** user from a second Naver account. Do **not** delete pending #2.

Operational note: a stale payment-test server initially returned a false `not_social` HTTP 400. After restarting `npm run dev:payment-test` onto current code, Naver activation succeeded. That stale-process failure is **not** a remaining backend defect.

Prior REAL R2 vs first Naver member’s phone remains recorded. Latest REAL Matrix D: same pending #2 reused + phone owned by an existing **GOOGLE** member → latest `social_complete` `phone_already_registered` (HTTP 409), identity_link OTP verified then unclaimed/unconsumed, no activation, no merge, no `custom:naver` on the Google member, pending sessions 0, first Naver unchanged.

---

## C2-5 — UNIFIED AUTH UX POLISH (A3)

Status: **COMPLETE** (NEW 2 closure). A5 C2-5 **215/215 PASS**. USER approved inspected core states listed in the parent 2F note. Do **not** claim live visual proof for deferred Social Pending / Recovery / R2 terminal screens.

- One Auth surface language: graphite/frost panel, equal Google/Kakao/Naver continue row, shared notices
- Generic `social_complete` HTTP 400 now maps to `가입을 완료하지 못했습니다. 다시 시도해 주세요.` unless `code` is `proof_expired` / `otp_expired`
- Verified OTP (`확인됨`) clears/hides stale expiry copy so it cannot sit beside a completed phone proof
- Overlay uses `min-h-full` inner centering so long signup/recovery can scroll without a nested body/panel trap
- 409 collision UI unchanged
- **UX Milestone 1 (in progress, uncommitted):** logged-out Account Drawer + Custom teaser + center Login modal layering on `/login`. Header/A1 and ProfileOverlay not wired. Waiting USER visual review. Do **not** start Milestone 2 or A5.
- **M1 microfix:** do not latch `authOpen` from pending-social. Anonymous `/login` starts drawer-open / modal-closed. Modal opens from CTA or confirmed pending-social only.

- **UX Milestone 1F (uncommitted):** Auth Choice composition only — taller scene (~432×448 desktop), title `시작해볼까요?`, supporting line, desktop side-by-side Login/Signup. **SUPERSEDED by M1I.** Choice view removed.

- **UX Milestone 1G (uncommitted):** Default Login form continues the M1F scene shell. Quiet rectangular fields, cream/dark Login CTA. **Directionally approved.** Title `로그인` removed in M1H.

- **UX Milestone 1H (uncommitted):** Minimal Login — centered wordmark, no Login heading, ID+password together, icon-only Google/Kakao/Naver with full aria-labels. Existing SVG marks optically slotted, not redrawn.

- **UX Milestone 1I (uncommitted):** Auth Choice removed. Drawer CTA opens default Login directly. Signup is a secondary outline CTA under Login. No back-to-choice. X returns to Drawer. Footer recovery only. Kakao/Naver marks optically enlarged in the existing 52px slot. **Login composition visually approved** except M1J typography.

- **UX Milestone 1J (uncommitted):** Login labels `아이디` / `비밀번호` 12→14px; compact `또는` 11→13px. Login-only. No light-mode token fix. **Login visual APPROVED.**

- **UX Milestone 2A (uncommitted):** Progressive Disclosure password Signup. **USER APPROVED** the concept; M2B hardens it.

- **UX Milestone 2B (uncommitted):** Progressive Signup hardening + compression. Backdrop/ESC do not dismiss Login/Signup (X only). Name/ID/password progress automatically (Enter is a shortcut; Hangul IME respected). Password + confirmation reveal as one stage. Completed identity/password/phone compress to summaries with `수정`. Social alternatives only on initial Name. Login/Signup success uses inline CTA loading; standalone `확인 중` settle overlay is gated off Login/Signup (still used for recovery/social profile-settle). No backend change.

- **UX Milestone 2C-1 (uncommitted):** `수정` blanks the edited stage (identity / password / phone) instead of reopening valid values. Signup create username UI matches `^[A-Za-z0-9]{4,32}$`; helpers `영문/숫자 4자 이상` / `영문과 숫자만 입력해 주세요.` / `32자 이하로 입력해 주세요.` Login lookup not tightened. Stale username-check responses ignored via seq guard. No backend change. **USER VISUAL APPROVED.**

- **UX Milestone 2D (uncommitted):** First-time social pending onboarding uses the same progressive language as Password Signup: phone only → OTP after send → compressed verified phone + `수정` → agreements + `가입하기`. Inline `전송 중...` / `확인 중...` / `가입 중...`. Standalone `확인 중` settle overlay gated off pending-social. Backdrop does not dismiss. ESC and X still abandon/sign out the pending session. No username/password/ml UI. R2 collision unchanged. No backend change.

- **UX Milestone 2E (uncommitted):** Unified Recovery. Login `아이디/비밀번호를 모르겠어요` → phone → OTP purpose `recovery` → `/api/auth/recovery/resolve` classification. No ID-vs-password choice. Password-capable: customer ID + optional inline `비밀번호 재설정` pair. Social-only: no `ml` username, no reset, trusted `linked_providers` only. Mixed keeps password reset. Phone `수정` invalidates proof/session/result. Backdrop/ESC no dismiss; X closes. ESC on pending-social still sign-out. No backend change. Client uses `password_reset_allowed` / `recoverable_username` / `linked_providers` from resolve (capability flags are server-side).

- **UX Milestone 2F (uncommitted):** R2 collision customer UX only. After `phone_already_registered` + signOut cleanup: compact collision panel `이미 가입된 휴대폰 번호입니다.` / `새 계정으로 연결하지 않았습니다. 기존 계정으로 로그인해 주세요.` Primary `로그인` (clean M1J, empty ID/password). Secondary `아이디/비밀번호 찾기` (clean M2E Recovery). No social row, no merge, no account leak. Backdrop/ESC no dismiss. Pending-social ESC cancel unchanged. 409 mapper copy unchanged. No backend change.

- **H1-D (uncommitted):** Auth Light primary text token alignment only. Login/Signup/Social Pending/Recovery field labels, Collision headline, agreement names, and recovered ID label/value use shared `text-text-primary` / `var(--color-text-primary)`. Helpers, `또는`, placeholders, and supporting copy stay muted. No layout/size/behavior change.

- **S1 (uncommitted):** AccountDrawer no longer sets `document.documentElement.style.overflow`. Open lock is body `overflow: hidden` (original overflow/paddingRight restored), plus non-passive `wheel`/`touchmove` preventDefault so Home sticky Hero is not unpinned. Header html-overflow compensation left in place for A1 removal. No Drawer visual change. No LoginModal/Header/Hero edits.

Verification: `npm run verify:2f-c2-5`

---

## M2C-0 — NEW password username charset (A6)

Status: **COMPLETE**. A3 UI alignment **COMPLETE**. See `docs/decisions/NEW-2F_m2c-0-username-create.md`.

NEW creation: `^[A-Za-z0-9]{4,32}$`. Login lookup **not** tightened. Social `ml`+10 unchanged. Production not mutated. Historical C1-0a migration unchanged; additive `20260930193000_2f_m2c0_password_username_alnum.sql` holds the create-rule change.

Customer helpers:

- `영문/숫자 4자 이상`
- `영문과 숫자만 입력해 주세요.`
- `확인 중...` / `사용 가능` / `이미 사용 중인 아이디입니다.`

---

## Resume

1. **GPT REVIEW** of NEW 2 closure
2. Do **not** open NEW 3 / NEW 4 from this note
3. Do **not** delete remaining pending `custom:naver` Auth user if still present
4. Slice D / E leftover Profile/security work remains **DEFERRED OUT OF NEW 2**

Ownership: A0 (this closure overlay). Historical slices A6/A3/A1/A5 as recorded above.

Relevant files: this note; `src/components/LoginModal.tsx`; `src/components/auth/customerAuthRequests.ts`; `src/components/auth/SocialContinueRow.tsx`; `scripts/verify-2f-c2-5-auth-ux.ts`; `docs/decisions/NEW-2F_c1-google-kakao.md`; `docs/decisions/NEW-2F_auth-expansion.md`
