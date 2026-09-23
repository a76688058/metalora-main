# NEW 2F — Account / Profile / Auth UX/UI

Status: **OPEN**

Date: 2026-09-23 (amended)

Decision: NEW 2F is **OPEN**. Parent customer Account / Profile / Auth stage.

Two concurrent workstreams:

1. **Visual / chrome UX** — A3. Currently **UNCOMMITTED**. USER visual review is **not** complete.
2. **Auth expansion** — launch-required. Durable sub-contract: `docs/decisions/NEW-2F_auth-expansion.md`. **A6 RED** required. Sliced implementation.

This is **not** optional auth expansion, Admin CS renewal, Cart/Checkout redesign, Workshop reopening, deploy, or live payment. It does **not** open NEW 3. It does **not** create a new master launch stage outside v3.

---

## Status

| Item | Value |
|------|--------|
| NEW 2 | **IN PROGRESS** |
| NEW 2A–2E | **CLOSED** — preserved |
| NEW 2F | **OPEN** |
| Auth expansion | **OPEN** — `docs/decisions/NEW-2F_auth-expansion.md` |
| NEW 3–9 | **NOT OPENED** |
| Visual/chrome | **UNCOMMITTED**; USER visual approval **pending** |
| A6 RED | **REQUIRED** for auth expansion |
| Implementation | **SLICED** (not one giant write) |
| Next RED action | **A6 — SLICE 0b** if production read-only SQL is available; else **A6 — SLICE A PAYMENT-TEST FOUNDATION PLAN** |

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

Still required:

- Header LoginModal and `/login` shell coherence
- Signup hierarchy, validation, required-consent **copy** (including the `전체 동의 (선택)` vs required items defect)
- ProfileOverlay customer visual language (remove legacy purple/neon membership chrome)
- Profile edit / complete usable feedback
- Inquiry overlay coherence
- OrdersModal chrome MAY
- Responsive ~390 / ~1440, light/dark, a11y/keyboard baseline
- Profile hub IA including future **계정 및 보안** (do **not** invent `/account`)

Preserve NEW 2B / NEW 2E / Admin / Home / PDP frozen boundaries for **visual** work. Do **not** reopen Workshop internals or Cart/Checkout UX.

Checkout/profile **contact** `phone_number` remains unverified shipping data. Auth expansion owns **verified** recovery phone separately. Visual 2F must not auto-promote shipping phone to verified.

Current uncommitted Login refinements (do **not** implement from governance tickets): remove `로그인` heading and explanatory subtitle; logo-only top; simplify signup copy; directional metallic/specular instead of round white glow; stronger localized chromatic edge; aluminum/panel character.

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

### Visual / chrome (current uncommitted A3)

**MUST:** `LoginModal.tsx`, `Login.tsx`, `ProfileOverlay.tsx`, `ProfileEditModal.tsx`, `ProfileComplete.tsx`, `InquiryModal.tsx`
**MAY:** `OrdersModal.tsx` (chrome only)

Do **not** blend these dirty files into A6 backend slices. Do **not** commit them from A0/A6 tickets.

### Auth expansion slices

A6 / A3 / A0 per `NEW-2F_auth-expansion.md`. App.tsx, AuthContext, `authIntegrity`, `server.ts`, DB migrations, and provider config are **in expansion slices**, not in visual-chrome default writes.

A1: **NONE** by default. A5: targeted QA after each visible slice.

---

## Slices (auth expansion)

0b Production read-only inventory → A payment-test OTP foundation → B recovery+password → C1 Google+Kakao (payment-test) → C2 Naver separate → D account security/withdrawal/consent → E final Login/Profile UX.

Production unique verified-phone and production providers are **gated**. Payment-test (`bvihpoorwriejybixmoc`) first. Production (`qifloweuwyhvukabgnoa`) never mixed.

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
- Open NEW 3
- Implement application source, mutate DB, enable providers, edit env, or deploy from this docs ticket
- Stage or revert A3 uncommitted visual files
- Treat old OPTIONAL AUTH EXPANSION exclusions as current
- Invent `/account`, Apple, MFA, recovery email, or consumer SNS disconnect UI as launch scope

---

## Resume

1. Preserve uncommitted A3 visual work
2. **A6 — SLICE 0b** (production read-only inventory) if SQL available; otherwise **A6 — SLICE A PAYMENT-TEST FOUNDATION PLAN** without production unique-phone enforcement
3. Continue slices B–E per sub-contract
4. USER visual approval (visual + auth UX)
5. A5 targeted QA
6. A0 closure (separate ticket)

---

## Relevant Files

- `docs/decisions/NEW-2F_account-profile-auth-ux.md` (this parent)
- `docs/decisions/NEW-2F_auth-expansion.md` (auth-expansion sub-contract)
- `docs/METALORA_PROJECT_STATE.md`
- `docs/decisions/NEW-1_launch-pipeline-v3.md` (pipeline family SoT; not rewritten here)
