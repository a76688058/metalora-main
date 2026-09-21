# NEW 2B — Custom Creation UX/UI

Status: **CLOSED**

Date: 2026-09-22

Decision: NEW 2B Custom Creation UX is **CLOSED**. Source/UX implementation, user visual approval, payment-test E2E, A5 targeted QA, and A0 checkpoint audits **PASS**. This note is the durable contract.

This note does **not** open NEW 2C–2F. It does **not** authorize production DB/Storage apply, Cloud Run deploy, live Toss, or application-source edits.

---

## Status

| Item | Value |
|------|--------|
| NEW 2 | **IN PROGRESS** |
| NEW 2A | **CLOSED** — preserved |
| NEW 2B | **CLOSED** — source/UX complete; production rollout **not** complete |
| NEW 2C–2F | **NOT OPENED** |
| Historical `#16`–`#23` | **CLOSED** |
| Next governance action | **A0 PRE-STAGE REPORT — NEW 2C** (do not open 2C from this note) |

---

## Final product contract (CURRENT)

### Flow

Two numbered steps only. The original 2B-0 **3-step** plan is **SUPERSEDED**.

Agreement remains an **unnumbered gate** before steps (`ML_Legal_v260325`). Do not silently rewrite legal substance.

```
AGREEMENT GATE (unnumbered)
  ↓
1/2 이미지 편집
  upload-first · orientation · pan · zoom · qualitative guidance · authoritative price
  CTA: 다음으로
  ↓
2/2 제품 미리보기
  same composition · product facts · Room / 3D · authoritative price
  CTA: 장바구니에 담기
```

No Step 3. No extra edit button on Step 2. Back from Step 2 returns to Step 1.

### Product

- Custom **M only**. Not A4. Not a size picker.
- Finished size: **200 × 283 mm** (portrait **200:283**, landscape **283:200**)
- Material: **aluminum**
- Customer identity: `메탈 프린트 · M` / `200 × 283 mm`
- SLA: production **2–5 business days**; delivery **1–3 business days after dispatch**
- Workshop CTA: **`장바구니에 담기`** (not `내 컬렉션에 담기`)

### Step 1 (user visual approval: PASS)

Upload-first editor; fixed product-frame composition; pan; zoom; portrait / landscape; rounded visual product frame; qualitative safe-area copy; upload / change image; AI upscale **informational** copy only; excessive-zoom qualitative warning; authoritative Custom M price.

**No** fit / fill / all-view / reset product-control set. Original 2B-0 fit-mode labels (`채우기` / `전체 보기`) are **SUPERSEDED** and must not be presented as current UI.

### Step 2 (user visual approval: PASS)

Same canonical composition; product preview; M / 200 × 283 mm; authoritative price; orientation fact; production / delivery SLA; cancellation/final notice; `내 공간에 걸어보기`; `3D로 보기`; Add-to-Cart.

### Composition (CURRENT)

Canonical persisted model:

```
CustomComposition {
  version: 1,
  orientation,
  zoom,
  offsetX,
  offsetY
}
```

`source_width` / `source_height` stored separately. No persisted CSS-pixel state. No `fitMode`. The same composition drives the persistent customer preview (JPEG, long edge 1600 — UI derivative, not the print master).

### Price (CURRENT)

Authority: **`site_settings.custom_m_price`**.

- Admin `/admin/products`: reads/writes this key only. User visual approval **PASS**.
- Workshop Step 1 and Step 2: live display from the same key. User visual approval **PASS**.
- Cart / payment: DB **trusted snapshot** on complete v1. Client must not author trusted price.

Hardcoded `49000` / `SERVER_WORKSHOP_UNIT_PRICE` is **historical 2B-0 residual**, not current behavior.

### Durable handoff (CURRENT)

Original production source:

`workshop/originals/<uid>/<unique-id>.<ext>`

Persistent composed preview:

`workshop/previews/<uid>/<unique-id>.jpg`

Complete v1 Cart row persists: `original_image_url`, `preview_image_url`, composition, `source_width`, `source_height`, orientation, trusted price snapshot.

- `custom_image` = `preview_image_url` (Cart/PDP display alias)
- Production/print master = `original_image_url`
- Customer display derivative = `preview_image_url`
- New files: local validate/keep; upload only at Add-to-Cart. No bucket-root upload.
- Historic remote originals may be reused.

### Lifecycle (CURRENT)

| Path | Behavior |
|------|----------|
| Home → Custom → true exit | Home |
| Profile → Custom | Profile closes while Workshop is active |
| Profile origin, true exit/cancel | Profile may restore |
| Successful Add-to-Cart | non-restoring Workshop completion → Cart opens → Profile does **not** reopen |

2A entry remains frozen: Home `커스텀 제작 →` → `requestCustomAccess()`; logged out uses Header LoginModal continuation; logged in opens Workshop. Auth-gated. No public `/workshop`.

Payment-test E2E for this lifecycle: **PASS**.

---

## Checkpoints

| SHA | Message |
|-----|---------|
| `b37c1f75afa2171d6f5c48dab7b891952f17cdb5` | `docs(project): open NEW 2B custom creation UX` |
| `0a65c2415a40ec0d3dd969874056ce21af62326b` | `feat(custom): establish two-step creation workflow` |
| `2e06be9c71c0376c06697a7e40de0a4036ff90b2` | `feat(custom): add trusted cart snapshot contract` |
| `97f2f1daeecf49342a9f3f12db75728fccd48941` | `feat(custom): complete durable cart handoff` |

---

## Validation evidence

- Step 1 visual approval **PASS**
- Step 2 visual approval **PASS**
- same-canvas behavior **PASS**
- Admin Custom M price UI **PASS**
- Workshop Step 1 price **PASS**
- Workshop Step 2 price **PASS**
- Profile → Custom → Cart lifecycle **PASS**
- payment-test 2B-5A contract **PASS**
- payment-test Storage contract **PASS**
- real browser Add-to-Cart E2E **PASS**
- double-submit **PASS**
- payment-test cleanup **PASS**
- A5 targeted QA **PASS**
- A0 checkpoint audit **PASS**

Do **not** claim production validation.

---

## Original slice reconciliation

Planning slices from 2B-0 are **not** still actionable.

| Slice | Closure status |
|-------|----------------|
| **2B-0** | COMPLETED — this note (now CLOSED) |
| **2B-1 – 2B-4** | COMPLETED / superseded into the approved two-step UX checkpoint |
| **2B-5** | COMPLETED at **source / payment-test** (Admin price, Workshop price, trusted RPC, durable original/preview, Storage contract) |
| **2B-6** | SATISFIED by approved desktop ~1440 panel + mobile sticky CTA density |
| **2B-7** | **DEFERRED** — optional Custom `custom_*` funnel events; conversion `add_to_cart` already fires. Not a closure blocker |
| **2B-8** | **SATISFIED** by accumulated visual + E2E + A5/A0 evidence. Do not invent a new QA ticket |

Do not create a new 2B-6 / 2B-7 / 2B-8 task.

---

## Production rollout — NOT COMPLETE

NEW 2B **source / UX**: COMPLETE / CLOSED.

Production rollout is **later launch-gate work**. Do not write “fully live”, “production complete”, or “payment launched”.

| Item | State |
|------|--------|
| Production 2B-5A DB migration | **NOT APPLIED** |
| Production 2B-5C Storage migration | **NOT APPLIED** |
| new `server.ts` / payment logic | **NOT DEPLOYED** |
| Production Cloud Run | **UNCHANGED** |
| Live Toss | **NOT ACTIVATED** |

---

## Deferred / later-stage (not NEW 2B blockers)

- upload MB authority
- numeric DPI / print-quality threshold
- HEIC / HEIF policy
- public-original privacy / signed or private URL architecture
- orphan Storage lifecycle / retention
- optional Custom funnel events (original 2B-7)
- internal `user_progress.selected_size = 'A4'` — non-customer-facing legacy compatibility marker; does **not** drive price, Cart identity, v1 handoff, manufacturing metadata, or visible M identity; optional later cleanup
- Cart landscape thumbnail geometry
- Custom item detail routing
- mobile Cart UX / checkout / **NEW 2E**
- shared rounded physical 3D geometry
- production DB / Storage / server rollout
- live Toss

---

## Protected contracts (must not regress)

- NEW 2A CLOSED: Home `커스텀 제작 →`; Header five-icon chrome; no CustomerNavSheet; `requestCustomAccess()`; Header LoginModal bridge; cart term `장바구니`
- No public `/workshop`
- Auth-gated Workshop
- Aluminum-only current Custom product; **M 200 × 283 mm**
- `workshop-single` cart identity
- Historical `#16`–`#23` CLOSED
- PDP / Home frozen except 2A exceptions and 2B-4 shared preview reuse (not a PDP redesign)
- Product-truth holds (no 4K/8K/영원히/벽 손상 없음)
- Payment / Toss / NEW 6 / deploy / secrets

---

## Out of scope (unchanged)

NEW 2C global shell cleanup · NEW 2D catalog · NEW 2E checkout redesign · NEW 2F account · NEW 3 admin visual rewrite (beyond the shipped Custom M price control) · live Toss · production payment · backup/restore · launch/legal conclusions · broad WebGL refactor · generic code cleanup · login-after-upload experiment

---

## Do not do

- Reopen NEW 2B implementation from this closure
- Open NEW 2C from this note
- Deploy / apply production 2B-5A or 2B-5C / live Toss
- Restore 3-step flow or fit-mode UI
- Present A4 as customer-facing Custom identity
- Treat hardcoded `49000` as current price authority
- Claim production rollout complete

---

## Resume procedure

1. This note + `docs/METALORA_PROJECT_STATE.md` = SoT
2. Next: **A0 PRE-STAGE REPORT — NEW 2C** (Global Shell / Component Consistency)
3. Do **not** start NEW 2C until that report is reviewed and OPEN READY
4. Production Custom DB/Storage/server remain later launch gates

---

## Ownership (this note)

A0 — architecture / stage contract.

## Relevant files (implemented; not written in this closure)

- `src/components/WorkshopOverlay.tsx`
- `src/components/Workshop/CopyrightPage.tsx`
- `src/components/Workshop/WorkshopView.tsx`
- `src/components/Workshop/CustomImageEditor.tsx`
- `src/lib/customComposition/*`
- `src/pages/AdminProducts.tsx`
- `src/context/AuthContext.tsx`
- `server.ts` (2B-5A source; **not** production-deployed)
- `supabase/migrations/20260921120000_2b5a_custom_m_price_trusted_snapshot.sql`
- `supabase/migrations/20260921130000_2b5c_workshop_storage_contract.sql`
- 2A frozen: `src/pages/Home.tsx`, `src/components/Header.tsx`
