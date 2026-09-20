# NEW 2A — Global Menu / Information Architecture Consistency

Status: OPEN

Date: 2026-09-20

Amendment: **AMEND IN PLACE** (2026-09-20 user visual feedback). Same numbered stage. Not closed. Not reopened. No NEW 2A-2. NEW 2B remains **NOT OPENED**.

Decision: NEW 2A is **OPEN**. Current sub-status: **USER-FEEDBACK CONTRACT AMENDED**. Next source slice is **A0 AuthContext shared Custom access**. That source slice is **not started** in this note.

This note does **not** assign writers. It does **not** authorize a public `/workshop` or `/shop`/`/search` route, Workshop internals, payment, Supabase, deploy, or Rules edits. Preserve uncommitted A1 WIP (`Header.tsx`, `CustomerNavSheet.tsx`) until an A1 revision ticket.

---

## Contract handling

User visual review of the uncommitted A1 Header changed an IA **presentation** decision inside the already-open stage. Governance: **AMEND IN PLACE**.

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
| Desktop Home | Primary: editorial CTA `커스텀 제작 →` under `고르거나, 만들거나.` |
| Desktop Header | **NO** persistent Custom text CTA |
| Mobile Header bar | **NO** direct Custom text CTA |
| Mobile `CustomerNavSheet` | **KEEP** labelled `커스텀 제작` |
| ProfileOverlay | May remain as a secondary account path |

**SUPERSEDED:** Desktop hybrid Header as a persistent visible text destination `커스텀 제작`. That presentation is withdrawn to restore the original minimal/icon-led Header balance. This does **not** remove Custom discoverability from the product.

### Shared Custom access (AMENDED)

Header-local `pendingCustomIntent` is **no longer sufficient**. Custom now has multiple entry points (Home CTA + mobile sheet, plus optional Profile).

**Required:** AuthContext owns `requestCustomAccess()` and the shared pending Custom intent lifecycle.

| Case | Behavior |
|---|---|
| Logged in | `requestCustomAccess()` → existing Workshop-opening flow → **exactly once** |
| Logged out | record pending Custom intent → existing **Header-mounted** LoginModal → after successful auth → Workshop **exactly once** → clear pending |
| Login dismissed/cancelled | clear pending |
| Ordinary login (User icon, cart-gated login, `/login`) | must **not** set Custom intent |

No persistence: no localStorage, URL flag, cookie, or DB flag. No public Workshop route.

`LoginModal.tsx` write is **not** expected if Header still opens the existing modal when pending is set. If that proves insufficient: STOP → dependency request.

`App.tsx` write is **not** expected. `ShellOverlayContext` is **not** the owner of Custom intent.

### Desktop Header (AMENDED)

**HYBRID / icon-led.** Preserve minimal storefront character.

- Logo = Brand/Home
- **No** persistent `커스텀 제작` text on the bar
- Account = utility
- Cart = clearly understandable commerce entry (`장바구니`)
- Theme = utility, not a destination
- Search = globally reachable (desktop icon)
- No mega-nav, no category bar, no Shop nav item

Do not copy Admin chrome.

### Mobile Header

**COMPACT LABELLED MENU / SHEET.**

Bar: labelled `메뉴` (or equivalent), no Custom text on the bar. Cart remains quickly reachable.

Sheet labelled destinations at minimum:

- 커스텀 제작 → `requestCustomAccess()`
- 검색
- 로그인 / 내 정보 as applicable

Do **not** copy `AdminLayout` hamburger.

### Home limited reopen (NEW)

User-authorized **narrow** exception in `src/pages/Home.tsx` (A2). General Home FROZEN policy otherwise intact.

Authorized:

1. `고르거나, 만들거나.` typography
2. Remove `고르기 · 만들기`
3. Replace that line with editorial CTA `커스텀 제작 →`
4. Minimal wiring: call `requestCustomAccess()`

**Headline guidance** (not a license to change surrounding architecture): substantially stronger than the current 26px inline treatment; premium/editorial; existing font system only; centered; do not overpower the artwork grid. Mobile ≈ page-title / ~1.75rem. Desktop ≈ hero / ~2rem (32px). Weight ~600. Tracking ~-0.01em to -0.02em. Line-height ~1.15–1.2.

**CTA guidance:** editorial text, not a filled primary / pill / bordered ecommerce button / card / badge. Compact; secondary tone → primary on hover/focus; focus-ring; adequate touch target; subtle underline/opacity/arrow allowed; centered under the headline.

**Still frozen on Home:** Hero, artwork/grid layout, sort controls, ProductCard, section architecture, backgrounds, other copy, spacing outside the immediate headline/CTA stack, Footer.

**SUPERSEDED:** the original 2A rule “no Home Custom CTA.”

### Cart terminology (unchanged)

Commerce object: **`장바구니`**. Public catalog may remain **`컬렉션`**.

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

**A. Shared Header / mobile sheet chrome** required by IA (including removal of desktop Custom text).

**B. Home.tsx headline/CTA stack only** (this amendment).

**C. Copy-only PDP commerce CTA** in `src/components/pdp/ProductTheatreRail.tsx` (later slice, not this Home-feedback implementation):

| Current | Replacement |
|---|---|
| 내 컬렉션에 담기 | 장바구니에 담기 |
| 컬렉션에 담는 중... | 장바구니에 담는 중... |
| 컬렉션에 담겼습니다 | 장바구니에 담겼습니다 |
| 내 컬렉션으로 | 장바구니로 |

PDP otherwise remains **FROZEN**. Do **not** change `ProductDetail.tsx` “컬렉션으로 돌아가기”.

Exceptions **A/B** and later **C** each require USER VISUAL APPROVAL and targeted A5.

---

## Exact WRITE SET

### A0 slice (next source; not started here)

- `src/context/AuthContext.tsx` — `requestCustomAccess()` + pending lifecycle + post-auth continuation + clear/cancel as required

### A1 slice (preserve current dirty WIP; revise after A0 AuthContext)

- `src/components/Header.tsx`
- `src/components/CustomerNavSheet.tsx`

A1 later: remove desktop Custom text; keep global search; keep cart aria `장바구니`; keep mobile labelled menu; sheet Custom calls `requestCustomAccess()`; LoginModal remains Header-mounted; dismiss clears pending via the shared API.

### A2 Home slice (after A1 visual checkpoint)

- `src/pages/Home.tsx` — headline, remove subtitle, Custom CTA, `requestCustomAccess()`

### Later unchanged NEW 2A slices

- A3: `src/components/Cart.tsx`
- A2: `src/components/pdp/ProductTheatreRail.tsx` (four strings only)

### Explicitly NOT in 2A WRITE SET

- `src/App.tsx`
- `src/context/ShellOverlayContext.tsx`
- `src/components/LoginModal.tsx`
- `src/components/ProfileOverlay.tsx`
- `src/components/Footer.tsx`
- `src/components/hero/*`, ProductGrid, ProductCard
- Workshop internals
- `src/components/ProductDetail.tsx`
- Payment pages / `server.ts` / Supabase / GA4 / `package.json` / `.cursor/rules/*`

If another file becomes mandatory: STOP → dependency request.

---

## Ownership (not an implementation assignment)

| Area | Owner |
|---|---|
| AuthContext shared Custom access | A0 |
| Header / CustomerNavSheet | A1 |
| Home.tsx headline + CTA | A2 |
| Cart visible commerce terminology | A3 |
| PDP rail copy-only exception | A2 (one-time; does not transfer PDP ownership) |
| App.tsx | A0 — **no write expected** |
| Workshop internals | NEW 2B, not 2A |
| QA after visual approval | A5 READ ONLY |
| SEO/URL | A6 — **NONE expected** |

Do not assign writers from this note.

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

Max 2 concurrent write agents. One file = one writer.

Do **not** parallelize the first three source slices.

1. A0 — this contract amendment (docs)
2. Durability review/commit of amendment **without** mixing A1 runtime WIP
3. **A0 AuthContext** controlled write — **must finish** before A1/A2 consume the API
4. **A1** revise preserved Header / CustomerNavSheet WIP
5. **USER VISUAL REVIEW — Checkpoint 1** (Header + mobile menu). Do not start Home visual work until approved
6. **A2** Home headline + Custom CTA
7. Integration verification
8. **USER VISUAL APPROVAL — Checkpoint 2** (Home + Header)
9. Later: A3 Cart terminology; A2 ProductTheatreRail strings
10. A5 targeted final NEW 2A QA
11. A0 closure

A1 must not edit AuthContext, Home, Cart, or PDP rail. A2 Home must not edit Header. A0 AuthContext must not edit Header/Home.

---

## Visual approval gates

### Checkpoint 1 — after A1 Header revision

- Desktop visible Custom text gone
- Minimal/icon-led Header balance restored
- Global search retained
- Cart access retained (`장바구니` aria)
- Mobile menu coherent
- Mobile sheet Custom still visible

### Checkpoint 2 — after A2 Home change

- `고르거나, 만들거나.` visual scale
- CTA relationship under headline
- Artwork/grid hierarchy preserved
- Desktop Home and mobile Home
- Frozen Home content unchanged outside the stack

Do **not** send to A5 before the relevant user visual approval.

---

## Definition of Done

1. Custom is discoverable **without** entering Profile first, via: Home CTA (desktop and mobile Home); mobile customer nav sheet; existing Profile secondary path.
2. Actual Custom/Workshop use remains auth-gated; no public Workshop; no `/workshop`.
3. Desktop Header is hybrid/icon-led: **no** persistent Custom text; no mega-nav / Shop bar; original minimal balance restored.
4. Mobile uses a compact labelled menu/sheet; destinations include Custom, Search, Login/내 정보; cart stays quickly reachable.
5. Commerce cart is labelled `장바구니` on Header accessible name and Cart overlay copy in scope.
6. Public catalog `컬렉션` language remains conceptually separate (Hero/Announcement/PDP-back unchanged).
7. Search is globally reachable in the customer shell and lands on `/?q=` Home results.
8. LoginModal and `/login` roles remain intact.
9. Home remains the catalog. No `/shop` or `/search` route.
10. Policy URLs and Footer crawlability remain intact.
11. Frozen Home/PDP layout/content unchanged except: Home headline/CTA stack; ProductTheatreRail four cart strings.
12. Limited Home headline/CTA exception is visually approved (Checkpoint 2).
13. `requestCustomAccess()` behaves consistently from Home CTA and mobile sheet.
14. Custom post-login continuation executes **once**; dismissal clears intent; ordinary login does not set Custom intent.
15. New controls have accessible names, keyboard behavior, and sensible focus (sheet/menu Escape/focus return at minimum).
16. Existing shared overlays (Cart, Profile, Workshop, LoginModal, policy modal) are not broken.
17. Checkpoint 1 and Checkpoint 2 user visual approvals pass; later Cart/PDP-term slice visual approval as applicable.
18. A5 targeted QA PASS on the revised A5 scope below.
19. No payment / Supabase / runtime authority boundary crossed.

---

## A5 scope (after visual approval)

- Home desktop headline + CTA
- Home mobile headline + CTA
- Frozen Home regression: Hero, grid, sort, cards
- Header Home top; Header Home scrolled; PDP Header
- Mobile menu/sheet
- Logged-out Home CTA → LoginModal
- Dismiss → no delayed Workshop
- Successful login → Workshop exactly once
- Logged-in Home CTA → Workshop
- Mobile sheet Custom logged-out and logged-in
- Global search from Home; from PDP → `/?q=`
- Header cart label
- Frozen PDP regression
- Later Cart/PDP terminology slice if completed

Do not recertify unrelated historic `#23` contracts.

---

## Do Not Do

- Do not implement AuthContext or UI from this note
- Do not assign A1–A6 from this note
- Do not touch uncommitted A1 WIP in a docs ticket
- Do not close/reopen NEW 2A; do not create NEW 2A-2; do not open NEW 2B–2F
- Do not restore persistent desktop Header Custom text
- Do not remove Custom from the mobile customer sheet
- Do not add `/workshop`, `/shop`, or `/search`
- Do not redesign frozen Home beyond the headline/CTA stack
- Do not expand PDP writes beyond the four rail strings
- Do not rename catalog “컬렉션” (Hero, AnnouncementBar, ProductDetail back)
- Do not copy Admin hamburger
- Do not duplicate primary nav into Footer
- Do not remove LoginModal or `/login`
- Do not persist Custom intent in storage/URL/cookie/DB
- Do not restyle Login/Profile/Cart visual systems (2C/2E/2F)
- Do not mutate Workshop internals, payment, Supabase, deploy, or Rules
- Do not deploy
- Do not mix A1 runtime WIP into a docs durability commit

Resume Condition: Orchestration review → durability strategy for these docs **while preserving A1 WIP** → then A0 AuthContext controlled write (not started here).

Ownership: A0 (this contract)

Relevant Files: `docs/decisions/NEW-2A_menu-ia-consistency.md`, `docs/METALORA_PROJECT_STATE.md`, `docs/decisions/NEW-1_launch-pipeline-v2.md` (pipeline definition, unchanged)
