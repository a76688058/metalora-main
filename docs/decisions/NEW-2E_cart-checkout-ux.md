# NEW 2E — Cart / Checkout UX

Status: **CLOSED**

Date: 2026-09-23

Decision: NEW 2E is **CLOSED**. Customer **Cart → Checkout → TEST payment-start → success/fail UX** is complete at source/UX. This is **not** production Toss activation, a real production charge, a real-order dry run, backup/restore, deploy, or account/profile redesign.

Live payment remains **NEW 7**. NEW 6 remains the backup/restore hard gate before first live payment.

This note does **not** open NEW 2F. It does **not** authorize Workshop, Home/PDP, Header, WebGL, `App.tsx`, `server.ts`, production DB, or live Toss keys.

---

## Status

| Item | Value |
|------|--------|
| NEW 2 | **IN PROGRESS** |
| NEW 2A–2D | **CLOSED** — preserved |
| NEW 2E | **CLOSED** |
| NEW 2F | **NOT OPENED** |
| Implementation shape | **SINGLE SLICE** |
| Primary owner | **A3** |
| Backend / A6 | **NONE** — existing prepare/confirm consumed unchanged |
| Live Toss | **NOT ACTIVATED** |
| Visual approval | **PASS** |
| A5 targeted QA | **PASS** |
| A5 final delta QA | **PASS** |
| Next governance action | **A5 — NEW 2E CLOSURE PACKAGE QA** then A0 final docs+source commit (not this ticket). Do **not** open 2F from this note. |

---

## 1. Scope

NEW 2E = Cart overlay step 1 → Checkout step 2 (same overlay) → TEST payment-start → `/payment/success` or `/payment/fail`.

Not in scope: live Toss, production payment, production 2B rollout, NEW 6, NEW 7, NEW 8, NEW 2F, shipping-fee engine, address book, account redesign.

---

## 2. Final architecture

Checkout remains Cart overlay step 2. No `/cart` route. No new Checkout route. `App.tsx` and `server.ts` unchanged.

Payment amount authority remains `/api/payment/prepare`. Confirmation authority remains `/api/payment/confirm`. Cart rows clear only after successful confirmation.

---

## 3. Cart contract

- Standard catalog items: product identity, selected option, quantity, remove, option-derived price, same-option merge, existing image authority.
- Custom identity remains `workshop-single` v1.
- Custom preview authority = `custom_image` (display artifact). Production master / original is not substituted.
- Composition is not recomputed in Cart.
- Quantity/remove preserved. Minus-at-1 does not auto-delete.
- Loading is distinct from empty. Fetch failure has retry. Quantity/remove failures get visible feedback. No global error framework.
- Accessible names: Cart close, quantity decrease/increase, remove. Row selection remains; inner controls do not select the row.
- Usable at representative mobile and desktop sizes.

---

## 4. Custom thumbnail geometry

Portrait uses a portrait frame. Landscape uses a landscape frame. Rendering is orientation-aware `object-contain`. No fixed-square destructive crop. Orientation: `item.orientation` then `custom_config.orientation`.

---

## 5. M size handling

Stale customer-facing `A4` is not shown as the default Custom size. Compatibility display: blank / stale `A4` → **M**. No new size architecture.

---

## 6. Custom `price_snapshot` authority

Customer display/total precedence:

1. trusted `price_snapshot`
2. legacy `price`
3. `0`

No live `custom_m_price` recomputation. No snapshot-creation rewrite. Quantity multiplies the stored trusted unit price. Server payment amount remains `/api/payment/prepare`.

---

## 7. Checkout architecture

Required fields unchanged: name, phone, zip, address, addressDetail. Daum postcode preserved. LoginModal consumed as-is. Profile shipping prefill/writeback preserved. No NEW 2F redesign.

---

## 8. Order summary

Checkout step 2 shows thumbnail, title, size/orientation, quantity, and line price. Custom thumbnail follows the same orientation-aware preview contract as Cart.

---

## 9. Mixed-cart consent correction

Custom-only cancellation/refund restriction copy is scoped to **커스텀 제작 상품** (`hasWorkshopItems`). It is not represented as applying to all standard catalog products. No new unsupported legal policy was invented.

Known catalog facts (unchanged, not expanded): change-of-mind within 7 days after receipt; buyer pays that return shipping; damage/defect/wrong item is seller-paid.

---

## 10. PaymentSuccess truth correction

Removed customer-facing unsupported claims: **4K**, **180℃**, **승화전사**, **무타공**, decorative Live. Replacement is factual order-progress language only (`결제가 확인되었습니다` / `주문을 접수했습니다` / `제작 준비를 진행합니다` / `배송 준비 단계입니다`). Confirm authority unchanged.

---

## 11. PaymentSuccess final layout fix

Validated uncommitted delta in `src/pages/PaymentSuccess.tsx` (A3; part of this closure package, **not yet committed**):

- `주문번호` label stays on one line (`shrink-0 whitespace-nowrap`)
- long `orderId` wraps safely (`break-all`, `min-w-0`)
- copy control retained (`shrink-0`)
- no horizontal overflow
- actual post-confirm success UI visually approved

Do not treat the invalid-parameter `/payment/success` error state as this review.

---

## 12. TEST payment success/fail evidence

- PaymentFail TEST cancellation/recovery: USER verified as normal. `PaymentFail.tsx` unchanged.
- PaymentSuccess actual successful TEST path: **VERIFIED**. Toss TEST payment completed. `/api/payment/confirm` completed successfully. Real post-confirm screen displayed.
- No live Toss. No production payment. No deploy.

Implementation checkpoint (Cart + CartContext + initial PaymentSuccess truth copy):

`5ed01ae2b39d93b586e3e3c8846969ba48598e84` — `feat(cart): complete NEW 2E cart checkout UX`

Final layout delta: dirty `src/pages/PaymentSuccess.tsx` (this package).

---

## 13. Payment-test key-pair incident and resolution

During final PaymentSuccess verification, initial TEST confirm failed with provider `INVALID_API_KEY` because payment-test Toss **client/secret merchant pairing** was mismatched (`test_ck` family client vs a different TEST secret family/merchant). This was **payment-test configuration**, not a NEW 2E source/backend defect.

The USER corrected the local gitignored `.env.payment-test.local` secret to the matching TEST secret and restarted payment-test runtime. The TEST success flow then confirmed.

Do **not** write secret values. Do **not** characterize a TEST secret family generically as invalid. No production mutation. No live key. No source/backend fix required.

---

## 14. TEST / live boundary

Toss client remains TEST (`test_ck_`). No live key introduced. `server.ts` unchanged. Production Toss live keys **NOT ACTIVATED**. Real production payment **NOT PERFORMED**. Production DB mutation **NONE**. Deployment **NONE**.

NEW 2E closure does **not** imply production payment readiness. NEW 6 still blocks NEW 7.

---

## 15. Production 2B rollout deferred

**NOT PERFORMED.** Still deferred: trusted Custom RPC production rollout (2B-5A), workshop Storage contract production rollout (2B-5C), related server/runtime production promotion if required.

This does **not** block NEW 2E closure. It **does** remain a later production-launch readiness dependency.

---

## 16. Payment-test artifacts

**MAY REMAIN.** Possible residuals: test Custom cart rows, workshop original/preview objects, payment-test payment/order intent artifacts from normal TEST flow.

Cleanup is **not** a NEW 2E closure blocker. Do not claim KNOWN CLEAN.

---

## 17. USER visual approval

**PASS**

Reviewed: Cart empty; standard Cart; Custom portrait/landscape Cart; Checkout step 2; TEST PaymentFail / cancellation recovery; responsive mobile/desktop; payment-test Custom runtime; **actual post-confirm PaymentSuccess** after successful Toss TEST confirmation (including the order-number layout fix).

Not: production payment approval, production 2B rollout, live Toss, NEW 2F.

---

## 18. A5 QA

- A5 targeted QA (implementation checkpoint): **PASS**
- A5 final PaymentSuccess delta QA: **PASS**

---

## 19. No deploy / no live payment

No production deploy. No production DB mutation. No live Toss activation. No production payment. Closure is source/UX/governance only.

---

## 20. Closure status

**CLOSED** (docs write; package not yet committed).

Frozen boundaries preserved: NEW 2B Workshop architecture, NEW 2D storefront, Home/Hero, PDP, Header, Account/Profile, Admin, `App.tsx`, `server.ts` — except consuming existing `/api/payment/prepare` and `/api/payment/confirm`.

Do **not** start NEW 2F until its own A0 PRE-STAGE REPORT is reviewed and OPEN READY.

---

## Application write set (completed)

### MUST

| Path | Result |
|------|--------|
| `src/components/Cart.tsx` | committed in `5ed01ae` |
| `src/pages/PaymentSuccess.tsx` | truth copy in `5ed01ae`; final order-number layout delta still dirty in this package |

### MAY

| Path | Result |
|------|--------|
| `src/pages/PaymentFail.tsx` | **UNCHANGED** |
| `src/context/CartContext.tsx` | committed in `5ed01ae` — loading/error/retry + snapshot totals only |

---

## Regression guards (must not regress)

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

- Open NEW 2F from this closure
- Touch `App.tsx` / `server.ts` / Workshop / Home / PDP / Header / WebGL
- Invent shipping fees or new legal policy
- Activate live Toss / deploy / mutate production DB
- Claim production 2B rollout or launch readiness
- Write MASTER PIPELINE v3 from this note

---

## Resume procedure

1. This note + `docs/METALORA_PROJECT_STATE.md` = SoT
2. Next: **A5 — NEW 2E CLOSURE PACKAGE QA** (docs + uncommitted PaymentSuccess delta)
3. Then A0 final closure commit of the three dirty files (authorized separately)
4. Do **not** start NEW 2F until its own PRE-STAGE REPORT is reviewed and OPEN READY

---

## Ownership (this note)

A0 — architecture / closure record.

Implementation: **A3**.

## Relevant files

- Committed: `src/components/Cart.tsx`, `src/context/CartContext.tsx`, `src/pages/PaymentSuccess.tsx` @ `5ed01ae`
- Uncommitted closure-package delta: `src/pages/PaymentSuccess.tsx` (order-number wrap)
- Frozen: Workshop, Home, PDP, Header, `src/App.tsx`, `server.ts`
