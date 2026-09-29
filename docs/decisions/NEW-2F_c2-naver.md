# NEW 2F C2 — Naver social auth

Status: **OPEN**

Date: 2026-09-29 (STAGE OPEN)

Decision: USER approved **C2 OPEN**. Naver social login/signup is **IMPLEMENT NOW** on payment-test. It is **not** deferred to a future Auth UX redesign. C1 remains **OPEN**. C1 USER FINAL AUTH UX VISUAL APPROVAL remains **DEFERRED** until one unified polish covering Google + Kakao + Naver.

Parent: `docs/decisions/NEW-2F_account-profile-auth-ux.md`. Expansion: `docs/decisions/NEW-2F_auth-expansion.md`. C1: `docs/decisions/NEW-2F_c1-google-kakao.md`.

This note is governance only. It does **not** implement Naver, configure Hosted providers, mutate production, or deploy.

---

## Status

| Item | Value |
|------|--------|
| NEW 2F | **OPEN** — do **not** close |
| C1 | **OPEN** — functional/security checkpoint COMPLETE; USER FINAL visual **DEFERRED** |
| C2 | **OPEN** |
| Naver | **IMPLEMENT NOW** |
| Apple | **OUT** |
| Production | **UNCHANGED** |
| Next | **C2-0 A6** — payment-test Naver Hosted/custom OAuth proof. HARD STOP FOR GPT REVIEW FIRST |

C1 durable HEAD at functional checkpoint: `7b874e3771a42c5b07352ac0e5de312a06e92f6a`.

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

## Security allowlist — LOCKED

The Before User Created hook currently rejects email / empty / anonymous and allows other provider strings. C2 must **not** extend that into “anything non-email is trusted.”

After C2-0 proves the exact Naver provider string, trusted social creation must be explicitly constrained to:

- `google`
- `kakao`
- the **proven** Naver provider identifier

Do **not** blindly use `custom:*`. Do **not** allow arbitrary custom providers. Exact hardening is A6 after C2-0 proof.

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
| A | New Naver + unowned phone | **REAL REQUIRED** |
| B | Same Naver subject returning | **REAL REQUIRED** |
| C | Naver pending + password-member phone | **FIXTURE** unless real is cheap |
| D | Naver pending + existing Google/Kakao verified phone | **REAL REQUIRED** |
| E | Naver social recovery after activation | **REAL REQUIRED** |
| F | Same verified-email Hosted auto-link | **NOT NATURALLY EXERCISED** unless live condition exists |
| G | Missing/unverified email | **REAL** if observed in C2-0, else fixture + not naturally exercised |

Do not manufacture unnecessary live identities.

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

- Implement Naver from this governance note
- Configure Hosted Naver / custom OAuth from this note
- Encode `custom:naver` as proven identity
- Trust `custom:*` or arbitrary custom providers
- Close C1
- Start D / E / C2-3 UI before C2-0 proof
- Touch production
- Deploy

---

## Resume

1. GPT review of this C2 OPEN checkpoint
2. **C2-0 A6** — payment-test Naver Hosted/custom OAuth proof (exact `auth.identities[].provider`, PKCE, userinfo/email)
3. Then C2-1 → C2-6 on payment-test

Ownership: A0 (this contract). A6 RED from C2-0.

Relevant files: this note; `docs/decisions/NEW-2F_c1-google-kakao.md`; `docs/decisions/NEW-2F_auth-expansion.md`; `docs/decisions/NEW-2F_account-profile-auth-ux.md`; `docs/METALORA_PROJECT_STATE.md`
