# NEW 2B — Custom Creation UX/UI

Status: OPEN

Date: 2026-09-21

Decision: NEW 2B is **OPEN**. User/orchestration review of the A0 PRE-STAGE REPORT is complete. Product direction is **locked**. This note is the durable contract.

This note does **not** authorize runtime source writes by itself. First implementation slice is **2B-1** (separate A2 ticket). It does **not** open NEW 2C–2F. It does **not** authorize a public `/workshop` route, live Toss, payment activation, backup/restore, deploy, or Rules edits.

---

## Status

| Item | Value |
|------|--------|
| NEW 2A | **CLOSED** — preserved |
| NEW 2B | **OPEN** |
| NEW 2C–2F | **NOT OPENED** |
| Historical `#16`–`#23` | **CLOSED** |
| 2B-0 Decision lock | **this note** |
| Next slice | **2B-1** Workshop stability / IA foundation (A2) |
| Source implementation | **not started** |

---

## Locked product decisions

### A. Entry / exit origin

Workshop exit/back returns to the **origin surface**.

| Origin | Exit / back |
|--------|-------------|
| Home `커스텀 제작 →` | Home |
| Profile `커스텀 제작` | Profile |

Do **not** always force Profile. Use the minimum in-memory origin state. No URL / cookie / localStorage persistence for origin unless existing architecture already requires it.

2A entry architecture is **frozen**: Home CTA → `requestCustomAccess()` → logged out: Header LoginModal → AuthContext continuation → Workshop. Logged in: Workshop. Auth-gated use. No public `/workshop`. Do **not** move login after upload in NEW 2B.

### B. Custom price

Hardcoded `49000` is **not** the final architecture.

Approved:

- Custom product price is **admin-configurable from `/admin`**
- Workshop reads the **same** authoritative source
- Cart receives a **price snapshot** at add-to-cart
- No duplicated price constants
- No invented replacement number in UI or docs

**Read-only residual (2B-0):** there is **no** suitable existing admin Custom-price field.

| Current source | Role |
|----------------|------|
| `WorkshopView.tsx` `49000` | client display + `custom_config.price` + analytics |
| `Cart.tsx` / `CartContext` | display snapshot from `custom_config.price` |
| `server.ts` `SERVER_WORKSHOP_UNIT_PRICE = 49000` | **A6 payment authority** — “never trust client `custom_config.price`” |
| `/admin/products` | catalog `products.options[].price` only; Custom is **not** a catalog product row |

2B-5 must **audit then design**, not invent a second system. If catalog products cannot be reused without fabricating a `workshop-single` product, a dedicated A6/A3-compatible price-authority ticket is required. Do **not** implement price infrastructure in 2B-1.

### C. Custom size

Current Custom service: **M ONLY**.

Finished size: **200 × 283 mm** (confirmed).

Supersede: A4 **210 × 297 mm**. Do not present size as an active choice. Remove or hide disabled `Custom Size / Coming Soon` unless a later roadmap reintroduces it.

Preferred information (not a picker):

`메탈 프린트 · M`  
`200 × 283 mm`

### D. AI / image processing

Production AI upscaling is part of the **real output process**.

Browser UI must **not** claim an immediate 4K transformation or generative fill if the UI does not perform that work.

- Remove misleading `4K 변환`
- Remove misleading generative `AI가 채웁니다` style language
- Preserve real current fit/space preview behavior
- Rename with factual Korean matching actual behavior

Preferred customer-facing fit labels (or equivalent factual Korean):

- `채우기`
- `전체 보기`

Production AI upscaling may be explained only in wording that matches the real production workflow. Do **not** present non-executing toggles as live AI processing. Do **not** reintroduce 4K / 8K / unverified sharpness guarantees.

### E. Crop

Approved **if technically feasible**.

- Customer can position / zoom / crop the uploaded image
- Crop / aspect reference follows finished product ratio **200:283**
- Portrait / landscape orientation respected
- Image-editing UX — do **not** couple to WebGL internals unnecessarily
- Do **not** silently invent destructive processing
- If an external library is required: **report before adding a dependency**

Crop is **2B-3**, not 2B-1 (unless trivially present already — it is not).

### F. Flow shape

Keep a **3-step** flow. **Restructure.** Do not keep material/size-selection-first. Do not create a one-page mega-form.

Agreement remains a **gate before numbered steps**, not Step 1. Presentation/layout may improve. Do **not** silently rewrite legal substance (`ML_Legal_v260325`). Legal copy changes need user/counsel/A6 review.

```
AGREEMENT GATE (unnumbered)
  ↓
STEP 1 — 이미지 만들기
  orientation · upload · validation · crop · position/zoom · fit · quality guidance
  ↓
STEP 2 — 미리보기
  final image · product preview · 내 공간에 걸어보기 · 3D로 보기
  ↓
STEP 3 — 최종 확인
  final image · M / 200×283 mm · orientation · current Custom price
  production 2–5 business days · delivery 1–3 business days
  장바구니에 담기
```

---

## Upload-first principle

The first meaningful customer action is **UPLOAD / CREATE**, not fake option selection.

Because material is aluminum-only and size is M-only, those are **product information**, not large selection UI.

Actual interactive selection in 2B:

- portrait / landscape
- uploaded image
- crop / position
- fit mode (`채우기` / `전체 보기`)

---

## Image quality guidance

Add validation / quality feedback. Separate:

1. file type
2. file size
3. dimensions / resolution guidance
4. production quality guidance

Example UX (copy may be finalized in implementation):

- success: `출력에 적합한 이미지입니다.`
- warning: `이미지 해상도가 낮습니다. 더 큰 원본을 권장합니다.`

Do **not** invent numeric DPI/resolution thresholds. Thresholds require verified production requirements (A6/fact confirmation). 2B-2 may ship the **framework** with type/size checks first.

No production uploads during QA.

---

## PDP preview reuse

Custom must use the **same** customer-facing preview capabilities as PDP:

- `내 공간에 걸어보기`
- `3D로 보기`

Do **not** create visually similar Workshop-only duplicates if PDP implementation can be reused.

Preferred architecture: shared product-preview capability; Custom feeds the customer's **final uploaded/cropped image** as artwork source.

Requirements: same design language, same icon treatment, same interaction where practical, mobile + desktop, **no Workshop-only 3D engine fork**.

A4 owns WebGL internals. A2 owns surrounding Workshop UI. If shared extraction is required, sequence writers so A2 and A4 do **not** edit `WorkshopView.tsx` at the same time.

Room Preview remains **zero WebGL**. Story Canvas / 3D Viewer Canvas coexistence rules in spatial contracts still apply.

---

## Layout principle

Do **not** shrink the desktop layout onto mobile.

| Viewport | Pattern |
|----------|---------|
| Desktop (~1440) | large preview + side control panel |
| Mobile (~390) | preview → editing controls → sticky primary CTA |

Same functionality. Different composition. Keep mobile density low. Avoid long neon-style stacked cards.

---

## Exit / unsaved work

- No meaningful work → exit immediately to origin.
- Uploaded/edited meaningful work → lightweight confirm. Intent: `제작을 종료할까요?`

Do **not** promise persistence unless it really exists. Exact copy is finalized after persistence behavior is verified in implementation.

---

## Price visibility

Show the current Custom price **early enough** for an informed decision. Do not hide it until the last click. Source must be the authoritative admin-managed value. No duplicated hardcoded numbers. Until 2B-5, 2B-1 must **not** invent a new display constant.

---

## SLA (confirmed)

| Item | Value |
|------|--------|
| Production | **2–5 business days** |
| Delivery | **1–3 business days after dispatch** |

Replace Workshop copy that conflicts (including Custom-only **14-day** claims). No Custom-only SLA unless a later decision changes this.

---

## Cart terminology

Workshop CTA: **`장바구니에 담기`**.

Do **not** use `내 컬렉션에 담기`. Preserve NEW 2A commerce terminology. Catalog language (`컬렉션으로 돌아가기`) is unchanged.

---

## Conversion / funnel goals

- Minimize non-choice steps
- Move the user to upload quickly
- Only show controls that actually change the result
- Remove fake/disabled feature clutter
- Expose price early
- Show image quality feedback
- Use real product previews
- Preserve progress where technically reliable
- Reduce mobile density
- Keep the primary CTA clear at each step

Do **not** invent scarcity, urgency, or deceptive claims.

---

## Analytics / funnel plan (2B-7 — not this ticket)

Plan these events **if** they fit the existing `track()` / `AnalyticsEventMap` architecture (`src/lib/analytics.ts`, A6):

`custom_open` · `custom_agreement_complete` · `custom_upload_start` · `custom_upload_success` · `custom_upload_rejected` · `custom_crop_complete` · `custom_room_preview_open` · `custom_3d_preview_open` · `custom_step_2` · `custom_add_to_cart` · `custom_exit`

Current map is commerce-only (`page_view`, `view_item`, `add_to_cart`, checkout/payment). Adding Custom events is **A6** via the existing `track()` contract — no second plumbing. Do **not** implement analytics in 2B-1.

---

## Remove / fix targets (bounded)

- dead `navigate('/workshop/single')`
- unconditional Profile return
- fake 4K / AI processing wording
- fake generative-fill wording
- A4 210 × 297
- hardcoded price (**display path in later 2B-5; do not invent a new number in 2B-1**)
- conflicting SLA text
- `내 컬렉션에 담기`
- unvalidated upload + weak failure feedback
- incomplete resume state where feasible
- unused draft/storage keys if confirmed dead
- misleading sample / Unsplash placeholder
- inconsistent `alert()` error handling

Do **not** broaden into generic cleanup.

---

## Implementation slices

| Slice | Owner | Focus | Visual | Notes |
|-------|--------|--------|--------|--------|
| **2B-0** | A0 | this decision lock / OPEN | no | docs only |
| **2B-1** | A2 | overlay origin exit; kill dead route; upload-first 3-step IA; cart term; false copy; M + SLA; no Crop; no WebGL internals | **required** | first source slice |
| **2B-2** | A2 | file validation, errors, quality-feedback framework | yes | A6 fact confirmation for thresholds |
| **2B-3** | A2 | crop / zoom / position; 200:283; orientation; fit | yes | report before new dependency |
| **2B-4** | A2 UI; A4 WebGL only if required | PDP `내 공간에 걸어보기` / `3D로 보기` reuse; customer image as source | yes | no simultaneous WorkshopView writers |
| **2B-5** | A0/A3/A6 per discovered architecture | admin Custom price; Workshop read; cart snapshot | yes if UI | no live payment; no second price system |
| **2B-6** | A2 | 390 / 1440; sticky CTA; density; no 2C token refactor | **required** | |
| **2B-7** | A6 | funnel hooks via existing analytics | no | |
| **2B-8** | A5 **READ ONLY** | full Custom journey QA | after visual | |

---

## Ownership / collision

- Max **2** concurrent writers. One file = one writer.
- `WorkshopView.tsx` default writer = **A2**. A4 must **not** edit it at the same time.
- A4 only touches WebGL / shared preview internals when explicitly assigned (2B-4).
- If extraction is needed: extract first, then parallel on disjoint files.
- A5 READ ONLY.
- A6 owns RED / storage / production / config / payment authority / `server.ts` / `src/lib/analytics.ts`.
- A1 Header **frozen**.
- A0 AuthContext / App.tsx **frozen** unless a real integration blocker appears.
- Do not change shared `artwork3d` / Hero defaults for Workshop cosmetics.

---

## Protected contracts (must not regress)

- NEW 2A CLOSED: Home `커스텀 제작 →`; Header five-icon chrome; no CustomerNavSheet; `requestCustomAccess()`; Header LoginModal bridge; Home typography; cart term `장바구니` on Header / Cart / PDP rail
- No public `/workshop`
- Auth-gated Workshop
- Aluminum-only current product
- `workshop-single` cart identity
- Historical `#16`–`#23` CLOSED
- PDP / Home frozen except 2A exceptions and **2B-4 shared preview reuse** (not a PDP redesign)
- Product-truth holds (no 4K/8K/영원히/벽 손상 없음)
- Payment / Toss / NEW 6 / deploy / secrets

---

## Out of scope (NEW 2B)

NEW 2C global shell cleanup · NEW 2D catalog · NEW 2E checkout redesign · NEW 2F account · NEW 3 admin visual rewrite (except the minimum Custom-price control required by 2B-5) · live Toss · production payment · backup/restore · launch/legal conclusions · broad WebGL refactor · generic code cleanup · login-after-upload experiment

---

## Blocker / open item

None that block **2B-1**.

Must be resolved before later slices, not by inventing facts in 2B-1:

1. Admin Custom-price source (2B-5) — none exists today; server already has `SERVER_WORKSHOP_UNIT_PRICE`
2. Upload dimension/DPI thresholds (2B-2) — need production fact confirmation
3. Crop library vs in-house (2B-3) — report before dependency
4. Shared PDP preview extraction vs local reuse (2B-4) — A2/A4 sequencing
5. `user_progress` completeness vs honest exit copy (2B-1 copy after persistence verified)

---

## Do not do

- Start source in this 2B-0 ticket
- Deploy / Cloud Run / production Supabase mutation / storage-policy change / Toss / secrets
- Reopen NEW 2A Header / Home CTA / auth architecture
- Invent crop in 2B-1
- Touch WebGL internals in 2B-1
- Invent a replacement price number
- Claim persistence that does not exist
- Fork a Workshop-only 3D engine
- Dual-write `WorkshopView.tsx`

---

## Resume procedure

1. This note + `docs/METALORA_PROJECT_STATE.md` = SoT
2. Next: **A2 — 2B-1** Workshop stability / IA foundation
3. Visual checkpoint after 2B-1
4. Do not skip slices to jump to Crop / WebGL / price / analytics

---

## Ownership (this note)

A0 — architecture / stage contract.

## Relevant files (implementation; not written in 2B-0)

- `src/components/WorkshopOverlay.tsx`
- `src/components/Workshop/CopyrightPage.tsx`
- `src/components/Workshop/WorkshopView.tsx`
- later: Cart / admin / `server.ts` / PDP theatre / `artwork3d` / `src/lib/analytics.ts` per slice
- 2A frozen: `src/pages/Home.tsx`, `src/components/Header.tsx`, `src/context/AuthContext.tsx`
