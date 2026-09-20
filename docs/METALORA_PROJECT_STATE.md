# METALORA project state

Persistent checkpoint for session handoff. Last updated after **NEW 2A OPEN** (menu / IA decision lock; no UI implementation).

This is the authoritative current-state file. Do **not** create additional overlapping status/handoff documents. `docs/operations.md` remains the runbook; do not duplicate it here. Master migration: `docs/decisions/NEW-1_launch-pipeline-v2.md`. NEW 2A contract: `docs/decisions/NEW-2A_menu-ia-consistency.md`.

**Current operating mode: `NEW LAUNCH PIPELINE v2 ACTIVE`.**
**NEW 1 — ROADMAP / SCOPE LOCK: CLOSED.**
**NEW 2A: OPEN** (decision lock / stage contract). UI implementation is **not** started. Writers are **not** assigned.
**NEW 2B–2F: NOT OPENED.**

NEXT: Orchestration review → separate owner implementation tickets for NEW 2A. Do not implement from this file. Do not assign A1 from this file. Every remaining NEW stage and every NEW 2 substage still requires an **A0 PRE-STAGE REPORT** before writes.

---

## 1. Current production baseline

| Item | Value |
|------|--------|
| Operating mode | **NEW LAUNCH PIPELINE v2 ACTIVE** |
| Current stage | **NEW 2A OPEN** — decision lock; no UI implementation |
| NEW 2 | family; only **2A OPEN**; 2B–2F not opened |
| NEW 2A | **OPEN** — `docs/decisions/NEW-2A_menu-ia-consistency.md` |
| Historical `#16`–`#23` | **CLOSED** |
| Prior PRE-LAUNCH HOLD | **SUPERSEDED AS CURRENT MODE** (preserved historically) |
| BASELINE DEVELOPMENT COMPLETE | **YES** (through `#23`) |
| MASTER ROADMAP DEVELOPMENT COMPLETE | **NO** |
| LIVE-COMMERCE READY | **NO** — NEW 6 must PASS before NEW 7 |
| LIVE | **NO** |
| #20 | **CLOSED WITH DEFERRED RESTORE OBLIGATION** (execution ID: **NEW 6**) |
| #21 | **CLOSED** |
| #22 | **CLOSED** |
| #23-DEF | **DONE** — `docs/decisions/23-DEF_stage-definition.md` |
| #23 A5 execution | **DONE** |
| #23 | **CLOSED** |
| Historical `#24` | **NOT OPENED** — remaining work mapped to NEW 4 / 7 / 8 / 9 |
| Production revision | `metalora-direct-00090-kig` |
| Production traffic | **100%** |
| Production source SHA | `0bb40e988a019716e748d12874693c247bfc410f` |
| Production image digest | `sha256:d45a463cc1ec05957c4064b4b2b2bc697161462c8823459115fe8607fea619c9` |
| Stable rollback | `metalora-direct-00087-voy` |
| Repository baseline observed at #23 closure write | `3722d66d648d0c15fdcb9433bf87871543ba19f7` |
| Expected worktree | clean |

Cloud Run service: `metalora-direct` (`metalora-auth`, `us-west1`).

`main` HEAD may be **ahead of production source** with docs-only commits. That drift is intentional. Do **not** deploy or retag solely to align HEAD with `00090-kig`.

Workspace: `C:\Users\admin\Desktop\metalora-main-clean-19f3`  
Branch: `main`

---

## 2. #22 — GA4 / CONSENT-GATED ANALYTICS — CLOSED

Production verified on `metalora-direct-00090-kig` @ 100%.
Deployed source: `0bb40e988a019716e748d12874693c247bfc410f`.
Stable rollback: `metalora-direct-00087-voy`.

Final A6 closure audit: **PASS** / CLOSURE READY **YES**.
Final A5 independent closure audit: **PASS** / CLOSURE READY **YES**.

Durable evidence (do not duplicate full audits here):

- `docs/decisions/22H_ga4-account-side-audit.md`
- `docs/decisions/22J_privacy-cookie-package-promotion.md`

Do **not** reopen #22 for deferred legal classification. Do **not** change GA4 Admin, consent, or analytics source as part of this closure record.

---

## 2b. #23 — DEVICE / RESPONSIVE QA — CLOSED

#23-DEF: **DONE** (`docs/decisions/23-DEF_stage-definition.md`)

#23 A5 execution: **DONE** (READ ONLY; Chromium viewport emulation, not physical iOS/Android certification)

#23 stage: **CLOSED**

Closure record: `docs/decisions/23_device-responsive-qa-closure.md`

A5 verified production `metalora-direct-00090-kig` @ 100%; stable `metalora-direct-00087-voy`. No functional responsive regression in the authorized matrix. Three wrapping observations are **MINOR / NON-BLOCKING** (OPTIONAL FUTURE UX, not the next pipeline task). No remediation tickets. No deploy.

22J A5 MINOR findings remain **ACCEPTED / NON-BLOCKING** (section 4).

Do **not** reopen #23 for cosmetic wrapping, physical-device certification, Workshop unreachability, or unauthenticated filled-cart depth.

---

## 3. Legal specialist follow-up — DEFERRED

**LEGAL SPECIALIST FOLLOW-UP: DEFERRED**

Legal review is **not** complete. Open questions remain separate from technical #22 closure:

- PIPA Art.28-8 applicability
- direct collection characterization
- Art.26 entrustment characterization
- exact Google legal entity if later required
- relevant country/countries if later required
- statutory basis if later required

Do not invent those classifications. Do not treat current public wording as counsel-approved.

Product/catalog holds (unchanged):

- 인증·허가 = **심의 예정**
- 제조국 / 원산지 = **심의 예정**
- 수입자 = **심의 예정**

Do **not** invent: `해당없음`, `대한민국 제조`, `Made in Korea`, `KC 완료`.

---

## 4. A5 MINOR findings

Accepted A5 MINOR findings from #22J remain **ACCEPTED / NON-BLOCKING**. They were **not** fixed in #22. See `docs/decisions/22J_privacy-cookie-package-promotion.md`.

#23 MINOR wrapping observations (`23-A5-F01`–`F03`) are **MINOR / NON-BLOCKING** / OPTIONAL FUTURE UX. They were **not** fixed in #23. See `docs/decisions/23_device-responsive-qa-closure.md`.

---

## 5. #20 restore obligation

#20 status: **CLOSED WITH DEFERRED RESTORE OBLIGATION**

Do **not** reopen #20.

Production Supabase: **FREE**, confirmed by user Dashboard inspection on **2026-09-20** (scheduled backup / PITR / restore UI unavailable; no upgrade; no restore attempted).

#20F (historical): **MIGRATED TO NEW 6**. Restore drill not executed. Storage recovery not documented. Production may remain **FREE** until NEW 6. A paid plan that provides the required backup/restore capability is required **before NEW 7 / first real payment** (do **not** hard-code `Pro`).

Before **NEW 7 production payment activation** OR **first real production customer payment**, whichever occurs first:

- move to a paid plan that provides the required backup/restore capability (do **not** hard-code `Pro`)
- confirm scheduled backups
- record PITR status if applicable
- execute and record restore drill
- document Storage recovery

Until completed: do **not** call production restorable; do **not** enable real payments.

Timing lock (unchanged): Free until NEW 6 → paid capability **before** first live payment → restore gate PASS → NEW 7. **Not** first real payment then upgrade.

Durable record: `docs/decisions/20F-0_account-side-backup-confirmation.md` (unchanged). `docs/operations.md` section E remains the runbook snapshot.

---

## 6. Pipeline — NEW Launch Pipeline v2

**PRE-LAUNCH HOLD = SUPERSEDED AS CURRENT OPERATING MODE.** Preserved historically: baseline engineering through `#23` was complete; the hold was valid against the then-incomplete durable SoT. Recovered pre-live roadmap now runs as NEW 1–5. Restore/live-payment gates are NEW 6 then NEW 7.

| Stage | Status |
|------|--------|
| Historical `#16`–`#19` | CLOSED |
| GOV-002 | CLOSED |
| Historical `#20` | CLOSED WITH DEFERRED RESTORE OBLIGATION |
| Historical `#21`–`#23` | CLOSED |
| Historical `#20F` | MIGRATED → **NEW 6** (not started) |
| Historical `#24` | NOT OPENED; remaining work → NEW 4 / 7 / 8 / 9 |
| **NEW 1** | **CLOSED** — roadmap / scope lock |
| **NEW 2** | family; **2A OPEN**; 2B–2F **NOT OPENED** |
| **NEW 2A** | **OPEN** — menu / IA decision lock; no UI yet |
| NEW 2B–2F | **NOT OPENED** |
| NEW 3–5 | not opened |
| NEW 6 | not started (hard gate before NEW 7) |
| NEW 7–9 | not opened |
| LIVE | **NO** |

Upcoming main path: **NEW 2A implementation tickets after orchestration review** → remaining NEW 2 family ∥ NEW 3 ∥ NEW 4 after their own reports → NEW 5 → NEW 6 → NEW 7 → NEW 8 → NEW 9 → LIVE.

**NEW 2A** = OPEN menu / IA contract (hybrid Header, labelled mobile sheet, global search to `/?q=`, Custom nav entry with auth-gated Workshop, cart = `장바구니`). **NEW 2B** = dedicated 커스텀 제작 UX/UI (not opened; not Profile polish). Do not execute NEW 2 as one giant ticket.

Frozen complete (do not redesign): Home/Hero, PDP Desktop, PDP Mobile Story, Product Truth, Mount/Included, OWC, Product Information, PDP Footer. NEW 2A allows shared Header chrome plus copy-only PDP rail cart-term strings listed in the 2A note.

Optional pre-launch and post-launch/data branches stay **outside** the blocking path unless explicitly promoted. See `docs/decisions/NEW-1_launch-pipeline-v2.md`.

Do **not** reopen `#16`–`#23`. Do **not** enable real payments before NEW 6 PASS.

---

## 7. Future SEO guardrails

Current ProductContext fetch uses `limit(20)`. Current public visible catalog: **4 products**. **SAFE TODAY.** If public visible catalog approaches or exceeds 20, re-audit SPA Product SEO resolution before relying on current `DocumentHead`.

`DocumentHead` replaces **all** `script[type="application/ld+json"]`. Current JSON-LD is route SEO only. If unrelated / third-party JSON-LD is introduced, narrow `DocumentHead` ownership before release.

---

## 8. Preserved WIP / agent naming

Preserved historical WIP: `wip/19f3-preserved-20260915`

**RULE:** NEVER switch / reset / stash / clean / edit / touch this preserved WIP during current `main` work.

File ownership is governed by `.cursor/rules/01-ownership-write-scope.mdc` (A0–A6). Task tickets may explicitly authorize a cross-owner write; they do **not** transfer permanent ownership. No agent owns the whole repository.

| Name in instructions | Meaning |
|----------------------|---------|
| `보존 WIP A2` | Old original A2 attached to preserved WIP. **Do not use** for current implementation. |
| `clean main A2` | A clean-main implementation session/window used when the task’s authoritative owner allows that write. It does **not** mean A2 owns the clean-main repo, may edit cross-owner files by default, or replaces A0–A6 ownership. |
| `A5` | Independent read-only QA agent. Must also point to the clean `main` workspace before QA. |

---

## 9. Current customer-copy rules

Do not reintroduce:

- 4K / 8K guarantees
- 영원히
- 변하지 않는
- 평생
- 반영구
- 벽 손상 없음
- 벽지 손상 없음
- 자국 없음
- AI 업스케일링 quality claims
- 고해상도 guarantee language
- customer-facing `180℃`
- customer-facing `승화전사` where easier Korean is preferred

Approved direction: natural Korean, consumer-first, factual.

---

## 10. Release process

For meaningful production work keep this sequence:

implementation → user visual approval if visible UI changes → A5 independent QA → commit/push → candidate 0% → candidate runtime verification → **explicit user promotion approval** → production 100% → post-promotion smoke → production verified

Never skip explicit user approval before promotion.

Scripts: `scripts/deploy-candidate.ps1`, `scripts/promote-candidate.ps1`, `scripts/rollback-production.ps1`. Do not retag `stable` unless an authorized ticket says so. Current stable rollback remains `metalora-direct-00087-voy`.
