# NEW 2C — Global Shell / Component Consistency

Status: **CLOSED**

Date: 2026-09-22

Decision: NEW 2C is **CLOSED**. Bounded residual customer-shell alignment is complete. This was **not** a design-system rewrite.

This note does **not** open NEW 2D–2F. It does **not** authorize Header/Footer source, tokens, ui primitives, overlay z-index migration, Home/PDP redesign, Workshop, Cart/checkout, Profile/account, backend, or deploy.

---

## Status

| Item | Value |
|------|--------|
| NEW 2 | **IN PROGRESS** |
| NEW 2A | **CLOSED** — preserved |
| NEW 2B | **CLOSED** — preserved |
| NEW 2C | **CLOSED** |
| NEW 2D–2F | **NOT OPENED** |
| Implementation | **COMPLETE** — `src/components/CookieBanner.tsx` only |
| Next governance action | **A0 PRE-STAGE REPORT — NEW 2D** (do not open 2D from this note) |

---

## Final scope (CURRENT)

One file:

`src/components/CookieBanner.tsx`

First-visit CookieBanner inner shell and Cookie settings/preferences inner shell now consume the existing canonical `.container-shell` instead of duplicated local classes (`mx-auto`, `max-w-7xl`, `px-4`, `sm:px-6`).

Implementation diff: **1 file, 2 insertions, 2 deletions**.

- existing `.container-shell` reused
- no new shell token
- no global gutter retune
- no shared primitive rewrite
- Header unchanged
- Footer unchanged
- consent logic unchanged
- cookie/legal copy unchanged
- no backend work

Do not overstate NEW 2C as a site-wide design-system migration.

---

## Footer (OUT OF SCOPE)

`src/components/Footer.tsx` was **not** changed.

#23-A5-F02 legal-link wrapping remains **MINOR / OPTIONAL**. It is **not** a NEW 2C closure blocker and is **not** claimed fixed.

---

## Frozen boundaries

- **NEW 2A CLOSED.** Header / navigation IA unchanged (labels, hierarchy, icons, search, responsive nav).
- **NEW 2B CLOSED.** Workshop / Custom Step 1–2 / composition / price / durable handoff / lifecycle unchanged.
- Tokens / primitives unchanged: `tokens.css`, `foundation.css`, Button, IconButton, Input, modal/drawer primitives. No token consolidation occurred.
- **NEW 2D / 2E / 2F** were not opened or partially completed (no catalog, Cart/checkout/Toss, or Profile/Login/account work).

---

## Visual approval

User visual approval: **PASS**.

User directly reviewed:

1. First-visit CookieBanner desktop ~1440
2. First-visit CookieBanner mobile ~390
3. Cookie settings desktop
4. Cookie settings mobile

Approved: shell gutter alignment natural; no horizontal overflow; no clipping; copy readable; buttons usable; settings panel aligned. Every route was **not** re-reviewed.

---

## QA evidence

- A5 targeted QA: **PASS**
- A0 final checkpoint / closure audit: **PASS**

Findings: one-file minimal diff; canonical `container-shell` consumed; consent and copy unchanged; Footer/Header unchanged; tokens/primitives unchanged; frozen 2A/2B preserved; no 2D/2E/2F crossing; lint **PASS**; `git diff --check` **PASS**.

---

## Checkpoints

| SHA | Message |
|-----|---------|
| `14c358c1b6fb81a93fd8673a790596331d9089d6` | `docs(project): open NEW 2C shell consistency` |
| `6ff78fcd64e951d88ab12dc6d88249fb77c8b4d3` | `feat(shell): align cookie banner container` |

Docs closure commit SHA does not exist yet.

---

## Backend / production

NEW 2C required **NONE**: no DB, Supabase migration, server, payment, analytics-semantics, or deploy.

Closure is source/governance completion only. Production was **not** redeployed for NEW 2C. Broader production rollout status from other stages is unchanged.

---

## Remaining NEW 2C implementation

**NONE.**

---

## Do not do

- Reopen NEW 2C implementation
- Open NEW 2D from this note
- Claim Footer wrap fixed
- Claim a site-wide token/primitive migration
- Deploy

---

## Resume procedure

1. This note + `docs/METALORA_PROJECT_STATE.md` = SoT
2. Next: **A0 PRE-STAGE REPORT — NEW 2D** (Catalog / General Storefront)
3. Do **not** start NEW 2D until that report is reviewed and OPEN READY

---

## Ownership (this note)

A0 — architecture / stage contract.

## Relevant files

- Implemented: `src/components/CookieBanner.tsx`
- Unchanged: `src/components/Header.tsx`, `src/components/Footer.tsx`, `src/components/AnnouncementBar.tsx`, `src/styles/tokens.css`, `src/styles/foundation.css`, `src/components/ui/*`
