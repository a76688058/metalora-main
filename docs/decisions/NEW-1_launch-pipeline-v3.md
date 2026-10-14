# METALORA — MASTER PIPELINE v3

Status: **HISTORICAL BODY** (remaining-stage governance moved)

Date: 2026-10-11 (remaining-pipeline overlay; original v3 body preserved)

Decision: Historical pipeline body stays in this note. The only approved remaining pipeline is `docs/decisions/RELEASE_remaining-pipeline.md`. NEW 1 and NEW 2A–2F remain **CLOSED**. NEW 2 production release remains **CLOSED**. NEW 3 and NEW 4 are **CLOSED**. NEW5 is **INCOMPLETE** under the 2026-10-14 modified PATH 2 amendment. NEW6–NEW9 stay **NOT OPENED** until each prior exit passes. Live handoff lives in `docs/METALORA_PROJECT_STATE.md`.

This note does **not** authorize live Toss, payment activation, or a production database or storage change.

---

## Migration context

NEW 2E closed and pushed at `6b7e1dbb50c0ae339f0f0c1ef07faad748b31973` (`fix(cart): close NEW 2E payment success UX`).

v2 remains historical evidence of the NEW 1 roadmap lock. v3 restores launch-critical scope that v2 mapping recorded but some v2 one-liners could be read as reducing: v1 `#25C`→NEW 2E, `#25D`→NEW 3, `#25E`→NEW 2F, `#25F`→NEW 5. Those requirements were **migrated, not deleted**.

---

## Successor relationship

| Role | File |
|------|------|
| Remaining pipeline SoT | `docs/decisions/RELEASE_remaining-pipeline.md` |
| Historical pipeline body | **this note** |
| Historical v2 / NEW 1 evidence | `docs/decisions/NEW-1_launch-pipeline-v2.md` (**SUPERSEDED AS CURRENT OPERATING MODE**) |
| Live statuses / handoff | `docs/METALORA_PROJECT_STATE.md` |

Do **not** rewrite the v2 body to current stage status.

---

## Current statuses

Live handoff: `docs/METALORA_PROJECT_STATE.md`. NEW 2F auth expansion: `docs/decisions/NEW-2F_auth-expansion.md`.

| Stage | Status |
|------|--------|
| NEW 1 | **CLOSED** |
| NEW 2 | **CLOSED** — customer UX/source **CLOSED**; production release **CLOSED** |
| NEW 2A | **CLOSED** |
| NEW 2B | **CLOSED** |
| NEW 2C | **CLOSED** |
| NEW 2D | **CLOSED** |
| NEW 2E | **CLOSED** |
| NEW 2F | **CLOSED** |
| NEW 3 | **CLOSED** |
| NEW 4 | **CLOSED** |
| NEW 5 | **INCOMPLETE** — amended exit not met |
| NEW 6 | **NOT OPENED** |
| NEW 7 | **NOT OPENED** |
| NEW 8 | **NOT OPENED** |
| NEW 9 | **NOT OPENED** |
| LIVE | **NOT REACHED** |

Next: finish mandatory NEW5 item A, then the amended NEW5 exit. Do **not** start NEW6, NEW7, NEW8, or NEW9 before that exit. Approved scope and carryovers: `docs/decisions/RELEASE_remaining-pipeline.md`.

---

## Launch-critical tree

### Legacy foundation / completed base

| ID | Title | Status |
|---|---|---|
| `#16` | Supabase Production Cleanup & Security | **CLOSED** |
| `#17` | Auth & User Integrity | **CLOSED** |
| `#18` | Payment Hardening / Payment-test | **CLOSED** |
| `#19` | Production Deployment Hardening | **CLOSED** |
| `#20` | Operations | historical / migrated as applicable |
| `#20F` | Backup / restore | **MIGRATED → NEW 6** |
| `#21` | SEO & Search Readiness | **CLOSED** |
| `#22` | Analytics & Funnel | **CLOSED** |
| `#23` | Real-device / Responsive QA | **CLOSED** |

Do **not** reopen `#16`–`#23`.

### NEW 1 — Roadmap / scope / governance

**CLOSED.** Docs/governance only. Historical lock: v2 note. Current operating mode: this v3 note.

### NEW 2 — Customer experience / UX/UI family

**CLOSED** (customer UX/source **and** production release). Each 2A–2F had its own PRE-STAGE REPORT. Production-release evidence: `docs/decisions/NEW-2_production-release.md`.

| Substage | Title | Status |
|----------|--------|--------|
| NEW 2A | Global Menu / IA | **CLOSED** |
| NEW 2B | Custom Creation UX/UI | **CLOSED** |
| NEW 2C | Global Shell / Component Consistency | **CLOSED** |
| NEW 2D | Catalog / Storefront | **CLOSED** |
| NEW 2E | Cart / Checkout / Payment UX/UI | **CLOSED** |
| NEW 2F | Account / Profile / Auth UX/UI | **CLOSED** |

### NEW 3 — Admin / operations full UX/UI renewal

**CLOSED.** Inherits v1 `#25D`. Do not reopen unless a regression requires it.

### NEW 4 — Pre-launch legal / trust / operations prep

**CLOSED.**

### NEW 5 — Final non-live visual / interaction QA

**INCOMPLETE.** Inherits v1 `#25F`. Approved scope, amended exit, and carryovers: `docs/decisions/RELEASE_remaining-pipeline.md`.

### NEW 6 — Backup / restore hard gate

**NOT OPENED.** Old `#20F`. Must **PASS** before NEW 7.

### NEW 7 — Production payment activation

**NOT OPENED.**

### NEW 8 — Real order / fulfillment dry run

**NOT OPENED.**

### NEW 9 — Final launch gate / GO LIVE

**NOT OPENED.**

---

## NEW 2F — Account / Profile / Auth UX/UI (CLOSED)

v1 `#25E` migrated here. **LIVE STATUS: CLOSED.** Detail: `docs/decisions/NEW-2F_account-profile-auth-ux.md`, `docs/decisions/NEW-2F_auth-expansion.md`. C1 **CLOSED**. C2 **CLOSED**. A5 integrated NEW2 QA **ALL PASS**. Slice D/E leftover Profile/security work is **DEFERRED OUT OF NEW 2**.

The original v3 listing below is preserved as migrated `#25E` scope. Auth expansion (recovery, verified phone, Google/Kakao/Naver, linking) is **LAUNCH-REQUIRED** under NEW 2F and is **not** optional. That supersedes the historical “OUT OF NEW 2F / OPTIONAL AUTH EXPANSION” paragraph at the end of this section.

### Login

- Header LoginModal
- `/login` page
- modal vs routed-shell consistency
- error states
- loading states
- keyboard / Escape
- mobile
- desktop

### Signup

- signup form hierarchy
- validation feedback
- consent presentation
- Login ↔ Signup transition
- visual consistency

### Profile

- ProfileOverlay
- profile edit
- completion state
- shipping/profile fields
- Custom entry
- responsive sheet UX

### Account

- account-information hierarchy
- current account-management actions
- empty / loading / error states

### Inquiry / CS entry

- existing customer-facing inquiry / account UX

### Cross-cutting

- responsive
- light / dark parity
- accessibility
- keyboard / focus
- USER visual approval
- A5 targeted QA

### Explicitly OUT OF NEW 2F (historical v3 listing — SUPERSEDED AS CURRENT CLASSIFICATION)

The original v3 listing placed SNS signup/login, password reset, account recovery, phone verification, and account linking **OUT OF NEW 2F / OPTIONAL AUTH EXPANSION**.

That classification is **SUPERSEDED**. Those items are **LAUNCH-REQUIRED** under NEW 2F. Current contract: `docs/decisions/NEW-2F_auth-expansion.md`. Apple, MFA, recovery email, and consumer SNS connect/disconnect UI remain out for launch there.

---

## NEW 3 — Admin / operations full UX/UI renewal (NOT OPENED)

v1 `#25D` **ADMIN PAGE FULL UX/UI RENEWAL** migrated here.

**AUDIT-FIRST** means: determine exact necessary implementation before writing.

It does **not** mean: downgrade Admin renewal to optional polish; omit pages silently; skip Site Settings without audit.

### Required audit / renewal areas

**Admin shell / navigation:** sidebar; mobile admin navigation; page-header hierarchy; admin visual-system consistency.

**Dashboard:** summary cards; charts; information hierarchy; responsive.

**Products:** list; create/edit; product state; images/options usability; responsive tables/forms.

**Product reorder:** `display_order` UX.

**Best Sellers.** **Banners.**

**Orders:** list; detail; order status; customer information; shipping information; post-order operational usability.

**Users:** list; search; member detail; privileged-field boundary.

**CS inquiries:** list; state/detail; response workflow UX.

**Site Settings:** v1 includes Site Settings. Current known fact: there is **no confirmed `/admin/settings` route** today. Therefore: audit actual settings authority; identify whether settings UI exists elsewhere; do **not** invent a route without evidence; do **not** silently delete the requirement.

**Shared Admin UX:** search/filter; table usability; overflow; columns; action controls; empty/loading/error; desktop Admin UX; mobile Admin UX; accessibility; keyboard/focus; USER visual approval; A5 admin QA.

Admin IA stays separate from customer IA.

---

## NEW 4 — Pre-launch legal / trust / operations prep (CLOSED)

Preserve: origin; KC / certification; importer; required product information; privacy / PIPA; refund / cancellation consistency; Custom-product policy scope; shipping / production wording; customer-facing trust copy; operational SOP; CS / refund / cancellation preparation.

Visible customer-facing copy changes require **USER visual approval**. Do **not** make unsupported legal conclusions. Counsel delay must **not** block NEW 2 / NEW 3.

---

## NEW 5 — Final non-live visual / interaction QA (INCOMPLETE)

v1 `#25F` **SITE-WIDE VISUAL / INTERACTION QA** migrated here. A5 **READ ONLY**. Approved checklist, 2026-10-14 amended exit, and carryovers: `docs/decisions/RELEASE_remaining-pipeline.md`. Do **not** start NEW 6 before that amended NEW 5 EXIT PASS.

Include: typography; spacing; forms; buttons; dialog / sheet / modal hierarchy; responsive; accessibility; keyboard / focus; motion; reduced motion; light / dark parity; Auth regression; Cart / Checkout regression; Admin regression.

Do **not** repeat all historical `#23` blindly.

NEW 5 targets: surfaces changed by NEW 2–4; plausible shared-chrome regressions; frozen surfaces **only** when shared changes could affect them.

---

## NEW 6 — Backup / restore hard gate (NOT OPENED)

Old `#20F`. Must **PASS** before NEW 7.

Include: then-current Supabase backup capability verification; scheduled backup verification; PITR decision if applicable; isolated restore target; DB restore drill; Storage recovery procedure; evidence.

Do **not** hard-code `Pro`. Timing: paid capability **before** first live payment; not first payment then upgrade. Until NEW 6 PASS: production is **not** restorable; real payments must **not** be enabled.

See `docs/decisions/20F-0_account-side-backup-confirmation.md` (unchanged). `docs/operations.md` remains the A6 runbook.

---

## NEW 7 — Production payment activation (NOT OPENED)

Include: production Toss client/secret wiring; production env verification; production prepare/confirm; environment guards; payment smoke; small-value real payment; cancellation/refund payment path; A6 production-payment gate.

**PRODUCTION CUSTOM 2B ROLLOUT: NOT YET PERFORMED.**

Before production Custom ordering is launch-ready, verify/apply as required: trusted Custom RPC production rollout (2B-5A); workshop Storage contract production rollout (2B-5C); related production runtime promotion if required. Do **not** claim completed.

NEW 6 remains the hard prerequisite.

---

## NEW 8 — Real order / fulfillment dry run (NOT OPENED)

Include: real order receipt; payment ↔ order reconciliation; order status transition; admin order visibility; shipping information; tracking / waybill; cancellation operation; refund operation; exchange operation; customer inquiry / CS; Admin-side post-order dry run.

Do not duplicate NEW 4 SOP design.

---

## NEW 9 — Final launch gate / GO LIVE (NOT OPENED)

Requires: NEW 2 UX family **CLOSED**; NEW 3 Admin UX **CLOSED**; NEW 4 legal/trust release; NEW 5 final QA **PASS**; NEW 6 restore **PASS**; NEW 7 live payment **PASS**; NEW 8 real-order dry run **PASS**; final integration verification; production revision / rollback confirmation; A5 final targeted QA; A6 production release gate; **USER FINAL GO**.

Then: **LIVE**.

---

## v1 → v3 preservation map

These requirements were **migrated, not deleted**.

| v1 | Title | v3 |
|----|--------|-----|
| `#25C` | Cart / Checkout / Payment UX/UI Renewal | **NEW 2E** (CLOSED) |
| `#25D` | Admin Page Full UX/UI Renewal | **NEW 3** (CLOSED) |
| `#25E` | Existing Account / Profile UI Polish | **NEW 2F** (CLOSED) |
| `#25F` | Site-wide Visual / Interaction QA | **NEW 5** (INCOMPLETE) |
| `#20F` | Backup / restore | **NEW 6** |
| `#24` composite (live Toss, settlement, cancel/refund, legal launch, fulfillment) | PARTIALLY MIGRATED | NEW 4 + NEW 7 + NEW 8 + NEW 9. Do **not** invent `#24A–J` history. |
| `#25A` | | NEW 2A + 2C (CLOSED) |
| `#25B` | | NEW 2D (CLOSED) |
| `#26` | | Login/signup/account visual → NEW 2F; expansion → **LAUNCH-REQUIRED** under NEW 2F (`NEW-2F_auth-expansion.md`; historical OPTIONAL AUTH EXPANSION **SUPERSEDED**) |

---

## Frozen completed surfaces

**FROZEN COMPLETE** unless verified regression or explicit reopen:

Home / Hero; PDP Desktop; PDP Mobile Story; Product Truth; Mount / Included; OWC; Product Information; PDP Footer.

Shared-chrome compatibility fixes remain allowed with evidence. v3 migration must **not** reopen these. Site-wide consistency is **not** permission to redesign them.

---

## OPTIONAL AUTH EXPANSION — SUPERSEDED AS CURRENT CLASSIFICATION

The original v3 listing treated the following as separate from launch-critical v3 and out of NEW 2F:

- SNS signup/login
- password reset
- account recovery
- phone verification
- account linking

That classification is **SUPERSEDED**. They are **LAUNCH-REQUIRED** under NEW 2F and are now **CLOSED** with NEW 2 customer Auth. Current contract: `docs/decisions/NEW-2F_auth-expansion.md`. Google/Kakao = C1 **CLOSED**. Naver = C2 **CLOSED**. Do **not** treat this historical heading as an active exclusion.

---

## Optional / post-launch branches

Preserve roadmap history. Classify as optional / post-launch / data-dependent. Do **not** make launch-critical automatically. Do **not** delete.

| Historical | Subject | Classification |
|------------|---------|----------------|
| `#27` | Reviews / Trust | optional / primarily POST-LAUNCH |
| `#28` | Conversion Optimization / Experiments | primarily POST-LAUNCH / optional framework |
| `#29` | Advertising / Landing | optional pre-launch / post-traffic |
| `#30` | CRM / Retention | optional groundwork / post-launch |

Do **not** rebuild existing GA4 merely for these.

---

## Dependency graph

```
NEW 1
  ↓
(NEW 2 ∥ NEW 3 ∥ NEW 4)
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

Operational default: **sequential** unless explicitly authorized otherwise.

Current next action: finish mandatory NEW5 item A on the release candidate. NEW 2, NEW 3, and NEW 4 are **CLOSED**. NEW 5 is **INCOMPLETE**. NEW 6–NEW 9 remain **NOT OPENED**. Do not start them before the amended NEW 5 EXIT PASS.

---

## Universal stage gate

Preserve exactly in substance. Do **not** weaken.

A0 PRE-STAGE REPORT → HARD STOP → USER REVIEW / APPROVAL → STAGE OPEN → IMPLEMENTATION → USER VISUAL APPROVAL if visible → A5 TARGETED QA → A0 CLOSURE

Every NEW numbered stage **and** every NEW 2 substage (2A–2F) must start with an **A0 PRE-STAGE REPORT**. HARD STOP. No implementation until user/orchestration review and **OPEN READY**.

This extends Parallel Audit → Directed Decision → Controlled Write → Independent Verification. It does **not** replace Controlled Write, visual approval, A5, or A6 RED boundaries.

---

## Ownership / boundaries (already established)

File ownership: `.cursor/rules/01-ownership-write-scope.mdc`.

| Area | Owner |
|------|--------|
| Pipeline SoT, PRE-STAGE gate, mapping | A0 |
| Header / Footer / tokens / modals | A1 |
| Catalog (frozen-safe), Custom 제작 UX | A2 |
| Cart/checkout UX, account overlays, admin UX | A3 |
| Workshop 3D / WebGL | A4 |
| NEW 5 | A5 READ ONLY |
| NEW 4 docs, NEW 6–9 payment/backup | A6 |
| `App.tsx` overlay mounting | A0 single writer |

A3 owns payment **UX**. A6 owns payment **authority**.

---

## Production / payment boundary

| Item | State |
|------|--------|
| Production 2B rollout (2B-5A RPC, 2B-5C Storage, related runtime) | **NOT PERFORMED** |
| NEW 2E payment-test artifacts | **MAY REMAIN** |
| Live Toss | **NOT ACTIVATED** |
| Production payment | **NOT ACTIVATED** |
| NEW 2 production deploy | **CERTIFIED** (historical) — `metalora-direct-00093-car`; SHA `d38e41ad1173ad542a5b68eaccc7e96cb0b1367c` |
| Current production (2026-10-11) | `metalora-direct-00139-men` @ 100%; rollback `metalora-direct-00136-daq`; SHA `84aabfb99bcb68cf658e6b7b1fd9a44ecc81ce2d` |
| LIVE-COMMERCE READY | **NO** — NEW 6 must PASS before NEW 7 |

This note does **not** imply launch readiness.

---

## Next stage rule

1. Live status is in `docs/METALORA_PROJECT_STATE.md`. Remaining-stage governance is `docs/decisions/RELEASE_remaining-pipeline.md`. This v3 note keeps the historical pipeline body.
2. Next: finish mandatory NEW5 item A. Do **not** start NEW 6–NEW 9 before the amended NEW 5 EXIT PASS.
3. Do **not** activate live Toss. Do **not** mutate production DB from this note.

---

## Do not do

- Reopen NEW 2F implementation from this note
- Open NEW 3/4 from this note
- Rewrite v2 historical body to current statuses
- Downgrade NEW 3 `#25D` or NEW 5 `#25F`
- Treat historical OPTIONAL AUTH EXPANSION as the current exclusion
- Promote `#27`–`#30` into launch-critical path automatically
- Redesign frozen Home/PDP
- Claim production 2B rollout, live Toss, production payment, or LIVE
- Enable real payments before NEW 6 PASS
- Duplicate this tree into agent Rules

---

## Resume procedure

1. This note + `docs/METALORA_PROJECT_STATE.md` = pipeline definition + live handoff
2. Next: **GPT REVIEW — NEW3/NEW4 opening decision**
3. Do **not** open NEW 3–9 from this note

Ownership: A0

Relevant files: `docs/decisions/NEW-1_launch-pipeline-v3.md`, `docs/decisions/NEW-1_launch-pipeline-v2.md` (historical), `docs/METALORA_PROJECT_STATE.md`, `docs/decisions/NEW-2_production-release.md`, `docs/decisions/NEW-2F_auth-expansion.md`, `docs/decisions/NEW-2F_c1-google-kakao.md`, `docs/decisions/NEW-2F_c2-naver.md`, `.cursor/rules/00-project-governance.mdc`
