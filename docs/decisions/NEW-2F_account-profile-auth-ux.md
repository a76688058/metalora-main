# NEW 2F — Account / Profile / Auth UX/UI

Status: **CLOSED**

Date: 2026-09-28 (C1 STAGE OPEN); C2 OPEN 2026-09-29; closed 2026-10-01 with NEW 2

Decision: NEW 2F is **CLOSED**. Customer Auth UX family (Login / Signup / Social / Recovery / Collision / Header / Drawer / username) is complete on payment-test. C1 and C2 are **CLOSED**. A5 integrated NEW2 QA **ALL PASS**. Production unchanged. No deploy.

Prior “NEW 2F OPEN / do not close / C1–C2 OPEN” headlines are **SUPERSEDED**. Historical slice evidence remains below.

Auth expansion leftovers Slice D (account security / withdrawal / consent) and Slice E (leftover Profile chrome) are **DEFERRED OUT OF NEW 2**. They do **not** keep NEW 2F open. Slice 0b production inventory remains **NOT DONE** and still gates production unique-phone — not a NEW 2 blocker.

This is **not** Admin CS renewal, Cart/Checkout redesign, Workshop reopening, deploy, or live payment. It does **not** open NEW 3.

---

## Status

| Item | Value |
|------|--------|
| NEW 2 | **CLOSED** / ALL PASS |
| NEW 2A–2E | **CLOSED** — preserved |
| NEW 2F | **CLOSED** |
| Auth expansion customer Auth (B–C2) | **CLOSED** |
| B1 | **COMPLETE** |
| B2 | **CHECKPOINTED / COMPLETE** |
| B2a | **COMPLETE / USER APPROVED / A5 PASS** |
| C1 | **CLOSED** — `docs/decisions/NEW-2F_c1-google-kakao.md` |
| C2 | **CLOSED** — `docs/decisions/NEW-2F_c2-naver.md` |
| D / E | **DEFERRED OUT OF NEW 2** |
| NEW 3 | **NOT OPENED** |
| NEW 4 | **NOT OPENED** |
| NEW 5 | **BLOCKED BY NEW 3 + NEW 4** |
| NEW 6–9 | **NOT OPENED** |
| Production | **UNCHANGED** |
| Next | **GPT REVIEW**. Do **not** open NEW 3/4 from this note. |

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

0b Production read-only inventory (**NOT DONE**; not a NEW 2 blocker) → A payment-test OTP foundation (**COMPLETE**) → B recovery+password (**B1 COMPLETE**; **B2 CHECKPOINTED / COMPLETE**) → C1 Google+Kakao (**CLOSED**) → C2 Naver (**CLOSED**) → D account security/withdrawal/consent (**DEFERRED OUT OF NEW 2**) → E leftover Profile UX (**DEFERRED OUT OF NEW 2**).

Production unique verified-phone and production providers are **gated**. Payment-test (`bvihpoorwriejybixmoc`) first. Production (`qifloweuwyhvukabgnoa`) never mixed. Hosted Before User Created is **LIVE** on payment-test only.

---

## Definition of Done — NEW 2 CLOSED

NEW 2F customer Auth UX is **CLOSED** on:

- Login / password Signup / Google / Kakao / Naver / Recovery / Collision customer contracts below
- functional/security PASS
- A5 integrated NEW2 QA ALL PASS
- USER visual approval of inspected core states

Not claimed as live visual-tested: first-time Social Pending final live screens; Recovery post-proof live screens; R2 Collision live screens; live 390px device screenshot pass; live Hero tunnel numeric scrollY/height pass during A5.

Slice D/E leftover Profile/security work is **DEFERRED OUT OF NEW 2**. Production unique-phone Slice 0b remains separately gated. Production rollout remains gated by NEW 6/7 and later explicit provider/migration authorization.

---

## Final Auth customer UX contract

### Login
Drawer CTA → Login directly; no Auth Choice; ID + password together; Signup secondary CTA; icon-only Google/Kakao/Naver; unified Recovery entry; no backdrop/ESC dismiss; X explicit close; inline loading; no generic processing modal.

### Password Signup
Progressive disclosure; progressive compression; Name → Username → Password pair → Phone → OTP → Agreements; completed-stage `수정` resets that stage to blank; new username creation = alphanumeric 4–32 only; legacy Login remains compatible with punctuation usernames; OTP/proof invalidation correct; no standalone processing modal.

### Social Pending
Phone → OTP → Agreements → activation; no customer username UI; internal `ml` username never exposed; Google/Kakao/Naver mapping unchanged; R2 remains fail-closed.

### Recovery
Verified phone is primary recovery; no recovery email; unified ID/password recovery; trusted resolve only after proof; social-only accounts never expose internal `ml` ID; password reset only where trusted capability allows.

### Collision
No merge/link/identity transfer; Login primary; Recovery secondary; no account/provider leak.

---

## USER visual approvals (inspected)

Login final visual; Password Signup Progressive Disclosure; Progressive Compression; Signup 수정/reset; username alphanumeric UX; Light primary Auth typography; Home Header interaction; Light Header white surface; Dark Header true black surface; Hero-vs-content Header behavior; AccountDrawer/Home Hero regression fix.

Do **not** overstate visual approval for unrendered live Social/Recovery/R2 final states.

---

## Accepted color residual

Some approved Auth/Drawer surfaces use near-black `#16150f` while shared Light primary is `#0a0a0a`. **ACCEPTED / NON-BLOCKING.** Do not reopen design.

---

## Boundaries still frozen

- NEW 2B CLOSED — Workshop internals
- NEW 2E CLOSED — Cart/Checkout/Payment **UX**; verified-phone write-path authority is expansion Slice A, not a 2E reopen
- Admin CS — NEW 3
- Legal substance / retention clocks / re-registration wait / marketing wording / SMS sender — NEW 4
- Live Toss / deploy — not this stage

---

## Do Not Do

- Reopen NEW 2F / C1 / C2 implementation from this note
- Open NEW 3 from this note
- Implement application source, mutate DB, enable production providers, edit env, or deploy from this docs ticket
- Stage or revert preserved dirty A3 Profile/Inquiry/Orders files
- Treat old OPTIONAL AUTH EXPANSION exclusions as current
- Invent `/account`, Apple, MFA, recovery email, or consumer SNS disconnect UI as launch scope
- Co-write `AuthCallback.tsx` (A0 only)

---

## Resume

1. Preserve dirty non-B2 A3 Profile/Inquiry/Orders WIP. Do not revert it from docs tickets
2. **GPT REVIEW** of NEW 2 closure
3. Do **not** open NEW 3 / NEW 4 from this parent note
4. Slice 0b remains required before production unique-phone enforcement
5. Slice D / E remain deferred out of NEW 2

---

## Relevant Files

- `docs/decisions/NEW-2F_account-profile-auth-ux.md` (this parent)
- `docs/decisions/NEW-2F_auth-expansion.md` (auth-expansion sub-contract)
- `docs/decisions/NEW-2F_c1-google-kakao.md` (C1 CLOSED)
- `docs/decisions/NEW-2F_c2-naver.md` (C2 CLOSED)
- `docs/decisions/NEW-2F_h1h-home-header-hero-boundary.md`
- `docs/decisions/NEW-2F_m2c-0-username-create.md`
- `docs/decisions/NEW-2F_b2b-hook-contract.md` (payment-test hosted hook — LIVE)
- `docs/METALORA_PROJECT_STATE.md`
- `docs/decisions/NEW-1_launch-pipeline-v3.md`
