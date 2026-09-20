# NEW 2A — Global Menu / Information Architecture Consistency

Status: CLOSED

Date: 2026-09-20

Amendment: **AMEND IN PLACE** (user visual feedback) then **CLOSED** after implementation, visual approval, A5 targeted QA, and A5 short-delta QA **PASS**. Same numbered stage. No NEW 2A-2. NEW 2B remains **NOT OPENED**.

Decision: NEW 2A is **CLOSED**. Implementation complete. Visual approval complete. A5 PASS. Intermediate CustomerNavSheet direction superseded; orphan file removed.

This note does **not** open NEW 2B–2F. It does **not** authorize a public `/workshop` or `/shop`/`/search` route, Workshop internals, payment, Supabase, deploy, or Rules edits.

---

## Final product contract (closed)

### Desktop Header

Search / Theme / centered Logo / Login·Account / Cart. **No** persistent Custom text.

### Mobile Header

Search / Theme / centered Logo / Login·Account / Cart. **No** visible `메뉴`. **No** hamburger. **No** extra navigation icon. **No** CustomerNavSheet trigger.

### Custom discovery

Primary customer entry: Home editorial CTA `커스텀 제작 →`.

Flow: Home CTA → `requestCustomAccess()` → logged out: Header-owned existing LoginModal → auth success: AuthContext continuation → Workshop. Logged in: `requestCustomAccess()` → Workshop. ProfileOverlay Custom row may remain secondary. No public `/workshop`.

### CustomerNavSheet

**SUPERSEDED.** Intermediate labelled-sheet direction was withdrawn by the final user-approved mobile Header. Tracked orphan `src/components/CustomerNavSheet.tsx` had **zero** runtime imports and was **deleted** at closure. Do not recreate a customer menu/sheet in 2A.

---

## Contract handling

User visual review changed IA **presentation** inside the already-open stage. Governance: **AMEND IN PLACE**, then close after A5 PASS.

---

## Report conclusions (NEW 2A PRE-STAGE)

Current customer IA is Home-as-catalog + icon-led Header + overlay account/commerce.

- Search was Home-only (`/?q=` + Home gallery) — 2A makes it global
- Frame icon was labelled `내 컬렉션` but opens Cart — commerce term becomes `장바구니`
- LoginModal and `/login` both exist and both are required
- Footer is legal/company, not primary nav
- Mega-nav / Shop page / Admin hamburger copy are not justified

---

## Locked product decisions

### Custom 제작 — discoverability (AMENDED)

Must be discoverable for **logged-out and logged-in** visitors without requiring User → Profile → 커스텀 제작.

Workshop **use** remains AUTH-GATED. No public Workshop. No `/workshop` route.

**Current discoverability model:**

| Surface | Rule |
|---|---|
| Desktop Home | **Primary:** editorial CTA `커스텀 제작 →` under `고르거나, 만들거나.` |
| Mobile Home | **Primary:** same Home CTA |
| Desktop Header | **NO** persistent Custom text CTA |
| Mobile Header bar | **NO** Custom text; **NO** `메뉴` / hamburger / sheet trigger |
| Mobile `CustomerNavSheet` | **SUPERSEDED / REMOVED** |
| ProfileOverlay | May remain as a secondary account path |

**SUPERSEDED:** Desktop hybrid Header as a persistent visible text destination `커스텀 제작`. That presentation is withdrawn to restore the original minimal/icon-led Header balance. This does **not** remove Custom discoverability from the product.

### Shared Custom access (AMENDED)

Header-local `pendingCustomIntent` is **no longer sufficient**. Custom has Home CTA (and optional Profile) entry points.

**Required (implemented):** AuthContext owns `requestCustomAccess()` and the shared pending Custom intent lifecycle. Header observes `pendingCustomAccess` and opens the existing LoginModal when logged out.

| Case | Behavior |
|---|---|
| Logged in | `requestCustomAccess()` → existing Workshop-opening flow → **exactly once** |
| Logged out | record pending Custom intent → existing **Header-mounted** LoginModal → after successful auth → Workshop **exactly once** → clear pending |
| Login dismissed/cancelled | clear pending |
| Ordinary login (User icon, cart-gated login, `/login`) | must **not** set Custom intent |

No persistence: no localStorage, URL flag, cookie, or DB flag. No public Workshop route.

`LoginModal.tsx` write is **not** expected if Header still opens the existing modal when pending is set. If that proves insufficient: STOP → dependency request.

`App.tsx` write is **not** expected. `ShellOverlayContext` is **not** the owner of Custom intent.

### Desktop Header (FINAL)

**Icon-led.** Preserve minimal storefront character.

- Search (global)
- Theme
- Centered Logo = Brand/Home
- Login / Account
- Cart (`장바구니`)
- **No** persistent `커스텀 제작` text
- No mega-nav, no category bar, no Shop nav item

Do not copy Admin chrome.

### Mobile Header (FINAL)

Same five controls as desktop: Search / Theme / Logo / Account / Cart.

**No** visible `메뉴`. **No** hamburger. **No** extra navigation icon. **No** CustomerNavSheet.

**SUPERSEDED:** compact labelled menu/sheet as a required mobile destination list.

### Home limited reopen (IMPLEMENTED)

User-authorized **narrow** exception in `src/pages/Home.tsx` (A2). General Home FROZEN policy otherwise intact.

Implemented:

1. `고르거나, 만들거나.` typography — **final approved:** mobile **36px**, md+ **48px**, weight **600**
2. Removed `고르기 · 만들기`
3. Editorial CTA `커스텀 제작 →` — **final approved:** mobile **17px**, md+ **18px**; text-button; `requestCustomAccess()` only
4. Minimal wiring: `requestCustomAccess()`; Home does **not** mount LoginModal

**Headline guidance** (not a license to change surrounding architecture): substantially stronger than the current 26px inline treatment; premium/editorial; existing font system only; centered; do not overpower the artwork grid. Mobile ≈ page-title / ~1.75rem. Desktop ≈ hero / ~2rem (32px). Weight ~600. Tracking ~-0.01em to -0.02em. Line-height ~1.15–1.2.

**CTA guidance:** editorial text, not a filled primary / pill / bordered ecommerce button / card / badge. Compact; secondary tone → primary on hover/focus; focus-ring; adequate touch target; subtle underline/opacity/arrow allowed; centered under the headline.

**Still frozen on Home:** Hero, artwork/grid layout, sort controls, ProductCard, section architecture, backgrounds, other copy, spacing outside the immediate headline/CTA stack, Footer.

**SUPERSEDED:** the original 2A rule “no Home Custom CTA.”

### Cart terminology (IMPLEMENTED)

Commerce object: **`장바구니`**. Public catalog may remain **`컬렉션`**.

Cart overlay (implemented): title `장바구니`; step `1. 장바구니`; empty `장바구니가 비어있어요`. Header cart aria: `장바구니`.

Defer: `WorkshopView` add-to-cart copy → NEW 2B; `PaymentSuccess` → NEW 2E; unused `LanguageContext`.

### Search (unchanged)

Globally reachable from the customer shell. Results: `/?q=<query>` on Home. No `/shop`. No `/search`. Auth/admin shells where Header is hidden stay exempt.

### Login (unchanged)

Keep LoginModal (in-page) and `/login` (redirect/recovery, noindex). No 2A restyle.

### Catalog (unchanged)

**HOME-AS-CATALOG.** `/` + `/product/:id`. No Shop route.

### Footer (unchanged)

Secondary / legal / company. Crawlable `/policy/:type`. Do not duplicate primary nav. Do not bury Custom exclusively in Footer.

### Account / inquiry (unchanged)

Profile remains account hub. Orders and 1:1 문의 may stay account-gated.

---

## Frozen-surface exceptions

Still FROZEN COMPLETE except:

**A. Shared Header chrome** (icon-led desktop and mobile; no CustomerNavSheet).

**B. Home.tsx headline/CTA stack** (implemented; final 36px / 48px headline; 17px / 18px CTA).

**C. Copy-only PDP commerce CTA** in `src/components/pdp/ProductTheatreRail.tsx` (implemented):

| Current | Replacement |
|---|---|
| 내 컬렉션에 담기 | 장바구니에 담기 |
| 컬렉션에 담는 중... | 장바구니에 담는 중... |
| 컬렉션에 담겼습니다 | 장바구니에 담겼습니다 |
| 내 컬렉션으로 | 장바구니로 |

PDP otherwise remains **FROZEN**. `ProductDetail.tsx` “컬렉션으로 돌아가기” remains catalog language and was **intentionally not changed**.

---

## Completed WRITE SET

- A0: `src/context/AuthContext.tsx`
- A1: `src/components/Header.tsx`
- A2: `src/pages/Home.tsx`; `src/components/pdp/ProductTheatreRail.tsx` (four strings)
- A3: `src/components/Cart.tsx`
- Closure: **deleted** orphan `src/components/CustomerNavSheet.tsx`

Not written: App.tsx, ShellOverlayContext, LoginModal, ProfileOverlay, Footer, Hero, ProductGrid, ProductCard, Workshop internals, ProductDetail, payment, server, Supabase, GA4, package.json, Rules.

---

## Ownership (historical; stage closed)

| Area | Owner |
|---|---|
| AuthContext shared Custom access | A0 |
| Header | A1 |
| Home.tsx headline + CTA | A2 |
| Cart visible commerce terminology | A3 |
| PDP rail copy-only exception | A2 (one-time) |
| CustomerNavSheet | **removed**; do not recreate |
| Workshop internals | NEW 2B, not 2A |
| QA | A5 READ ONLY — **PASS** (short delta) |

---

## PROTECTED SET

- Frozen Home except the authorized headline/CTA stack
- Frozen PDP except the four rail strings
- Product-truth claims
- Workshop internals / public Workshop route
- Login visual restyle; `/login` removal
- Policy crawl / sitemap / robots
- Payment / Toss / `server.ts` payment
- Supabase / NEW 6
- Analytics/consent
- Admin IA
- package.json / deploy / Cloud Run
- Persist Custom intent in storage/URL/cookie/DB

---

## Collision / implementation order

**COMPLETED.** AuthContext → Header login bridge → Home CTA → Cart + PDP rail strings → A5 → this closure (orphan sheet deleted).

---

## Visual approval / QA evidence

USER VISUAL APPROVAL: **PASS** (final Header + Home headline/CTA).

A5 TARGETED QA: initial verdict **FAIL / BLOCKED** — unreachable CustomerNavSheet (then still in the contract).

Product decision: CustomerNavSheet **removed** from the final mobile contract.

A5 SHORT DELTA QA: **PASS**

Final PASS areas: Mobile Header contract; Desktop Header regression; Home Custom logged-out flow; Cart terminology; ProductTheatreRail strings; Home typography / CTA; `npm run lint`; `git diff --check`; A5 read-only integrity.

### Residual authenticated verification (NON-BLOCKING)

**NOT TESTED** (no legitimate authenticated session in A5):

- logged-in Home Custom → Workshop exactly once
- Custom-origin login success → Workshop exactly once
- token/session refresh → Workshop does not reopen

These do **not** block NEW 2A closure. Do not create/mutate accounts for closure.

---

## Definition of Done (closed)

1. Custom is discoverable **without** entering Profile first via Home CTA `커스텀 제작 →` (desktop and mobile Home); Profile remains a secondary path.
2. Workshop use remains auth-gated; no public Workshop; no `/workshop`.
3. Desktop Header is icon-led: Search / Theme / Logo / Account / Cart; **no** persistent Custom text; no mega-nav.
4. Mobile Header matches desktop five controls; **no** `메뉴` / hamburger / CustomerNavSheet.
5. Commerce cart is labelled `장바구니` on Header aria and Cart overlay copy in scope.
6. Public catalog `컬렉션` language remains conceptually separate (`컬렉션으로 돌아가기` unchanged).
7. Search is globally reachable and lands on `/?q=` Home results.
8. LoginModal and `/login` roles remain intact.
9. Home remains the catalog. No `/shop` or `/search` route.
10. Policy URLs and Footer crawlability remain intact.
11. Frozen Home/PDP unchanged except headline/CTA stack and four rail strings.
12. Home headline/CTA visually approved (36px / 48px; CTA 17px / 18px).
13. `requestCustomAccess()` is the Home CTA path; Header LoginModal observes pending when logged out.
14. Dismissal clears pending; ordinary login does not set Custom intent.
15. Existing shared overlays are not broken.
16. A5 short-delta QA **PASS**.
17. Orphan CustomerNavSheet deleted.
18. No payment / Supabase / runtime authority boundary crossed.

---

## Do Not Do

- Do not reopen NEW 2A presentation (no CustomerNavSheet, no desktop Custom text, no hamburger)
- Do not open NEW 2B–2F from this note
- Do not add `/workshop`, `/shop`, or `/search`
- Do not redesign frozen Home beyond the closed headline/CTA stack
- Do not expand PDP writes beyond the four rail strings
- Do not rename catalog “컬렉션” (Hero, AnnouncementBar, ProductDetail back)
- Do not copy Admin hamburger
- Do not duplicate primary nav into Footer
- Do not remove LoginModal or `/login`
- Do not persist Custom intent in storage/URL/cookie/DB
- Do not mutate Workshop internals, payment, Supabase, deploy, or Rules
- Do not deploy this closure

Resume Condition: **A0 PRE-STAGE REPORT — NEW 2B**. NEW 2B is **NOT OPEN**. HARD STOP until user/orchestration review and OPEN READY.

Ownership: A0 (this contract)

Relevant Files: `docs/decisions/NEW-2A_menu-ia-consistency.md`, `docs/METALORA_PROJECT_STATE.md`, `docs/decisions/NEW-1_launch-pipeline-v2.md` (pipeline definition, unchanged)
