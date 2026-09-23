# NEW 1 — Launch Pipeline v2 (roadmap / scope lock)

> **SUPERSEDED AS CURRENT OPERATING MODE.** Historical NEW Launch Pipeline v2 / NEW 1 decision. Current SoT: `docs/decisions/NEW-1_launch-pipeline-v3.md`. Body preserved for audit/history. Do not treat the stage statuses in this body as current.

Status: CLOSED

Date: 2026-09-20

Decision: Remaining work after historical `#16`–`#23` is executed as **NEW Launch Pipeline v2** (NEW 1–9). Historical numbered stages stay immutable history. Current operating mode is **NEW LAUNCH PIPELINE v2 ACTIVE**. PRE-LAUNCH HOLD is **SUPERSEDED AS CURRENT OPERATING MODE** only.

This note does **not** open NEW 2. It does **not** authorize runtime implementation, deploy, or Supabase mutation.

---

## Rationale for renumbering

The 2026-09-15 user-authored official master pipeline defined remaining work through historical `#25`–`#30`, but those IDs were not carried into clean-main durable SoT. A later HOLD treated baseline engineering as complete because git lacked those definitions.

Recovered roadmap intent is now locked here. Future execution uses **NEW 1–9**, not `#20F` / `#24` / `#25`–`#30` as live ticket IDs. Historical IDs appear only in mapping.

The prior HOLD was **valid against the incomplete durable SoT at the time**. Baseline engineering through `#23` was complete. Recovered pre-live product work now resumes through NEW 1–5. Restore and live payment remain gated (NEW 6 then NEW 7).

---

## Historical status policy

CLOSED HISTORY (do not reopen, rename, or rewrite commits/tickets):

`#16` `#17` `#18` `#19` `#20` `#21` `#22` `#23` (and GOV-002)

Do **not** delete old decision notes (`20F-0`, `22H`, `22J`, `23-DEF`, `23` closure, etc.).

---

## Current operating mode

**NEW LAUNCH PIPELINE v2 ACTIVE**

NEW 1 — ROADMAP / SCOPE LOCK: **CLOSED**

NEW 2 is **NOT OPENED**. NEW 2A is **NOT OPENED**.

NEXT: **A0 PRE-STAGE REPORT — NEW 2A** (Global Menu / Information Architecture Consistency). Do not implement. Do not assign A1.

---

## Universal PRE-STAGE REPORT GATE

Every NEW numbered stage **and** every NEW 2 substage (2A–2F) must start with an **A0 PRE-STAGE REPORT**. A0 owns the report. HARD STOP. No implementation until user/orchestration review and **OPEN READY**.

Sequence:

A0 PRE-STAGE REPORT → HARD STOP → USER / ORCHESTRATION REVIEW → OPEN READY → STAGE OPEN → IMPLEMENTATION → USER VISUAL APPROVAL if visible → A5 TARGETED QA where required → A0 CLOSURE

The report must establish at minimum: baseline; objective; historical overlap; completed vs residual; frozen/protected surfaces; dependencies; READ SET; WRITE SET; PROTECTED SET; ownership; collision risk; visual impact; A5 requirement; A6 RED-area requirement; production impact; human/legal/account dependencies; risks; Definition of Done; OPEN READY YES/NO; recommended implementation order.

This **extends** Parallel Audit → Directed Decision → Controlled Write → Independent Verification. It does **not** replace post-implementation visual approval or A5.

Do not paste the full template into agent Rules.

---

## Final NEW 1–9

| ID | Title | Role |
|---|---|---|
| NEW 1 | Roadmap / scope lock | **CLOSED**. Docs/governance only. |
| NEW 2 | Customer experience / menu system overhaul | Stage **family**. Not one giant ticket. |
| NEW 3 | Admin / operations UX | Audit-first. Parallel with NEW 2 after NEW 1. |
| NEW 4 | Pre-launch legal / trust / operations prep | Parallel with NEW 2/3. Counsel delay must not block NEW 2/3. |
| NEW 5 | Final non-live QA | A5 READ ONLY. Targeted to what NEW 2–4 actually changed. |
| NEW 6 | Backup / restore hard gate | Historical `#20F`. Must PASS before NEW 7. |
| NEW 7 | Production payment activation | Live Toss. A6 authority. |
| NEW 8 | Real order / fulfillment dry run | After NEW 7. Do not duplicate NEW 4 SOP design. |
| NEW 9 | Final launch gate | Then METALORA LIVE. |

Dependency graph:

```
NEW 1
  ↓
(NEW 2 family ∥ NEW 3 ∥ NEW 4)
  ↓
NEW 5
  ↓
NEW 6
  ↓
NEW 7
  ↓
NEW 8
  ↓
NEW 9
  ↓
LIVE
```

NEW 2 substages are **not** automatically linear. Each substage report sets exact dependencies. Known constraints: 2A IA decision precedes public Custom entry work in 2B; 2C shared tokens may precede affected 2D/2E/2F; NEW 3 is separate; NEW 4 human/counsel can run in parallel. Writer concurrency: existing one-file / max-two-writers rules.

---

## NEW 2A–2F

Each of 2A–2F independently requires the PRE-STAGE REPORT gate above.

### NEW 2A — Global menu / IA consistency

**REQUIRED ROADMAP WORK.** Header/nav naming, hierarchy, entry points, close/back, account/cart/custom entries, Footer residual, responsive nav.

Factual baseline (do not invent a mega-nav): customer Header is icon-only; no hamburger; search Home-only; login overlay and `/login` shell both exist; `내 컬렉션` currently behaves as cart; Custom 제작 is not in Header; Admin nav stays separate.

Exact IA changes require the 2A report first.

### NEW 2B — 커스텀 제작 UX/UI

**REQUIRED ROADMAP WORK.** Dedicated flow. **Not** Profile polish.

Known flow: logged-in ProfileOverlay → 커스텀 제작 → WorkshopOverlay → agreement → resume/configuration → upload → 3D preview → price/confirmation → add to cart → Cart. No `/workshop` public route.

Do not invent crop tools or a public Workshop without a 2B report and product decision.

### NEW 2C — Global shell / component consistency

Non-frozen shared system (Header, Footer, announcement, shell, modal/sheet/dialog, toast, button/form/input/card, type, spacing, states). Do **not** redesign frozen Home/PDP content.

### NEW 2D — Catalog / general storefront

Cards, listing, search/filter/sort, loading/empty/error, continuation if needed. Home composition remains frozen. Do not create a competing catalog architecture without 2D evidence.

### NEW 2E — Cart / checkout UX

Cart through TEST payment-start / success / fail UI. **NO live Toss authority.** Live payment is NEW 7.

### NEW 2F — Account / profile UX

Login, signup, profile, account, collection, inquiry, account nav. Do **not** silently include SNS, password reset/recovery, phone verification, or account linking.

---

## NEW 3 — Admin / operations UX

Audit-first. Known routes: dashboard, users, products, best sellers, banners, orders, CS. Do **not** invent a Settings route. Do not promise a full visual rewrite before the NEW 3 report. Admin IA stays separate from customer IA.

---

## NEW 4 — Legal / trust / operations prep

Human/counsel vs A6 documentation/technical work. Candidates: KC/certification, finished-product origin, importer, PIPA follow-up, product-information release prep, fulfillment/shipping/tracking SOP, cancel/refund/exchange, CS, launch checklist.

Do **not** make legal conclusions. Counsel delay must **not** block NEW 2/3.

---

## NEW 5 — Final non-live QA

A5 READ ONLY. Test what NEW 2–4 actually changed plus necessary integration. Include shared-chrome regression on frozen Home/PDP **if** shared chrome changed. Do **not** repeat all historical `#23` without cause.

---

## NEW 6 — Backup / restore hard gate

Migrated from historical `#20F`. Current production may remain **FREE** until this stage. Do **not** hard-code `Pro`. Must PASS before NEW 7. Timing: paid capability **before** first live payment; not first payment then upgrade. See `docs/decisions/20F-0_account-side-backup-confirmation.md` (unchanged). `docs/operations.md` §E remains the A6 runbook snapshot.

Until NEW 6 PASS: production is **not** restorable; real payments must **not** be enabled.

---

## NEW 7–9

NEW 7: Toss LIVE, controlled real payment, integrity, cancel/refund, settlement, reconciliation. A6 payment authority; A3 payment UX only.

NEW 8: controlled live test order fulfillment/CS/reconciliation. Do not duplicate NEW 4 SOP design.

NEW 9: A0 integration + A6 RED + legal/product-information release status + revision/rollback + targeted A5 + user GO LIVE.

---

## Frozen surfaces — FROZEN COMPLETE

Do not redesign unless verified regression or explicit user reopen:

Home / Hero; PDP Desktop; PDP Mobile Story; Product Truth; Mount / Included; OWC; Product Information; PDP Footer.

Shared Header/nav/modal may touch these pages only via: impact analysis → minimum compatibility adjustment → user visual approval → targeted A5 regression. Site-wide consistency is **not** permission to redesign them.

---

## Historical → NEW mapping

| Historical | Status | NEW |
|---|---|---|
| `#20F` | MIGRATED | NEW 6 |
| `#24` known composite (live Toss, settlement, cancel/refund, legal launch, fulfillment, first payment) | PARTIALLY MIGRATED | NEW 4 prep + NEW 7 + NEW 8 + NEW 9. **Do not invent `#24A–J` history.** |
| `#25` frozen Home/PDP cluster | FROZEN COMPLETE | Protected set |
| `#25A` | MIGRATED | NEW 2A + 2C |
| `#25B` | MIGRATED | NEW 2D |
| `#25C` | MIGRATED | NEW 2E |
| `#25D` | MIGRATED | NEW 3 |
| `#25E` | MIGRATED | NEW 2F |
| `#25F` | MIGRATED | NEW 5 |
| `#26` | PARTIALLY MIGRATED | Login/signup/account visual → NEW 2F; expansion → OPTIONAL BRANCH |
| `#27` | OPTIONAL / primarily POST-LAUNCH | Not a NEW 1–9 blocker |
| `#28` | primarily POST-LAUNCH / optional framework | Not a blocker |
| `#29` | optional pre-launch / post-traffic | Not a blocker |
| `#30` | optional groundwork / post-launch | Not a blocker |

---

## Optional pre-launch branch

Outside the blocking NEW 1–9 path unless explicitly promoted:

SNS login; password reset/recovery; phone verification; account linking; review-system foundation; experiment framework; campaign landing / UTM architecture; CRM/lifecycle groundwork.

Password reset remains a **product decision** (current `{username}@metalora.me` virtual email).

---

## Post-launch / data-dependent branch

After NEW 9 / real order data: verified-review optimization; review abuse; funnel/drop-off; experiment validation; paid campaign performance; traffic-driven landing iteration; segmentation; remarketing; win-back; retention analytics.

Do **not** rebuild existing GA4 merely for these.

---

## Ownership summary

| Area | Owner |
|---|---|
| NEW 1, report gate, mapping | A0 |
| Header/Footer/tokens/modals | A1 |
| Catalog (frozen-safe), Custom 제작 UX | A2 |
| Cart/checkout UX, account overlays, admin UX | A3 |
| Workshop 3D / WebGL | A4 |
| NEW 5 | A5 READ ONLY |
| NEW 4 docs, NEW 6–9 payment/backup | A6 |
| `App.tsx` overlay mounting | A0 single writer |

---

## Unresolved human / product decisions

- Public Custom Header/IA entry vs keep login-gated
- `내 컬렉션` vs cart naming
- Add mobile drawer vs keep icon-only
- Origin / KC / importer / PIPA (counsel; no legal conclusions here)
- Workshop listed price `49000` as confirmed product fact or not
- Whether optional `#26`/`#27`–`#30` items are promoted
- Paid-plan selection at NEW 6 (not `Pro`-locked)

---

## Do Not Do

- Do not open NEW 2 or NEW 2A from this note
- Do not assign A1–A6 implementation from this note
- Do not start NEW 6 / upgrade Supabase / live Toss
- Do not enable real payments before NEW 6 PASS
- Do not reopen `#16`–`#23`
- Do not redesign frozen Home/PDP
- Do not invent `#24A–J` history
- Do not merge optional branches into NEW 2–4 automatically
- Do not treat Custom 제작 as Profile polish
- Do not execute NEW 2 as one giant ticket
- Do not replace visual approval / A5 with the report gate
- Do not deploy docs HEAD to align SHA with production

Completed: NEW 1 roadmap/scope lock recorded. Pipeline v2, report gate, frozen set, old→new map, optional/post-launch branches locked.

Resume Condition: **A0 PRE-STAGE REPORT — NEW 2A** (Global Menu / Information Architecture Consistency). NEW 2A is **NOT OPEN**. Do not implement. Do not assign A1.

Ownership: A0

Relevant Files: `docs/decisions/NEW-1_launch-pipeline-v2.md`, `docs/METALORA_PROJECT_STATE.md`, `.cursor/rules/00-project-governance.mdc`, `docs/decisions/20F-0_account-side-backup-confirmation.md` (unchanged)
