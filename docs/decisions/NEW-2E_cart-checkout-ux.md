# NEW 2E — Cart / Checkout UX

Status: **OPEN**

Date: 2026-09-22

Decision: NEW 2E is **OPEN**. Scope is customer **Cart → Checkout → TEST payment-start → success/fail UX**. This is **not** production Toss activation, a real charge, a real-order dry run, backup/restore, deploy, or account/profile redesign.

Live payment remains **NEW 7**. NEW 6 remains the backup/restore hard gate before first live payment.

This note does **not** open NEW 2F. It does **not** authorize Workshop, Home/PDP, Header, WebGL, `App.tsx`, `server.ts`, production DB, or live Toss keys.

---

## Status

| Item | Value |
|------|--------|
| NEW 2 | **IN PROGRESS** |
| NEW 2A–2D | **CLOSED** — preserved |
| NEW 2E | **OPEN** |
| NEW 2F | **NOT OPENED** |
| Implementation shape | **SINGLE SLICE** |
| Primary owner | **A3** |
| Secondary owners | **NONE** by default |
| Backend / A6 | **NONE** by default — consume existing prepare/confirm |
| Live Toss | **PROHIBITED** in NEW 2E |
| Visual approval | **REQUIRED** |
| A5 QA | **REQUIRED** |
| Next | **A3 — NEW 2E CART / CHECKOUT UX IMPLEMENTATION** (not this ticket) |

---

## Locked flow

Cart overlay step 1 → Checkout step 2 (same overlay) → TEST payment-start → `/payment/success` or `/payment/fail`.

Do **not** create a new checkout route. Do **not** split 2E-A / 2E-B / 2E-C unless a later real dependency requires it.

---

## Application write set

### MUST

| Path | Purpose |
|------|---------|
| `src/components/Cart.tsx` | standard/custom presentation; Custom thumbnail geometry; trusted snapshot display; remove A4 leftover; mixed-cart consent scope; qty/remove a11y; loading vs empty; mobile Cart UX; checkout/order-summary consistency |
| `src/pages/PaymentSuccess.tsx` | remove unsupported simulation/product claims; keep confirm success UX; product-truth-aligned copy |

### MAY — only if implementation requires it

| Path | Limit |
|------|--------|
| `src/pages/PaymentFail.tsx` | fail recovery UX / direct 2E visual consistency — not cosmetic-only |
| `src/context/CartContext.tsx` | `price_snapshot` display/totals; cart fetch/load error — do not rewrite persistence/identity |

### Do not write by default

`src/App.tsx`, `server.ts`, Workshop, Home, PDP, Header, WebGL, account/profile surfaces.

---

## Custom cart contract (CONSUME NEW 2B)

| Role | Rule |
|------|------|
| Identity | `workshop-single` v1 |
| Display image | `custom_image` / preview artifact |
| Production master | original image unchanged |
| Composition | already persisted — do not rebuild in Cart |
| Customer price | trusted `price_snapshot` |
| Quantity | may change |

Do **not** recompute Custom price from live `custom_m_price`. Do **not** mutate original. Do **not** redesign Workshop. Do **not** replace snapshot authority. Payment amount remains server `/api/payment/prepare`.

---

## Confirmed NEW 2E issues (CURRENT)

### Custom thumbnail

Cart uses a fixed **96 × 96** square with `object-cover`, which crops landscape Custom compositions.

Required: respect portrait vs landscape; do not square-crop landscape artwork; use existing preview; do not recompute Workshop composition; usable at ~390 and ~1440. Do **not** redesign the entire Cart card merely to solve this.

### Custom size copy

Remove/correct stale Cart fallback `A4`. Accepted Custom size is **M**. No new size system.

### Custom price display

Prefer `price_snapshot`. Do not make Cart truth depend solely on `custom_config.price` when snapshot is available.

### Cart loading vs empty

Empty copy exists. Initial fetch/loading may resemble a true empty cart. Distinguish if current state supports it without a new async framework.

### Quantity / remove

Preserve data behavior. Add usable accessible names on + / − / remove. Touch targets practical. Do **not** auto-delete on minus-at-1 unless existing product behavior already requires it. Separate X removal is acceptable. Do not change Custom row identity.

### Mixed-cart consent copy

Refund/custom consent can apply Custom-made restrictions to the **entire** cart, including standard catalog items.

Do **not** overclaim Custom restrictions for standard catalog products. Do **not** invent new legal policy. Correct only inaccurate UI **scope**. If exact wording needs policy authority beyond known facts: **STOP** and report before inventing policy.

Known catalog facts (do not expand): change-of-mind within 7 days after receipt; buyer pays that return shipping; damage/defect/wrong item is seller-paid. Custom/Workshop cancellation is a **separate** policy and must not be silently applied to general catalog rows.

### PaymentSuccess truth copy

Remove unsupported simulation claims including **4K**, **180℃**, **승화전사**, **무타공**. Do not replace with new unsupported technical claims. Do not change confirm authority.

---

## Checkout form (keep)

Step 2 of Cart. Required: name, phone, zip, address, addressDetail. Daum postcode remains. Do **not** add email, delivery memo, address book, or account redesign unless an actual blocker appears.

Order summary: customer must verify item, option/orientation, quantity, line price, final-amount context. Custom representation must not contradict Cart. Do **not** invent shipping fees.

---

## Shipping / delivery boundary

No shipping-method picker, fee engine, Jeju surcharge calculator, or pickup. Not required for NEW 2E unless a concrete existing checkout blocker appears. Operations/legal fulfillment remains later stages.

---

## TEST payment-start (permitted)

Preserve: `/api/payment/prepare`; server-authoritative amount; TEST Toss widget; processing guards; consents; successUrl / failUrl.

Do **not** change to a live key. Do **not** activate production Toss. Do **not** perform a production payment. If implementation requires live Toss: **STOP**.

---

## Live Toss hard boundary

NEW 2E = **TEST only**. NEW 7 = live Toss activation.

Do **not**: add a live key; replace `test_ck_`; use a production payment secret; perform a real charge; alter the production payment environment; deploy payment activation.

Payment-test and production Supabase projects must never be confused. NEW 2E stage open **prohibits** production mutation. No environment mutation in this stage-open.

---

## Backend / A6

**NONE** by default. Consume existing `/api/payment/prepare` and `/api/payment/confirm`. A3 does **not** own amount validation, intent creation, confirmation, production webhook, or production payment keys.

---

## Frozen boundaries

- **NEW 2A CLOSED.** Header IA unchanged. Existing LoginModal may be consumed.
- **NEW 2B CLOSED.** Workshop Step 1/2, composition, durable upload, original/preview, trusted snapshot **creation**, Custom price authority, Add-to-Cart RPC — consume outputs only.
- **NEW 2C CLOSED.** Shared shell unchanged.
- **NEW 2D CLOSED.** Home-as-catalog, ProductCard, standard PDP, search/sort. 2E begins after Add-to-Cart.
- **NEW 2F NOT OPENED.** Do not redesign LoginModal, Profile, account settings, order history, wishlist, or address book. Existing profile shipping prefill/writeback may be consumed.

---

## Visual approval

**REQUIRED.** Minimum post-implementation matrix:

1. Cart empty — mobile ~390
2. Cart empty — desktop ~1440
3. Standard Cart item — mobile ~390
4. Standard Cart item — desktop ~1440
5. Custom portrait Cart item — mobile ~390
6. Custom portrait Cart item — desktop ~1440
7. Custom landscape Cart item — mobile ~390
8. Custom landscape Cart item — desktop ~1440
9. Checkout step 2 — mobile ~390
10. Checkout step 2 — desktop ~1440
11. PaymentFail — safe non-live state
12. PaymentSuccess — safe non-live state only

No production payment is required for visual approval.

---

## Acceptance criteria

1. Standard Cart item clearly shows product, option, quantity, remove, and option-derived line price.
2. Custom Cart item uses existing preview and respects portrait/landscape without incorrect square crop.
3. Custom displayed price uses trusted snapshot semantics; not recomputed from live Custom pricing.
4. Custom identity remains `workshop-single` v1.
5. Cart loading and true empty are distinguishable if current state supports it without architecture rewrite.
6. Quantity/remove remain correct and gain sufficient interaction labeling where missing.
7. Checkout remains Cart step 2; no new checkout route.
8. Required shipping fields and consents remain validated before TEST payment-start.
9. TEST payment-start uses server `/api/payment/prepare` amount.
10. Toss client remains TEST only.
11. PaymentSuccess removes unsupported product claims.
12. Mixed-cart consent copy does not falsely apply Custom-only restrictions to standard catalog products.
13. Cart/Checkout remain usable at ~390 and ~1440.
14. NEW 2B and NEW 2D remain frozen.
15. NEW 2F remains NOT OPENED.
16. No production DB mutation, live payment activation, or deploy.
17. User visual approval **PASS**.
18. A5 targeted QA **PASS**.
19. `npm run lint` **PASS**.
20. `git diff --check` **PASS**.

---

## Regression guards

- Custom display price still matches trusted `price_snapshot`
- prepare amount authority unchanged
- standard PDP add-to-cart still works
- repeated same-option standard add still merges
- Custom row identity unchanged
- Cart not cleared before successful confirmation
- TEST key remains test-only; no live key
- Workshop, Home/PDP, Profile/account UX untouched

---

## Do not do

- Implement Cart/Checkout in this stage-open ticket
- Open NEW 2F
- Touch `App.tsx` / `server.ts` / Workshop / Home / PDP / Header / WebGL by default
- Invent shipping fees or new legal policy
- Activate live Toss / deploy / mutate production DB

---

## Resume procedure

1. This note + `docs/METALORA_PROJECT_STATE.md` = SoT
2. Next: **A3 — NEW 2E CART / CHECKOUT UX IMPLEMENTATION**
3. Visual approval → A5 targeted QA → A0 closure
4. Do **not** start NEW 2F until its own PRE-STAGE REPORT is reviewed and OPEN READY

---

## Ownership (this note)

A0 — architecture / stage contract.

Implementation (not this ticket): **A3**.

## Relevant files

- MUST (A3): `src/components/Cart.tsx`, `src/pages/PaymentSuccess.tsx`
- MAY (A3): `src/pages/PaymentFail.tsx`, `src/context/CartContext.tsx`
- Frozen: Workshop, Home, PDP, Header, `src/App.tsx`, `server.ts`
