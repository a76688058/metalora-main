# NEW 2A — Global Menu / Information Architecture Consistency

Status: OPEN

Date: 2026-09-20

Decision: NEW 2A is **OPEN** as a docs/scope contract only. Implementation is **not** started. Writers are **not** assigned in this note. Execute only via later owner tickets after orchestration review.

This note does **not** open NEW 2B–2F. It does **not** authorize a public `/workshop` or `/shop`/`/search` route, Home CTA, Workshop internals, payment, Supabase, deploy, or Rules edits.

---

## Report conclusions (NEW 2A PRE-STAGE)

Current customer IA is Home-as-catalog + icon-only Header + overlay account/commerce.

- Custom is Profile-only and undiscoverable when logged out
- Search is Home-only (`/?q=` + Home gallery)
- Frame icon is labelled `내 컬렉션` but opens Cart
- LoginModal and `/login` both exist and both are required
- Footer is legal/company, not primary nav
- Frozen Home copy 「고르거나, 만들거나」 is not an entry and must not be turned into a Home CTA
- Mega-nav / Shop page / Admin hamburger copy are not justified

---

## Locked product decisions

### Custom 제작

Must be discoverable from customer navigation for **logged-out and logged-in** visitors. Must not require User → Profile → 커스텀 제작 to learn it exists.

Workshop **use** remains AUTH-GATED. No public Workshop implementation. No `/workshop` route in this stage. No Home CTA.

**Entry model:**

customer-visible nav entry
→ logged in: existing `openWorkshop()` / `WorkshopOverlay`
→ logged out: existing Header `LoginModal` with preserved Custom intent
→ after successful login/signup: continue into existing Custom path

**Pending-intent implementation (safer equivalent, preferred):**

Do **not** change Workshop internals, `AuthContext` overlay API, or `App.tsx` merely to store intent.

`Header` (A1) already mounts `LoginModal` and already can call `openWorkshop()`. Safer than threading a new LoginModal prop:

1. Custom click while logged in → `openWorkshop()`
2. Custom click while logged out → set Header-local `pendingCustomIntent` → open existing LoginModal
3. Header effect: if session user becomes present **and** `pendingCustomIntent` → `openWorkshop()` + clear intent
4. LoginModal dismiss without auth → clear intent
5. Ordinary User/Login click must **not** set Custom intent

`LoginModal.onSuccess` already exists (login and signup). Treat it as a secondary path; do not require a LoginModal write if Header session-watch is sufficient.

ProfileOverlay “커스텀 제작” may **remain** as an additional account path. Do not move Orders / 1:1 문의 / 프로필 수정 into Header.

### Desktop Header

**HYBRID.** Preserve minimal storefront character.

- Logo = Brand/Home
- 커스텀 제작 = clearly discoverable primary destination
- Account = utility
- Cart = clearly understandable commerce entry (`장바구니`)
- Theme = utility, not a destination
- Search = globally reachable
- No mega-nav, no category bar, no Shop nav item

Exact A1 visual (text label vs compact labelled control) is **not** selected here. Implementation ticket chooses the minimum form consistent with existing Header primitives (`IconButton` / A1 tokens). Do not copy Admin chrome.

### Mobile Header

**COMPACT LABELLED MENU / SHEET** rather than unbounded extra icons.

Labelled destinations/actions at minimum:

- 커스텀 제작
- 검색
- 로그인 / 내 정보 as applicable

Cart remains quickly reachable (existing Header control is acceptable).

Do **not** copy `AdminLayout` hamburger. Customer sheet uses customer UI system. Exact composition is A1 after this lock.

### Cart terminology

Commerce object: **`장바구니`**  
Public artwork/catalog concept may remain: **`컬렉션`**

These must no longer share IA meaning.

Migrate commerce-facing copy (Header accessible name, Cart title/step/empty, PDP add-to-cart strings in the frozen exception). Do **not** rename Home/Hero/Announcement/PDP-back “컬렉션” catalog language.

**Out of 2A (defer):**

- `WorkshopView` “내 컬렉션에 담기” → NEW 2B
- `PaymentSuccess` “내 컬렉션” → NEW 2E
- Unused `LanguageContext` strings → do not revive

### Search

Globally reachable from the normal customer shell. Results remain **`/?q=<query>`**. Home remains the results surface. From PDP/policy/other shell routes, search may navigate to Home results.

No `/shop`. No `/search`. No new catalog page.

Functional auth/noindex routes where Header is already hidden (`/login`, `/profile/complete`, `/auth/callback`, `/admin*`) stay exempt.

### Login

Keep both:

- LoginModal = contextual/in-page auth
- `/login` = ProtectedRoute / AuthCallback / recovery destination (noindex)

Do not remove either. Do not restyle in 2A (2C/2F).

### Catalog

**HOME-AS-CATALOG.** `/` = gallery/search results. `/product/:id` = PDP. No Shop/Collection route.

### Footer

Remains secondary / legal / company. Preserve crawlable `/policy/:type` (URL exists; modal intercept on unmodified same-tab click is allowed). Do not duplicate primary nav. Do **not** bury Custom exclusively in Footer. Additive Footer Custom is **not** required because Header/mobile sheet will carry Custom.

### Account / inquiry

Profile remains account hub. Orders and 1:1 문의 may stay account-gated. 제휴/입점 mailto stays B2B. NEW 2F owns account visual polish.

---

## Frozen-surface exception

Still FROZEN COMPLETE: Home/Hero, PDP Desktop, PDP Mobile Story, Product Truth, Mount/Included, OWC, Product Information, PDP Footer.

**Allowed 2A impacts:**

A. Shared Header (and mobile sheet) chrome required by IA  
B. Copy-only PDP commerce CTA in `src/components/pdp/ProductTheatreRail.tsx`:

| Current | Replacement |
|---|---|
| 내 컬렉션에 담기 | 장바구니에 담기 |
| 컬렉션에 담는 중... | 장바구니에 담는 중... |
| 컬렉션에 담겼습니다 | 장바구니에 담겼습니다 |
| 내 컬렉션으로 | 장바구니로 |

COPY ONLY. Minimum required strings. No layout, type, spacing, Story, WebGL, product-copy rewrite, or PDP architecture change.

Do **not** change `ProductDetail.tsx` “컬렉션으로 돌아가기” (catalog/Home language).

Exception requires **USER VISUAL APPROVAL** and targeted A5 PDP regression.

Footer file write is **not** in the WRITE SET unless a later ticket proves a minimum-impact additive link is necessary. Default: Footer unchanged.

---

## Exact WRITE SET

Authorized later-implementation files only. This note does not implement them.

### A1 (customer chrome)

- `src/components/Header.tsx` — **required**
- `src/components/CustomerNavSheet.tsx` (or equivalent **new** A1-owned customer labelled sheet; not Admin) — **only if** A1 extracts the mobile sheet from Header

### A3 (cart terminology)

- `src/components/Cart.tsx` — **required** (title, step label, empty state, and other **visible cart-commerce** `내 컬렉션` strings in this file)

### A2 (frozen PDP copy exception)

- `src/components/pdp/ProductTheatreRail.tsx` — **required**, copy-only strings listed above

### Explicitly NOT in 2A WRITE SET

- `src/App.tsx`
- `src/context/AuthContext.tsx`
- `src/context/ShellOverlayContext.tsx`
- `src/components/LoginModal.tsx` (unless a later implementation ticket proves Header session-watch is insufficient)
- `src/components/ProfileOverlay.tsx`
- `src/components/Footer.tsx`
- `src/pages/Home.tsx` / `src/components/hero/*`
- Workshop internals (`WorkshopOverlay`, `WorkshopView`, `CopyrightPage`)
- `src/components/ProductDetail.tsx`
- `src/pages/PaymentSuccess.tsx` / payment confirm paths
- `server.ts`, Supabase, GA4/consent, `package.json`, `.cursor/rules/*`

If implementation discovers LoginModal **must** change to preserve intent, STOP and return a dependency request. Do not silently expand.

---

## Ownership (not an implementation assignment)

| Area | Owner |
|---|---|
| Header / mobile customer sheet / nav primitives | A1 |
| Cart visible commerce terminology | A3 |
| PDP rail copy-only exception | A2 (one-time ticket; does not transfer PDP ownership) |
| App.tsx / AuthContext | A0 — **no write expected** |
| Workshop | A4/A2 under **NEW 2B**, not 2A |
| QA after visual approval | A5 READ ONLY |
| SEO/URL | A6 — **NONE expected** (no new public URL) |

Do not assign writers from this note.

---

## PROTECTED SET

- Frozen Home/Hero composition and copy (including 「고르거나, 만들거나」)
- Frozen PDP layout/Story/WebGL/Room Preview except the four rail strings
- Product-truth claims
- Workshop internals / public Workshop route
- Login visual system restyle
- `/login` route removal
- Policy URL crawlability / sitemap / robots
- Payment authority, Toss, `server.ts` payment
- Supabase, restore/backup (NEW 6)
- Analytics/consent
- Admin IA
- package.json / deploy / Cloud Run

---

## Collision / implementation order

Max 2 concurrent write agents. One file = one writer.

1. **A1** Header (+ optional sheet file) — Custom entry, global search, hybrid desktop, labelled mobile sheet, cart accessible name
2. **A3** `Cart.tsx` terminology — may run **after** A1 starts; do not parallel A1 on Header
3. **A2** ProductTheatreRail copy-only — disjoint from A1/A3 files; may run in parallel with A3 **after** A1 Header is the active chrome, or strictly after A3. Prefer **A1 then A3 ∥ A2** (two writers: A3 and A2) only when A1 Header is no longer an active writer
4. **A0 App.tsx** — not expected. If overlay orchestration fails, STOP for an A0 ticket

A1 must not edit Cart or PDP rail. A3 must not edit Header. A2 must not edit Header/Cart.

---

## Definition of Done

1. Custom is discoverable from customer navigation without entering Profile first (logged-out and logged-in).
2. Actual Custom/Workshop use remains auth-gated; no public Workshop; no `/workshop`.
3. Desktop Header follows the locked hybrid model (no mega-nav / Shop bar).
4. Mobile uses a compact labelled menu/sheet; destinations include Custom, Search, Login/내 정보; cart stays quickly reachable.
5. Commerce cart is labelled `장바구니` on Header accessible name and Cart overlay copy in scope.
6. Public catalog `컬렉션` language remains conceptually separate (Home/Hero/PDP-back unchanged).
7. Search is globally reachable in the customer shell and lands on `/?q=` Home results.
8. LoginModal and `/login` roles remain intact.
9. Home remains the catalog. No `/shop` or `/search` route.
10. Policy URLs and Footer crawlability remain intact.
11. Frozen Home/PDP layout/content unchanged except the authorized ProductTheatreRail cart-term strings.
12. New controls have accessible names, keyboard behavior, and sensible focus (sheet/menu Escape/focus return at minimum).
13. Existing shared overlays (Cart, Profile, Workshop, LoginModal, policy modal) are not broken.
14. USER VISUAL APPROVAL passes (Header/mobile sheet + PDP CTA string).
15. A5 targeted QA PASS on: Home top; Home scrolled; PDP desktop; PDP mobile story; global search path; logged-out Custom entry; logged-in Custom entry; LoginModal; Cart; Profile; policy/Footer.
16. No payment / Supabase / runtime authority boundary crossed.

---

## Visual approval / A5

Visible chrome. Do **not** send to A5 before USER VISUAL APPROVAL.

A5: READ ONLY. Targeted surfaces listed in DoD item 15. Do not recertify unrelated historic `#23` contracts.

---

## Do Not Do

- Do not implement UI from this note
- Do not assign A1–A6 from this note
- Do not open NEW 2B–2F
- Do not add `/workshop`, `/shop`, or `/search`
- Do not add a Home Custom CTA
- Do not redesign frozen Home/PDP
- Do not expand PDP writes beyond the four rail strings
- Do not rename catalog “컬렉션” (Hero, AnnouncementBar, ProductDetail back)
- Do not copy Admin hamburger
- Do not duplicate primary nav into Footer
- Do not remove LoginModal or `/login`
- Do not restyle Login/Profile/Cart visual systems (2C/2E/2F)
- Do not mutate Workshop internals, payment, Supabase, deploy, or Rules
- Do not deploy

Resume Condition: Orchestration review of this OPEN contract → separate owner implementation tickets. Visual approval then A5.

Ownership: A0 (this contract)

Relevant Files: `docs/decisions/NEW-2A_menu-ia-consistency.md`, `docs/METALORA_PROJECT_STATE.md`, `docs/decisions/NEW-1_launch-pipeline-v2.md` (pipeline definition, unchanged)
