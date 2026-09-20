# 23-DEF stage definition — DEVICE / RESPONSIVE QA

Status: DONE

#23-DEF: DEFINITION COMPLETE

#23 stage itself: **NOT OPENED** until a separate execution ticket is issued.

This note is the durable #23 definition. It does not run A5 QA, does not remediate, and does not deploy.

Decision: `#23 — DEVICE / RESPONSIVE QA` is an **AUDIT-FIRST** independent verification of the already-shipped customer-facing production UI across an authorized viewport matrix. It is not a redesign, refactor, cleanup, silent remediation, payment activation, SEO recertification, or analytics reopen.

Objective:
- Verify responsive usability of included storefront surfaces on `https://metalora.art`
- Use last recorded production package as the baseline reference (not live-reverified by this definition ticket)
- Keep A5 READ ONLY
- Route any accepted defect to a separate owner ticket after A0 classification

---

## Included Scope

Core public storefront:
- Home `/`
- one representative currently visible PDP `/product/:id` (do not invent a product; do not freeze a UUID in this note)

Shared storefront shell:
- Header
- navigation
- Footer
- CookieBanner / cookie settings UI
- login/auth overlay invoked from the storefront

Commerce UI before real payment authority:
- Cart UI
- checkout-facing UI inspectable without executing a real payment
- essential cart/checkout controls

Product creation/customization:
- Workshop/customizer **only if currently reachable from the public storefront**
- Current implementation: Workshop is a **nested overlay** (`WorkshopOverlay`), not a dedicated public App route. Do not invent `/workshop` as a certification URL. If the overlay is reachable from Header/storefront, include that overlay. If it is not reachable, skip and record UNVERIFIED / not present.

Long-form responsive text:
- one representative public policy route from `/policy/:type`
- Purpose: layout/responsive verification only, not legal-content review

---

## Excluded Scope

- `/admin*` and admin workflows
- `/auth/callback`
- `/profile/complete` as a dedicated device certification target
- actual Toss payment, actual order creation, settlement, cancel/refund backend, payment success/fail transaction semantics
- #24 activation and first real customer payment
- #20 restore drill, paid backup, PITR
- #21 SEO recertification; canonical/robots/sitemap redesign
- #22 reopen; GA4 Admin; consent architecture changes; PIPA classification; legal specialist follow-up
- product origin / KC determinations
- #26 auth features
- general refactoring, component architecture cleanup, dependency upgrades
- CSP / rate-limit work
- deployment, production traffic/tag changes, restoring POPULAR-001B
- compact/mobile PDP WebGL (remains forbidden unless a separate dedicated ticket reopens it)
- landscape mobile/tablet as baseline (portrait only for 390 and 768 unless a finding shows orientation dependence)

22J A5 MINOR items remain **ACCEPTED / NON-BLOCKING**. They are not a #23 remediation list. Do not mark them fixed. Do not silently reclassify the 22J record. If the same area shows **materially different severity** under the #23 matrix (e.g. an essential control becomes inaccessible), record a **new #23 finding with new evidence**.

---

## Viewport Matrix

Baseline #23 matrix (do not expand automatically):

| Class | Viewport | Orientation |
|---|---|---|
| Mobile | `390 × 844` | portrait |
| Tablet | `768 × 1024` | portrait |
| Desktop boundary / compact-desktop | `1100 × 800` | as stated |
| Standard desktop | `1440 × 900` | as stated |

`1440 × 900` is a regression/sanity viewport. It does **not** authorize redesign or re-polish of previously approved desktop UI. Only regressions or functional/responsive defects generate findings.

---

## Browser / Device Requirement

- Chromium-based viewport testing is sufficient for the baseline gate
- Mobile/tablet: touch/mobile emulation where supported
- Desktop: normal pointer/keyboard
- Physical iPhone/Android devices are **not mandatory** for #23 OPEN or baseline completion
- Safari/iOS real-device certification is not a hidden requirement
- Physical-device evidence, if later available, is additional and recorded separately
- Do not label emulation as a physical-device test
- Real-device or cross-browser certification may become a later directed ticket if findings justify it

---

## Environment

QA target: `https://metalora.art`

Last recorded production reference (not live-reverified by #23-DEF):

- Revision: `metalora-direct-00090-kig`
- Source: `0bb40e988a019716e748d12874693c247bfc410f`
- Stable rollback: `metalora-direct-00087-voy`

Do not deploy, rebuild, promote, rollback, retag, or create a candidate merely to begin #23.

Candidate testing belongs only to a later remediation verification path if a remediation ticket actually changes runtime/UI.

Repository docs HEAD may lead production source. That drift is intentional. Do not deploy HEAD to synchronize SHA.

---

## Audit vs Remediation Boundary

#23-DEF = this definition.
#23 QA = later execution ticket (A5 READ ONLY).
Remediation = separate owner tickets.
Deployment = not part of #23-DEF or baseline #23 QA.

Finding lifecycle:

1. A5 produces evidence.
2. A0 classifies: BLOCKING / MINOR / ACCEPTED EXISTING MINOR / OUT OF SCOPE / UNVERIFIED.
3. A0 identifies the existing owner.
4. A separate remediation ticket is created (WRITE / READ / PROTECTED SET, owner, expected behavior, verification).
5. Owner implements only that ticket.
6. Visible UI changes require explicit user visual approval (`04-approval-qa-release`).
7. A5 performs targeted re-test.

No finding automatically authorizes source modification. A5 must not modify source.

---

## Ownership

| Role | #23 role |
|---|---|
| A0 | Definition, open gate, finding triage/classification, remediation ticket cut |
| A5 | Independent QA, WRITE SET NONE |
| A1 / A2 / A3 / A4 | Only after a separate remediation ticket names that owner and WRITE SET |
| A6 | Only if a classified finding is RED (payment/auth/SEO/analytics/server). Default #23 is not A6 RED |

Permanent single-writer rules still apply. `src/App.tsx` remains A0. Compact PDP WebGL remains A4-forbidden unless reopened.

---

## Visual Approval

- Baseline A5 audit of already-shipped production: visual approval is **not** required to start A5 (no new UI implementation in the audit ticket).
- Any visible remediation: **YES**, user visual approval before A5 re-verification (`04`).
- Non-visual integrity patches after approved visuals: targeted A5 without reopening design, if they preserve the approved output.

---

## Finding Classification

- **BLOCKING** — see Pass / Fail Criteria
- **MINOR** — cosmetic / non-critical; does not block #23 baseline completion
- **ACCEPTED EXISTING MINOR** — same area as a 22J accepted MINOR, no new functional severity
- **OUT OF SCOPE** — SEO, analytics, legal, live payment authority, backup/restore, admin, generic refactor, future features, unless a direct customer-facing responsive defect on an included surface is shown
- **UNVERIFIED** — surface not reachable, evidence incomplete, or live production identity not confirmed

---

## Pass / Fail Criteria

A finding is **BLOCKING** when evidence shows one or more of:

- unintended page-level horizontal overflow that materially breaks the layout
- essential navigation/control/CTA cannot be reached
- required control is visually hidden, clipped, covered, or unusable
- overlay/modal prevents completion of a core customer task
- critical content such as product action, cart action, price/action control is inaccessible
- responsive state produces overlapping/occluded essential UI
- core interaction cannot be completed due to viewport/input handling
- compact PDP violates the existing zero-WebGL contract
- Story Canvas and Viewer Canvas coexist where existing contracts prohibit it
- responsive architecture materially contradicts an existing locked project contract
- a functional interaction fails specifically because of the tested viewport/device mode

**NON-BLOCKING / MINOR** examples: small spacing inconsistency, non-critical wrapping, cosmetic alignment, typography polish, minor visual rhythm, aesthetic preference, previously accepted MINOR with no new functional severity.

---

## Evidence Requirements

Each finding or pass claim must record:

- URL / surface
- viewport width × height
- portrait/landscape as tested
- Chromium viewport vs any additional evidence
- emulation vs physical (must not label emulation as physical)
- what was done (scroll, open overlay, attempt essential control)
- expected vs observed
- screenshot or equivalent runtime evidence where feasible
- classification proposal (A5) pending A0 triage

Do not recertify unrelated historic contracts. Test only included surfaces and plausibly affected interactions.

---

Completed:
- Durable #23 definition recorded from authorized PHASE 2 orchestration decisions
- #23-0 insufficiency (missing include/exclude, matrix, audit-vs-fix, owners, visual-approval, production impact) is closed **as a definition gap only**
- Open-gate revalidation is recorded in `docs/METALORA_PROJECT_STATE.md`

Blocker / Open Item:
- #23 execution is **not started**
- Live Cloud Run identity was **not** re-verified in #23-DEF; last recorded `00090-kig` / `0bb40e9` remain the reference until an execution ticket checks live traffic
- Workshop inclusion depends on storefront reachability at execution time (overlay, not an invented route)

Do Not Do:
- Do not start A5 from this note
- Do not treat OPEN READY as authorization to implement or deploy
- Do not auto-open remediation from findings
- Do not reopen #16–#22, #20 restore, or #24
- Do not convert 22J MINORs into a #23 fix list
- Do not enable compact PDP WebGL
- Do not expand the viewport/browser matrix automatically
- Do not deploy docs HEAD to align SHA with production
- Do not execute a real payment
- Do not create a candidate merely to begin #23

Resume Condition: Separate **#23 execution ticket** issued to A5 (READ ONLY) against `https://metalora.art` using this matrix.

Resume Procedure: Confirm last recorded production reference; do not deploy; A5 audits included surfaces only; A0 triages; remediations are new tickets.

Ownership: A0

Relevant Files: `docs/decisions/23-DEF_stage-definition.md`, `docs/METALORA_PROJECT_STATE.md` (status pointer only; not a second definition)
