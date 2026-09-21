# NEW 2C — Global Shell / Component Consistency

Status: **OPEN**

Date: 2026-09-22

Decision: NEW 2C is **OPEN**. User/orchestration review of the A0 PRE-STAGE REPORT is complete. Scope is **bounded residual customer-shell alignment**, not a design-system rewrite.

This note does **not** authorize CookieBanner implementation by itself (A1 ticket). It does **not** open NEW 2D–2F. It does **not** authorize Header/Footer source, tokens, ui primitives, overlay z-index migration, Home/PDP redesign, Workshop, Cart/checkout, Profile/account, backend, or deploy.

---

## Status

| Item | Value |
|------|--------|
| NEW 2 | **IN PROGRESS** |
| NEW 2A | **CLOSED** — preserved |
| NEW 2B | **CLOSED** — preserved |
| NEW 2C | **OPEN** |
| NEW 2D–2F | **NOT OPENED** |
| Implementation owner | **A1** |
| Governance | **A0** |
| QA | **A5 READ ONLY** |
| Next | **A1 — NEW 2C COOKIEBANNER SHELL ALIGNMENT IMPLEMENTATION** |

---

## Scope (CURRENT)

MUST implement one file:

`src/components/CookieBanner.tsx`

Change the customer-facing banner and settings-panel inner layout from residual

`max-w-7xl px-4 sm:px-6`

(or equivalent duplicated shell-width/gutter classes) to the existing canonical

`.container-shell`

Goal: CookieBanner horizontal width/gutters match Header / Footer / AnnouncementBar at representative mobile (~390) and desktop (~1440) widths.

Consent copy, accept / decline / settings handlers, analytics consent storage, and policy links must **not** change.

---

## Explicit exclusions

- `src/components/Footer.tsx` — **OUT OF SCOPE**. #23-A5-F02 legal-link wrap is MINOR / OPTIONAL, not a 2C closure blocker. Do not polish Footer because it is A1-owned.
- Header IA, nav labels, ordering, icon set, search behavior, menu hierarchy (NEW 2A CLOSED)
- `tokens.css`, `foundation.css`
- `src/components/ui/*` primitives (Button, Input, IconButton, modal/drawer)
- Overlay numeric z-index migration (`ProfileOverlay`, account modals, `WorkshopOverlay`)
- Home / PDP content redesign
- Workshop / Custom composition / price / lifecycle / durable handoff (NEW 2B CLOSED)
- Catalog / storefront (NEW 2D)
- Cart / checkout / payment / Toss / `btn-cyberpunk` / Custom thumbnail (NEW 2E)
- Profile / Login / account UX (NEW 2F)
- Admin chrome (NEW 3)
- Supabase, DB, server, analytics semantics, deploy

If implementation appears to require any file other than `CookieBanner.tsx`: **STOP** and return to orchestration. Do not expand scope.

---

## Visual approval

**REQUIRED.**

Minimum after A1 implementation:

1. Home desktop ~1440 with CookieBanner open
2. Home mobile ~390 with CookieBanner open
3. Cookie settings panel (desktop or mobile)

Verify: gutters align with shared customer shell; no consent behavior regression; no clipping; no new horizontal overflow.

Do not recertify every route.

---

## Acceptance criteria

1. CookieBanner uses existing `.container-shell` for the shared shell role.
2. CookieBanner desktop/mobile gutters align with Header/Footer shell.
3. Consent copy unchanged.
4. Accept / decline / settings behavior unchanged.
5. Header / Footer source unchanged.
6. Tokens / shared primitive files unchanged.
7. NEW 2A IA unchanged.
8. NEW 2B Custom UX unchanged.
9. NEW 2D / 2E / 2F untouched.
10. User visual approval **PASS**.
11. `npm run lint` **PASS**.
12. `git diff --check` **PASS**.
13. A5 targeted QA **PASS** before closure.

---

## Backend / A6

**NONE.** No DB, migration, server, payment, consent-storage change, or deploy.

---

## Do not do

- Implement CookieBanner in this stage-open ticket
- Treat NEW 2C as a broad design-system rewrite
- Reopen NEW 2A / NEW 2B
- Open NEW 2D / 2E / 2F from this note
- Include Footer wrap polish
- Deploy

---

## Resume procedure

1. This note + `docs/METALORA_PROJECT_STATE.md` = SoT
2. Next: **A1 — NEW 2C COOKIEBANNER SHELL ALIGNMENT IMPLEMENTATION**
3. Visual approval → A5 targeted QA → A0 closure

---

## Ownership (this note)

A0 — architecture / stage contract.

## Relevant files

- Implementation (A1, not this ticket): `src/components/CookieBanner.tsx`
- Frozen: `src/components/Header.tsx`, `src/components/Footer.tsx`, `src/components/AnnouncementBar.tsx`, `src/styles/tokens.css`, `src/styles/foundation.css`, `src/components/ui/*`
