# NEW 2F — Account / Profile / Auth UX/UI

Status: **OPEN**

Date: 2026-09-23

Decision: NEW 2F is **OPEN**. This is Account / Profile / Auth **customer UX/UI**. It is **not** optional auth expansion, Admin CS renewal, Cart/Checkout redesign, Workshop reopening, backend/auth-authority refactor, deploy, or live payment.

This note does **not** authorize application source writes in the stage-open ticket. Implementation begins only on **A3 — NEW 2F IMPLEMENTATION**. It does **not** open NEW 3.

---

## Status

| Item | Value |
|------|--------|
| NEW 2 | **IN PROGRESS** |
| NEW 2A–2E | **CLOSED** — preserved |
| NEW 2F | **OPEN** |
| NEW 3–9 | **NOT OPENED** |
| Implementation shape | **SINGLE SLICE** |
| Primary owner | **A3** |
| Secondary writers | **NONE** |
| Max concurrent writers | **1** |
| A1 / A0 during implementation | **NONE** |
| Backend / DB / A6 / deploy | **NONE** |
| Visual approval | **pending** |
| A5 targeted QA | **pending** (after USER visual approval) |
| Next action | **A3 — NEW 2F IMPLEMENTATION** |

---

## Pre-stage evidence

A0 PRE-STAGE REPORT: **OPEN READY YES**. Minimum blockers: **NONE**.

Baseline at report: `f1b4cf49cf0536236f2a3dbc4e9d4e7d494593af` (`docs(project): activate MASTER PIPELINE v3`). Worktree was CLEAN.

Source truth (do not assume a different journey):

- Logged out → Header User / Header Cart / PDP / Cart checkout → **LoginModal**
- Login and Signup share **one** `LoginModal` (mode toggle). No `/signup` route
- Session owner: **AuthContext**
- Authenticated Header User → **ProfileOverlay** (`내 정보`)
- Profile actions: Custom (`openWorkshop`), 프로필 수정, 주문 내역, 1:1 문의, admin if applicable, logout
- Routed auth shells (Header/Footer hidden): `/login`, `/profile/complete`
- Unauthenticated ProtectedRoute → `/login?redirect=`
- No customer `/account`, `/profile` index, `/inquiry`, `/cs`

LoginModal vs `/login`: **PARTIAL** (shared form; `/login` wrapper hardcoded `#040D12`). Design authority: LoginModal form + NEW 2C overlay tokens. ProfileOverlay vs 2C: **DIVERGENT** (legacy purple/neon). 22J residual still present: login overlay does not close on Escape.

---

## Scope

### Login

Header LoginModal and `/login`. Overlay vs routed-shell visual consistency. Loading/error. Keyboard / Escape. Mobile / desktop. Visible labels / accessibility baseline.

Preserve auth authority: username RPC `profiles_username_exists`; `memberAuthEmail` / virtual username email; `signInWithPassword`; usable-member-profile gate; existing continuation. **Do not refactor auth authority.**

### Signup

Fields: `full_name`, `phone_number`, `username`, `password`. Validation, duplicate username, Login ↔ Signup transition, consent presentation, submit/loading/error, responsive, accessibility.

Explicit defect: visible copy `전체 동의 (선택)` while all three consent items are required. Make visible copy consistent with required behavior. **Do not change legal substance or consent storage semantics.**

### ProfileOverlay

Approved customer visual language. Remove legacy purple/neon membership-shell divergence. Account-action hierarchy. Semantic interactive controls. Accessible close. Escape. Responsive sheet. Light/dark parity.

Existing actions remain: Custom, profile edit, orders, inquiry, admin if applicable, logout. **Do not invent new account features.**

### Profile edit / complete

`ProfileEditModal` and `ProfileComplete`. Coherent theme/shell; usable mobile/desktop form; visible save/loading; visible success/failure; no silent failure; sensible back/close; accessibility baseline.

Preserve current profile data contract. **Do not change checkout/profile schema integration.**

### Account meaning

Organize and visually align **existing** account actions. Source has no `/account`, `/profile` index, or address-book product. **Do not invent those.** Order history remains `OrdersModal`.

### Inquiry / CS

Customer-facing `InquiryModal`: list, compose, empty, loading, visible error, retry/recovery where appropriate, back, responsive, theme consistency.

Admin CS remains **NEW 3**. **Do not edit AdminCS.**

---

## Boundaries

**Custom:** Profile-side Custom entry may be visually aligned. Do **not** reopen Workshop, image editor, preview, size/orientation, storage, price, Cart handoff. NEW 2B remains **CLOSED**.

**Cart / Checkout:** NEW 2E remains **CLOSED**. Do **not** modify Cart, CartContext, PaymentSuccess, PaymentFail, payment API. LoginModal integration may be consumed as-is. Genuine 2E regression: **STOP** and report separately.

**Out of NEW 2F (OPTIONAL AUTH EXPANSION):** SNS signup/login; password reset; account recovery; phone verification; account linking. Do not create them.

---

## Responsive / a11y / theme

Verify later at ~390 mobile and ~1440 desktop. Intermediate layout must remain structurally safe.

Address: Profile-family sheet-width inconsistency; routed auth shell theme mismatch; full-height overlay/form usability; close/back reachability; scrolling; keyboard form usability where practical **without** a new `visualViewport` framework unless source evidence proves it necessary.

2F surfaces only: visible or programmatic form labels; semantic buttons for Profile rows; accessible close/back; Escape for overlays; focus-visible baseline; Enter submit; sensible focus order; modal semantics where appropriate. No site-wide a11y expansion.

Align LoginModal, `/login`, Signup/consent, ProfileOverlay, ProfileEdit, ProfileComplete, Inquiry, and Orders if touched with approved customer shell/component language. Do not redesign frozen Home/PDP.

---

## Ownership / write set

Primary: **A3**. Single writer.

**MUST**

- `src/components/LoginModal.tsx`
- `src/pages/Login.tsx`
- `src/components/ProfileOverlay.tsx`
- `src/components/ProfileEditModal.tsx`
- `src/pages/ProfileComplete.tsx`
- `src/components/InquiryModal.tsx`

**MAY**

- `src/components/OrdersModal.tsx` — account/profile sheet-family chrome only. Do not alter order-domain behavior.

No other files without STOP + re-authorization.

**DO NOT TOUCH (default implementation)**

`src/App.tsx`; `src/context/AuthContext.tsx`; `src/context/ShellOverlayContext.tsx`; `src/components/Header.tsx`; `src/components/ui/*`; `src/styles/tokens.css`; `src/styles/foundation.css`; `src/index.css`; `src/lib/authIntegrity.ts`; `src/lib/memberUsername.ts`; `src/lib/supabase.ts`; `server.ts`; Cart / payment files; Home / PDP / ProductCard / ProductGrid; Workshop internals; Admin pages; package / lockfile; deploy files; DB schema/migrations.

---

## Definition of Done

1. LoginModal and `/login` are visually/interactionally coherent.
2. Login loading/error/submit/Enter behavior is clear.
3. Signup hierarchy, validation, required-consent copy, and Login↔Signup transition are coherent.
4. ProfileOverlay uses approved customer visual language rather than legacy purple/neon membership chrome.
5. Profile Edit and ProfileComplete are responsive and provide visible success/failure feedback.
6. Existing account actions have clear hierarchy.
7. Inquiry list/compose/back/empty/loading/error UX is coherent.
8. Required loading/empty/error states are adequate.
9. Mobile ~390 and desktop ~1440 are USER visually approved.
10. Light/dark parity is acceptable.
11. Accessibility/focus/keyboard baseline passes.
12. Auth/session authority and behavior remain unchanged.
13. Optional auth expansion is not introduced.
14. NEW 2B / NEW 2E / Admin boundaries remain intact.
15. USER VISUAL APPROVAL **PASS**.
16. A5 TARGETED QA **PASS**.

---

## Visual approval plan

**Desktop:** Header LoginModal light/dark; `/login` light/dark; Signup + consent; ProfileOverlay; Profile Edit; ProfileComplete if reachable; Inquiry list/compose.

**Mobile:** LoginModal; `/login`; Signup + consent; ProfileOverlay; Profile Edit; Inquiry.

Avoid duplicate review where states are visually identical.

---

## A5 later QA (READ ONLY)

LoginModal; `/login`; Signup + consent; ProfileOverlay; Profile Edit; ProfileComplete; Inquiry; Orders chrome if written; responsive; light/dark; keyboard/focus; loading/error; Header auth entry; Custom entry compatibility; auth/session regression.

No full-site recertification. No 2B/2D/2E/Admin recertification. Visible UI QA only after **USER VISUAL APPROVAL**.

---

## Do Not Do

- Implement from this stage-open note without the A3 implementation ticket
- Refactor auth authority / session / ProtectedRoute / admin gate
- Invent `/account`, `/signup`, `/profile` index, `/inquiry` routes, address-book, SNS, reset, recovery, phone verification, linking
- Reopen NEW 2B, NEW 2E, Home/PDP, Admin, tokens/primitives, Header, App.tsx
- Deploy, mutate DB, activate live Toss, open NEW 3

---

## Resume / implementation procedure

1. **A3 — NEW 2F IMPLEMENTATION** on the MUST (and optional MAY) write set
2. USER visual approval on the checklist above
3. A5 targeted QA
4. A0 closure (separate ticket)

---

## Ownership

A3 owns implementation files listed above. A5 is later READ ONLY QA. A6 NONE unless auth/server/DB must change (not authorized). A0 owns this governance note and project-state status only.

---

## Relevant Files

- `docs/decisions/NEW-2F_account-profile-auth-ux.md` (this contract)
- `docs/METALORA_PROJECT_STATE.md` (live status)
- `docs/decisions/NEW-1_launch-pipeline-v3.md` (pipeline family SoT; not rewritten by this open)
- `docs/decisions/22J_privacy-cookie-package-promotion.md` (Escape residual)
