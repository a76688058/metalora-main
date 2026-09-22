# NEW 2D — Catalog / General Storefront

Status: **OPEN — VERIFICATION-FIRST**

Date: 2026-09-22

Decision: NEW 2D is **OPEN** as a **verification-first** stage. The existing customer storefront already satisfies the PRE-STAGE architecture. This is **not** an automatic A2 implementation ticket.

Current application implementation: **NONE REQUIRED YET**.

Do **not** edit application source unless a concrete visual/QA defect is later **promoted by orchestration**.

This note does **not** open NEW 2E–2F. It does **not** authorize Home/PDP redesign, a competing catalog route, Workshop, Cart/checkout/Toss, Profile/account, backend, or deploy.

---

## Status

| Item | Value |
|------|--------|
| NEW 2 | **IN PROGRESS** |
| NEW 2A | **CLOSED** — preserved |
| NEW 2B | **CLOSED** — preserved |
| NEW 2C | **CLOSED** — preserved |
| NEW 2D | **OPEN — VERIFICATION-FIRST** |
| NEW 2E–2F | **NOT OPENED** |
| Application write set | **NONE** |
| Primary owner if a blocker is later promoted | **A2** |
| Visual approval | **REQUIRED** (current storefront, not a redesign) |
| A5 QA | **REQUIRED** after user PASS |
| Backend / A6 | **NONE** |
| Next | **USER — review current Home/PDP storefront visuals** |

---

## Locked storefront architecture (CURRENT)

| Role | Route / entry |
|------|----------------|
| General catalog | Home `/` |
| Search | Header → `/?q=` |
| Standard product | `/product/:id` |

No `/shop`. No `/catalog`. No `/collection`. No `/search` route.

Home remains the catalog. Do **not** create a competing catalog architecture.

---

## PRE-STAGE source assessment

| Area | Finding |
|------|---------|
| Home storefront | **ALREADY CONSISTENT** |
| Catalog / grid | **NO NEW ROUTE REQUIRED** |
| Product cards | **ALREADY CONSISTENT** |
| Standard PDP | **ALREADY CONSISTENT** for NEW 2D |
| Product data authority | **SUFFICIENT** — Supabase `products` |
| Price consistency | **PASS** |
| Product routing | **PASS** |
| Responsive storefront | **SUFFICIENT** |
| Backend / A6 | **NONE** |

Default implementation source MUST set: **NONE**.

---

## Application write set (stage open)

**NONE.**

Do **not** authorize A2 to edit:

- `src/pages/Home.tsx`
- `src/components/ProductCard.tsx`
- `src/components/ProductGrid.tsx`
- `src/components/ProductDetail.tsx`
- any `src/components/pdp/*` file

Those files become writable only if a later visual/QA finding is **explicitly promoted by orchestration**.

Do not make optional polish merely because a MAY file was identified in the PRE-STAGE report.

---

## Optional residuals — NOT PROMOTED

Not implementation requirements at stage open:

| Residual | Classification | Action |
|----------|----------------|--------|
| Home empty-state copy may say `검색 결과가 없습니다.` even when `q` is absent and catalog is empty | minor residual | Do **not** change unless visual/QA evidence promotes it |
| Marquee `focus-ring` | optional a11y | Do **not** promote automatically |
| Product-card title / price / sold-out chrome | intentional / frozen | Do **not** add |
| Card aspect `210/297` | frozen Home presentation | Do **not** retune to 200/283 |
| Hero vs listing unsellable-product filter | no live-catalog defect proven | Do **not** change |

---

## Frozen boundaries

- **NEW 2A CLOSED.** Header IA, search entry, navigation architecture unchanged.
- **NEW 2B CLOSED.** Workshop / Custom composition / price / durable handoff / lifecycle unchanged.
- **NEW 2C CLOSED.** Shared shell, CookieBanner, `.container-shell` unchanged.
- **NEW 2E NOT OPENED.** Cart, checkout, payment, Toss, Custom thumbnail geometry.
- **NEW 2F NOT OPENED.** Profile, account, order history, Login UI redesign.

---

## Visual verification gate

Before any source edit, USER reviews the **current** storefront.

Minimum states:

1. Home desktop ~1440
2. Home mobile ~390
3. One standard PDP desktop ~1440
4. One standard PDP mobile ~390

Also verify existing search if practical:

5. Home `/?q=` with a matching product
6. Home `/?q=` with no match

Purpose: does the **current** implementation satisfy NEW 2D acceptance criteria? Not a redesign.

### If USER PASS

No source implementation. Next: **A5 — NEW 2D TARGETED QA (READ ONLY)**.

### If USER finds a concrete defect

**STOP.** Return the exact defect to orchestration. Do **not** let A2 fix it automatically.

Orchestration decides whether it is a genuine NEW 2D blocker, optional polish, or later-stage work, and authorizes the smallest source write set if needed.

If visual review and A5 QA find no concrete defect: **close NEW 2D with no application-source implementation**.

---

## Acceptance criteria

1. General products are discovered on Home `/`.
2. No competing shop/catalog architecture is introduced.
3. Search remains Header → `/?q=`.
4. Product cards route to `/product/:id`.
5. Supabase `products` remains the general-product authority.
6. Hero/PDP displayed pricing remains option-derived.
7. Existing loading/error/not-found behavior remains usable.
8. Current Home and PDP are visually acceptable at ~390 and ~1440.
9. Frozen 2A/2B/2C remain unchanged.
10. NEW 2E/2F remain untouched.
11. User visual approval **PASS**.
12. A5 targeted QA **PASS**.
13. `npm run lint` / `git diff --check` **PASS**.
14. No source change is required merely to claim NEW 2D completion.

---

## Backend / production

**NONE.** No DB, Supabase migration, server, payment, analytics-semantics, or deploy.

---

## Do not do

- Assign A2 an implementation ticket from this stage-open
- Edit Home / ProductCard / ProductGrid / ProductDetail / PDP files
- Add `/shop`, `/catalog`, `/collection`, or `/search`
- Add category pages, faceted filtering, a new sort system, or subtitle search
- Redesign Home/Hero, card chrome, card aspect, or PDP / WebGL
- Reopen 2A / 2B / 2C
- Open 2E / 2F
- Mount or rewrite `ExperienceGallery`
- Admin A4 cleanup
- Deploy

---

## Resume procedure

1. This note + `docs/METALORA_PROJECT_STATE.md` = SoT
2. Next: **USER — review current NEW 2D Home/PDP storefront visuals**
3. USER PASS → A5 targeted QA (READ ONLY)
4. USER defect → return to orchestration; no automatic source edit
5. Do **not** start NEW 2E until its own PRE-STAGE REPORT is reviewed and OPEN READY

---

## Ownership (this note)

A0 — architecture / stage contract.

If a blocker is later promoted: **A2** for Home / cards / listing / PDP non-WebGL, smallest write set only.

## Relevant files

- Governance: this note; `docs/METALORA_PROJECT_STATE.md`
- Frozen / not writable at stage open: `src/pages/Home.tsx`, `src/components/ProductCard.tsx`, `src/components/ProductGrid.tsx`, `src/components/ProductDetail.tsx`, `src/components/pdp/*`, `src/components/Header.tsx`, Workshop, Cart, account
