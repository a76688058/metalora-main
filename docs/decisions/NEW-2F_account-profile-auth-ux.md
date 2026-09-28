# NEW 2F — Account / Profile / Auth UX/UI

Status: **OPEN**

Date: 2026-09-28 (C1 STAGE OPEN)

Decision: NEW 2F is **OPEN**. Parent customer Account / Profile / Auth stage. Do **not** close NEW 2F. C1 is **OPEN**. Do **not** open C2 from this note.

Two concurrent workstreams:

1. **Customer Auth UX (B2a)** — Login / Signup / Recovery. **COMPLETE / USER APPROVED / A5 PASS / CHECKPOINTED.**
2. **Auth expansion remainder** — launch-required. Durable sub-contract: `docs/decisions/NEW-2F_auth-expansion.md`. **B1 COMPLETE. B2 CHECKPOINTED / COMPLETE. C1 OPEN** (`docs/decisions/NEW-2F_c1-google-kakao.md`). C2–E **NOT STARTED.**

This is **not** Admin CS renewal, Cart/Checkout redesign, Workshop reopening, deploy, or live payment. It does **not** open NEW 3. It does **not** create a new master launch stage outside v3. It does **not** implement C1-0.

---

## Status

| Item | Value |
|------|--------|
| NEW 2 | **IN PROGRESS** |
| NEW 2A–2E | **CLOSED** — preserved |
| NEW 2F | **OPEN** — do **not** close |
| Auth expansion | **OPEN** — `docs/decisions/NEW-2F_auth-expansion.md` |
| B1 | **COMPLETE** |
| B2 | **CHECKPOINTED / COMPLETE** |
| B2a | **COMPLETE / USER APPROVED / A5 PASS** |
| C1 | **OPEN** — `docs/decisions/NEW-2F_c1-google-kakao.md` |
| C2 / D / E | **NOT STARTED** |
| NEW 3–9 | **NOT OPENED** |
| Production | **UNCHANGED** |
| Next | **C1-0 A6** — HARD STOP FOR GPT REVIEW FIRST |

---

## Historical exclusion — SUPERSEDED

At stage open, this note listed SNS signup/login, password reset, account recovery, phone verification, and account linking as **OUT OF NEW 2F / OPTIONAL AUTH EXPANSION**.

**SUPERSEDED.** USER explicitly promoted those items to **LAUNCH-REQUIRED**. Current scope is this parent plus the auth-expansion sub-contract. Do not treat the old exclusion list as active.

---

## Pre-stage / audit evidence

A0 PRE-STAGE REPORT: OPEN READY YES (visual/account UX).
A0 AUTH EXPANSION PRE-AUDIT: COMPLETE.
A6 AUTH ARCHITECTURE AUDIT: COMPLETE.
A6 ARCHITECTURE CLARIFICATION: COMPLETE.
Architecture blockers for contract text: **NONE**.

Stage-open commit: `b5fca8198dc8fefa988b5c8a5d1a80f5a3370279`.

Source truth of the current customer journey (visual workstream):

- Logged out → Header User / Header Cart / PDP / Cart checkout → **LoginModal**
- Login and Signup share **one** `LoginModal`. No `/signup` route
- Session owner: **AuthContext**
- Authenticated Header User → **ProfileOverlay** (`내 정보`)
- Routed auth shells: `/login`, `/profile/complete`
- No customer `/account`, `/profile` index, `/inquiry`, `/cs`

---

## Visual / chrome scope (A3)

B2a Login / Signup / Recovery: **COMPLETE / USER APPROVED / A5 PASS.** Official Signup no longer uses browser `supabase.auth.signUp`. Password minimum is 8. Mode-exit stale-state clearing **PASS**.

Still remaining for later 2F slices (do **not** treat as B2 incomplete):

- ProfileOverlay customer visual language / `계정 및 보안` (Slice D / E)
- Profile edit / complete usable feedback beyond B2a
- Inquiry overlay coherence
- OrdersModal chrome MAY
- Responsive / a11y leftover on non-B2a surfaces

Preserve NEW 2B / NEW 2E / Admin / Home / PDP frozen boundaries for **visual** work. Do **not** reopen Workshop internals or Cart/Checkout UX.

Checkout/profile **contact** `phone_number` remains unverified shipping data. Verified recovery phone is `verified_phone_fingerprint` + `phone_verified_at`. Visual 2F must not auto-promote shipping phone to verified.

B2a approved UX remains uncommitted until the B2 checkpoint. Do **not** revert that WIP from docs tickets.

---

## Auth expansion (launch-required)

Full lock: `docs/decisions/NEW-2F_auth-expansion.md`.

Required in summary: username/password + signup + logout; ID recovery; password reset; password change/set; verified phone OTP; Google / Kakao / Naver; internal auto-username for social-first; duplicate prevention; controlled linking; OTP phone change; withdrawal; marketing consent; membership consent ledger; re-consent support; abuse protection; `계정 및 보안`.

Out for launch: Apple; MFA; new-device notifications; all-device session UI; permanent CAPTCHA; `/account` route; recovery email; consumer SNS connect/disconnect screen.

---

## UX principle — LOCKED

Toss-like textual clarity. Uniquely METALORA visual/interaction language.

**“Idle에서는 정제되어 있고, 사용자가 만지면 재료가 살아난다.”**

Details in the auth-expansion sub-contract.

---

## Ownership / write sets

### Visual / chrome (preserved dirty A3 — not C1)

B2a Login / Signup / Recovery is **CHECKPOINTED**. The remaining dirty A3 set is Profile/Inquiry/Orders/ProfileComplete. C1 must **not** touch these files.

**C1 A3 writes (after STAGE OPEN):** `LoginModal.tsx`, `Login.tsx` only.
**A0 only:** `AuthCallback.tsx` (no A3 co-write).

Do **not** blend preserved dirty Profile files into C1.

### Auth expansion slices

A6 / A3 / A0 per `NEW-2F_auth-expansion.md`. App.tsx, AuthContext, `authIntegrity`, `server.ts`, DB migrations, and provider config are **in expansion slices**, not in visual-chrome default writes.

A1: **NONE** by default. A5: targeted QA after each visible slice.

---

## Slices (auth expansion)

0b Production read-only inventory (**NOT DONE**; not a B2 blocker) → A payment-test OTP foundation (**COMPLETE**) → B recovery+password (**B1 COMPLETE**; **B2 CHECKPOINTED / COMPLETE**) → C1 Google+Kakao (**OPEN**) → C2 Naver (**NOT STARTED**) → D account security/withdrawal/consent (**NOT STARTED**) → E final Profile UX (**NOT STARTED**).

Production unique verified-phone and production providers are **gated**. Payment-test (`bvihpoorwriejybixmoc`) first. Production (`qifloweuwyhvukabgnoa`) never mixed. Hosted Before User Created is **LIVE** on payment-test only.

---

## Definition of Done

Visual/account UX USER approval **and** the auth-expansion DoD in `NEW-2F_auth-expansion.md` (verified phone, recovery, password reset/change, Google, Kakao, Naver, duplicate prevention, pending-social lifecycle, withdrawal, marketing consent, membership consent history, gates, anti-enumeration, no shipping/verified-phone conflation, A5 PASS).

NEW 2F **cannot close** on visual chrome alone.

Production rollout remains separately gated by NEW 6/7 and later explicit provider/migration authorization.

---

## Boundaries still frozen

- NEW 2B CLOSED — Workshop internals
- NEW 2E CLOSED — Cart/Checkout/Payment **UX**; verified-phone write-path authority is expansion Slice A, not a 2E reopen
- Admin CS — NEW 3
- Legal substance / retention clocks / re-registration wait / marketing wording / SMS sender — NEW 4
- Live Toss / deploy — not this stage

---

## Do Not Do

- Close NEW 2F from this amendment
- Open C2 or NEW 3
- Implement application source, mutate DB, enable production providers, edit env, or deploy from this docs ticket
- Stage or revert preserved dirty A3 Profile/Inquiry/Orders files
- Treat old OPTIONAL AUTH EXPANSION exclusions as current
- Invent `/account`, Apple, MFA, recovery email, or consumer SNS disconnect UI as launch scope
- Co-write `AuthCallback.tsx` (A0 only)

---

## Resume

1. Preserve dirty non-B2 A3 Profile/Inquiry/Orders WIP. Do not revert it from docs tickets
2. GPT review of C1 STAGE OPEN
3. **C1-0 A6** — do not start from this parent note
4. Slice 0b remains required before production unique-phone enforcement
5. USER visual approval for C1-2 and leftover D/E surfaces
6. A5 targeted QA per remaining slice
7. A0 closure of NEW 2F (separate later ticket; not now)

---

## Relevant Files

- `docs/decisions/NEW-2F_account-profile-auth-ux.md` (this parent)
- `docs/decisions/NEW-2F_auth-expansion.md` (auth-expansion sub-contract)
- `docs/decisions/NEW-2F_c1-google-kakao.md` (C1 OPEN)
- `docs/decisions/NEW-2F_b2b-hook-contract.md` (payment-test hosted hook — LIVE)
- `docs/METALORA_PROJECT_STATE.md`
- `docs/decisions/NEW-1_launch-pipeline-v3.md` (pipeline family SoT; live 2F overlay synced 2026-09-28)
