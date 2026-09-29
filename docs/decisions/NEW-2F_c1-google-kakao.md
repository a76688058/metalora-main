# NEW 2F C1 — Google + Kakao social auth

Status: **OPEN**

Date: 2026-09-28 (STAGE OPEN); status updated 2026-09-29 (functional checkpoint — USER FINAL visual DEFERRED)

Decision: USER approved the amended C1 contract. C1 is **OPEN**. Closure is **NOT** authorized. USER FINAL AUTH UX VISUAL APPROVAL is **DEFERRED**. Production OAuth remains OUT. Naver remains C2. Apple is OUT.

Parent: `docs/decisions/NEW-2F_account-profile-auth-ux.md`. Expansion: `docs/decisions/NEW-2F_auth-expansion.md`.

---

## Status

| Item | Value |
|------|--------|
| NEW 2F | **OPEN** — do **not** close |
| C1 | **OPEN** — closure **NOT** authorized |
| C1-0A | **PASS** |
| C1-0B | **PASS** — payment-test Google/Kakao providers + live OAuth |
| C1-1 | **PASS** |
| C1-2 | **PASS** — functional implementation (USER FINAL visual DEFERRED) |
| C1-3 | **PASS** — functional matrix |
| C1-4 | **PASS** — A5 READ ONLY integrated QA (functional + security) |
| USER FINAL AUTH UX VISUAL APPROVAL | **DEFERRED** |
| FUNCTIONAL CHECKPOINT ELIGIBLE | **YES** |
| B2 | **CHECKPOINTED / COMPLETE** at `3586ec732a7556226a23519553165cdafb8dd4b4` |
| Contract | **LOCKED** — R2 + Hosted auto-link invariant |
| R1 silent identity transfer | **REMOVED** |
| R1-REAUTH / manual linking | **OUT OF C1** |
| Production | **UNCHANGED** |
| Next | USER FINAL AUTH UX VISUAL APPROVAL remains **DEFERRED**. Do **not** close C1. Do **not** start C2. |

---

## Feasibility invariants (A6)

These are accepted Hosted Supabase facts for C1:

1. Hosted Supabase automatically links Google/Kakao identities when they share the same **verified** email in the default linking domain.
2. This cannot be disabled through supported Hosted Supabase configuration.
3. Before User Created does **not** intercept LinkAccount.
4. There is no supported Admin API to move an existing OAuth identity from pending user A to canonical user B.
5. `linkIdentity()` requires an already authenticated canonical user and a new OAuth round trip.
6. METALORA custom phone OTP cannot legitimately mint a canonical Supabase user session.

---

## Two-layer email / identity rule — LOCKED

### AUTH LAYER

Hosted Supabase **may** automatically link Google/Kakao identities that share the same **verified** provider email **before** METALORA callback/onboarding logic runs.

This is an **ACCEPTED C1 Auth-layer invariant**. Do not undo or rebuild that identity link in C1.

### METALORA APPLICATION LAYER

METALORA itself must **NEVER**:

- merge users by email
- skip phone verification for a newly created pending social user because emails match
- use email as payment/member authority
- use email as recovery ownership proof

For **app-controlled** reconciliation, verified phone remains authoritative:

- `verified_phone_fingerprint`
- `phone_verified_at`

`profiles.phone_number` remains contact/shipping only.

Do **not** write “provider email is hint only and can never merge users.” That is false at the Auth layer and too weak at the application layer.

---

## Auto-linked social case — LOCKED

Existing usable social member + new Google/Kakao OAuth identity + same verified provider email:

- Supabase may attach the new identity to the existing `auth.users` row
- callback receives the existing canonical user’s session
- do **not** create a second pending user
- do **not** attempt to undo/rebuild the identity link in C1

Canonical member usability still depends on that member’s existing verified-phone gate. Auto-link does **not** skip `isUsableMemberProfile` / `verifyPaymentMember`.

---

## Password accounts and Hosted auto-link

Password accounts use `{username}@metalora.me`. Google/Kakao mailbox email normally does **not** match that Auth email, so Supabase auto-link does **not** merge them by email.

---

## Application phone reconciliation — R2 — LOCKED

**R1 silent identity transfer: REMOVED.**
**R1-REAUTH / customer-facing provider linking: OUT OF C1.**

When a **pending** social user verifies a phone already owned by another canonical member:

- **DO NOT** activate the pending account
- **DO NOT** merge
- **DO NOT** attach the provider to the existing member
- **DO NOT** mint or switch a canonical session
- **DO NOT** expose the existing username

Fail closed. Direct the customer to the original login method.

Customer-safe outcome: `이미 가입된 번호입니다. 기존 로그인으로 이용해 주세요.` Exact copy is A3 implementation detail.

Pending OAuth user must be signed out and safely retired/cleaned where supported.

Same rule for:

- pending social + phone owned by a **password** member
- pending social + phone owned by a **different social** member (auto-link did not occur)

Same provider subject returning to **its own** pending user still **resumes** onboarding.

---

## Duplicate matrix — LOCKED

| | Case | Outcome |
|--|------|---------|
| A | New social + unowned phone | Activate social-first user |
| B | Pending social + phone owned by password member | **R2** reject / original login |
| C | Pending social + phone owned by different social member | **R2** reject / original login |
| D | Same provider subject | Resume same Auth user |
| E | Google/Kakao same **verified** email | Supabase **may auto-link BEFORE** app phone reconciliation → accept platform-linked canonical user |
| F | Same email but no Supabase auto-link / unverified email | Email alone causes **NO METALORA merge** |
| G | Different emails + same verified phone | **R2** collision reject; phone prevents a second usable account |

Never implement METALORA email-based merging.

---

## Capability model — LOCKED

Explicit flags. Do **not** infer from `ml…` prefix.

- `profiles.password_login_enabled boolean NOT NULL DEFAULT false`
- `profiles.social_login_enabled boolean NOT NULL DEFAULT false`

Existing social member that gains another provider through Supabase auto-link: `social_login_enabled` remains **true**. Do **not** require one boolean per provider in C1. Provider list is derived from `auth.identities`.

Password + later Hosted auto-link of a matching verified email onto that same Auth user is not the normal password path (`{username}@metalora.me`). Do not invent extra flags for it.

---

## Social-first activation — LOCKED

Pending OAuth user remains unusable until **all** of:

1. required consents: **terms + privacy + cookie** (same class as B2 password Signup)
2. verified-phone OTP
3. no conflicting active phone owner (R2)

Then:

- generate internal `ml` username (not customer-facing)
- set `verified_phone_fingerprint`
- set `phone_verified_at`
- `social_login_enabled = true`
- `password_login_enabled = false`

Only then can usable-member / payment gates pass.

Do **not** create `{ml}@metalora.me` as an Auth email identity for social-first users. Do **not** add social-first “set password” in C1. Marketing consent remains OUT until D.

---

## Recovery — LOCKED

Keep B2 recovery architecture. Do not use email to infer providers.

- **Social-only:** never expose `ml` username; no password reset; after verified-phone recovery proof, provider return path may show linked providers from `auth.identities`
- **Linked** (`password_login_enabled`): password path remains available; linked providers may also be shown
- Before OTP: no enumeration

---

## Hook / payment / member gate

Keep payment-test Before User Created as LIVE. Do not disable. Do not reopen public email signup.

Preserve `isUsableMemberProfile` and `verifyPaymentMember`. OAuth alone never grants payment. Auto-link to an existing usable member still requires that member already satisfy the verified-phone gate.

---

## Ownership — LOCKED

| Agent | Owns |
|------|------|
| **A0 ONLY** | `src/pages/AuthCallback.tsx`; AuthContext / session / pending-social routing; shared `authIntegrity` if needed |
| **A3** | `LoginModal.tsx`; `Login.tsx`; Google/Kakao buttons; phone/consent onboarding UX; recovery provider-return UX |
| **A6** | schema; capability flags; trusted social activation / R2 APIs; pending cleanup; payment-test provider configuration; verification |
| **A5** | READ ONLY QA |

A3 does **not** co-write `AuthCallback.tsx`. Never A0/A3 on that file in the same ticket. Max 2 concurrent writers. Never the same file.

Do **not** touch preserved dirty WIP:

- `src/components/InquiryModal.tsx`
- `src/components/OrdersModal.tsx`
- `src/components/ProfileEditModal.tsx`
- `src/components/ProfileOverlay.tsx`
- `src/pages/ProfileComplete.tsx`

---

## Implementation slices — LOCKED

Authorized historical order (slices C1-0 → C1-4 are complete for functional/security QA). USER FINAL AUTH UX VISUAL APPROVAL remains **DEFERRED**. C1 stays **OPEN**.

1. **C1-0 A6** — schema/capability + activation/R2 backend contract + payment-test provider config
2. **C1-1 A0** — AuthCallback / AuthContext pending-vs-usable routing
3. **C1-2 A3** — Google/Kakao UI + social onboarding + recovery provider-return UX → **USER VISUAL APPROVAL**
4. **C1-3 A6/A3** — payment-test matrix verification
5. **C1-4 A5** — final READ ONLY QA

No C2 / D / E. No production. No deploy.

Naver button must **not** appear. Consumer connect/disconnect UI is OUT.

---

## Out of C1

Naver implementation; Apple; R1 identity transfer; R1-REAUTH / `linkIdentity` customer linking; social-first password set; MFA; connect/disconnect settings; withdrawal; marketing consent; Profile D/E; production OAuth; deploy.

---

## Do Not Do

- Close C1 without USER FINAL AUTH UX VISUAL APPROVAL
- Start C2 / D / E
- Merge users in METALORA by email
- Skip phone verification because emails match
- Undo Hosted verified-email auto-link
- Expose `ml…` as customer identity
- Co-write `AuthCallback.tsx`
- Touch production OAuth
- Commit / push / deploy from a hygiene ticket

---

## Resume

1. USER FINAL AUTH UX VISUAL APPROVAL remains **DEFERRED** (dedicated polish if opened)
2. Do **not** close C1. Do **not** start C2.

Ownership: A0 (this contract). A6 RED implementation from C1-0. A3 UX from C1-2. A5 READ ONLY QA.

Relevant files: this note; `docs/decisions/NEW-2F_auth-expansion.md`; `docs/decisions/NEW-2F_account-profile-auth-ux.md`; `docs/METALORA_PROJECT_STATE.md`
