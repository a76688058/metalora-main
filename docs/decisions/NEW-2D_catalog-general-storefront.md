# NEW 2D — Catalog / General Storefront

Status: **CLOSED**

Date: 2026-09-22

Decision: NEW 2D is **CLOSED**. This was a **verification-first** stage. Application implementation required: **NO**. Application source changes: **NONE**. The existing storefront already satisfied the accepted contract. This was **not** an A2 implementation ticket.

This note does **not** open NEW 2E–2F. It does **not** authorize Home/PDP redesign, a competing catalog route, Workshop, Cart/checkout/Toss, Profile/account, backend, or deploy.

---

## Status

| Item | Value |
|------|--------|
| NEW 2 | **IN PROGRESS** |
| NEW 2A | **CLOSED** — preserved |
| NEW 2B | **CLOSED** — preserved |
| NEW 2C | **CLOSED** — preserved |
| NEW 2D | **CLOSED** |
| NEW 2E–2F | **NOT OPENED** |
| Application source | **NONE** — no implementation commit |
| Visual approval | **PASS** (current storefront; not a redesign) |
| A5 targeted QA | **PASS** |
| Backend / A6 | **NONE** |
| Next governance action | **A0 PRE-STAGE REPORT — NEW 2E** (do not open 2E from this note) |

---

## Closure model

NEW 2D opened as **VERIFICATION-FIRST**. User visual approval **PASS**. A5 targeted QA **PASS**. No concrete defect was promoted. Closure is governance completion of the existing catalog path.

Do **not** invent an implementation SHA. Do **not** imply A2 edited Home, ProductCard, ProductGrid, ProductDetail, or PDP files for this stage.

---

## Accepted storefront architecture

| Role | Route / entry |
|------|----------------|
| General catalog | Home `/` |
| Search | Header → `/?q=` |
| Standard product | `/product/:id` |

No `/shop`. No `/catalog`. No `/collection`. No `/search` route.

Home remains the catalog. No competing catalog architecture was created.

---

## Home-as-catalog — VERIFIED / ACCEPTED

No Home redesign.

- product discovery
- marquee
- gallery
- separate Custom entry (`커스텀 제작 →` / `requestCustomAccess()`)
- title search through `/?q=`
- latest / random sorting
- loading skeletons
- fetch error / retry
- responsive listing

---

## Product cards — VERIFIED / ACCEPTED

- existing `ProductCard` links to `/product/:id`
- no direct Add-to-Cart
- image fallback exists
- no mounted demo/mock catalog
- current image-led treatment accepted
- price / title / sold-out chrome was **not** required for closure and was **not** added

---

## Standard PDP — VERIFIED / ACCEPTED

WebGL/theatre redesign was **not** part of NEW 2D.

- title, subtitle
- selected-option price
- options / size
- quantity
- sold-out handling
- `장바구니에 담기`
- production and delivery facts
- loading, error/retry, not-found
- login gate where applicable

---

## Product data authority

Supabase `products` remains the accepted general-product authority.

No NEW 2D schema, API, migration, backend service, or mounted demo catalog.

---

## Price contract

| Surface | Rule |
|---------|------|
| Hero | option-derived (`resolveHeroPrice`) |
| PDP | selected-option price |
| Cards | price intentionally omitted under accepted presentation |
| Custom | separate `custom_m_price` contract untouched |

No hardcoded general-storefront price blocker.

---

## Routing / search / sort

Canonical product route: `/product/:id`. Search: `/?q=` title match. Sort: latest / random.

**Not** added and **not** claimed complete: categories, collections, faceted filters, subtitle search, extra sort modes.

---

## Visual approval

User visual approval: **PASS**.

User reviewed the current Home / PDP storefront and confirmed no visual issue required NEW 2D source implementation.

This approval applies to **NEW 2D storefront surfaces only**. It does **not** approve NEW 2E, NEW 2F, Cart, checkout, or Profile/account.

---

## QA evidence

- A5 targeted QA: **PASS**
- A0 final closure audit: **PASS**

A5 concluded: implementation required **NO**; implementation complete **YES** by verification of existing implementation; closure ready **YES**.

Coverage: Home-as-catalog; ProductCard; standard PDP; Supabase product authority; price consistency; routing; search/sort; loading/error/not-found; responsive behavior; relevant a11y/interaction; frozen 2A/2B/2C; NEW 2E/2F boundaries; backend **NONE**; lint **PASS**; `git diff --check` **PASS**; worktree **CLEAN**.

---

## Non-blocking residuals (NOT FIXED)

| Residual | Classification |
|----------|----------------|
| Home empty-state copy may say `검색 결과가 없습니다.` when `q` is absent and the catalog is empty | **NON-BLOCKING MINOR COPY RESIDUAL** |
| Gallery links have `focus-ring`; marquee links do not | **OPTIONAL / DEFERRED A11Y** |

Neither is a NEW 2D closure blocker. Neither was implemented.

---

## Frozen boundaries

- **NEW 2A CLOSED / unchanged.** Header IA, search entry, navigation architecture.
- **NEW 2B CLOSED / unchanged.** Workshop / Custom composition / price / durable handoff / lifecycle.
- **NEW 2C CLOSED / unchanged.** Shared shell, CookieBanner, `.container-shell`.
- **NEW 2E NOT OPENED.** Cart, checkout, payment, Toss, Custom thumbnail geometry.
- **NEW 2F NOT OPENED.** Profile, account, order history, Login UI redesign.

---

## Explicitly not implemented

- new catalog route / `/shop` / category pages / collection pages
- faceted filtering / subtitle search / new sort modes
- product-card price chrome / direct Add-to-Cart from cards / card aspect-ratio redesign
- Home/Hero redesign / PDP redesign / PDP WebGL redesign
- Workshop / Cart/checkout / Profile/account changes
- admin A4 cleanup / `ExperienceGallery` mounting
- schema / API / backend changes

---

## Checkpoints

| SHA | Message |
|-----|---------|
| `ae0f59bbbd47f9a21441d25a7fbf35033bd30d5f` | `docs(project): open NEW 2D storefront verification` |

There is **no** NEW 2D application implementation commit. This is intentional.

Docs closure commit SHA does not exist yet.

---

## Backend / production

NEW 2D required **NONE**: no DB, Supabase migration, server, payment, analytics-semantics, or deploy.

Closure is source/governance completion only. Production was **not** redeployed for NEW 2D. Broader production rollout status from other stages is unchanged. NEW 2D closure does **not** mean production launch readiness.

---

## Remaining NEW 2D implementation

**NONE.**

---

## Do not do

- Reopen NEW 2D implementation
- Invent an implementation SHA
- Claim a catalog-route or card-chrome redesign
- Open NEW 2E from this note
- Deploy

---

## Resume procedure

1. This note + `docs/METALORA_PROJECT_STATE.md` = SoT
2. Next: **A0 PRE-STAGE REPORT — NEW 2E** (Cart / Checkout UX)
3. Do **not** start NEW 2E until that report is reviewed and OPEN READY

---

## Ownership (this note)

A0 — architecture / stage contract.

## Relevant files

- Governance: this note; `docs/METALORA_PROJECT_STATE.md`
- Unchanged for NEW 2D: `src/pages/Home.tsx`, `src/components/ProductCard.tsx`, `src/components/ProductGrid.tsx`, `src/components/ProductDetail.tsx`, `src/components/pdp/*`, `src/components/Header.tsx`, Workshop, Cart, account
