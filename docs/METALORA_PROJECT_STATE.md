# METALORA project state

Persistent checkpoint for session handoff. Last updated after **NEW 2C CLOSED** (CookieBanner `.container-shell` alignment; source/governance complete; no deploy).

This is the authoritative current-state file. Do **not** create additional overlapping status/handoff documents. `docs/operations.md` remains the runbook; do not duplicate it here. Master migration: `docs/decisions/NEW-1_launch-pipeline-v2.md`. NEW 2A contract: `docs/decisions/NEW-2A_menu-ia-consistency.md`. NEW 2B contract: `docs/decisions/NEW-2B_custom-creation-ux-ui.md`. NEW 2C contract: `docs/decisions/NEW-2C_global-shell-component-consistency.md`.

**Current operating mode: `NEW LAUNCH PIPELINE v2 ACTIVE`.**
**NEW 1 — ROADMAP / SCOPE LOCK: CLOSED.**
**NEW 2: IN PROGRESS.**
**NEW 2A: CLOSED.** Implementation, user visual approval, A5 targeted QA, and A5 short-delta QA **PASS**. Orphan `CustomerNavSheet` removed.
**NEW 2B: CLOSED.** Two-step Custom M source/UX complete. Payment-test validated. Production Custom DB/Storage/server **not** rolled out.
**NEW 2C: CLOSED.** CookieBanner first-visit and settings inner shells consume `.container-shell`. User visual approval **PASS**. A5 targeted QA **PASS**. Footer out of scope. No deploy.
**NEW 2D: NOT OPENED.**
**NEW 2E–2F: NOT OPENED.**

NEXT: **A0 PRE-STAGE REPORT — NEW 2D** (Catalog / General Storefront). Do **not** open or implement NEW 2D from this file. Every remaining NEW 2 substage (2D–2F) and every remaining NEW stage still requires an **A0 PRE-STAGE REPORT** before writes.

---

## 1. Current production baseline

| Item | Value |
|------|--------|
| Operating mode | **NEW LAUNCH PIPELINE v2 ACTIVE** |
| Current stage | **NEW 2 IN PROGRESS** — next is **A0 PRE-STAGE REPORT — NEW 2D** (not opened) |
| NEW 2 | family; **2A CLOSED**; **2B CLOSED**; **2C CLOSED**; 2D–2F not opened |
| NEW 2A | **CLOSED** — `docs/decisions/NEW-2A_menu-ia-consistency.md` |
| NEW 2B | **CLOSED** — `docs/decisions/NEW-2B_custom-creation-ux-ui.md` |
| NEW 2C | **CLOSED** — `docs/decisions/NEW-2C_global-shell-component-consistency.md` |
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

`main` HEAD is **ahead of production source**. That drift is intentional. NEW 2B source/UX is closed at repository HEAD `97f2f1daeecf49342a9f3f12db75728fccd48941`. Production Custom 2B-5A DB, 2B-5C Storage, and new `server.ts` remain **unapplied / undeployed**. Do **not** deploy or retag solely to align HEAD with `00090-kig`.

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
| **NEW 2** | family; **IN PROGRESS**; **2A CLOSED**; **2B CLOSED**; **2C CLOSED**; 2D–2F **NOT OPENED** |
| **NEW 2A** | **CLOSED** — customer nav / IA; visual approval + A5 PASS |
| **NEW 2B** | **CLOSED** — two-step Custom M source/UX; payment-test PASS; production rollout **not** complete |
| **NEW 2C** | **CLOSED** — CookieBanner `.container-shell`; Footer out of scope; no deploy |
| NEW 2D | **NOT OPENED** — next: A0 PRE-STAGE REPORT |
| NEW 2E–2F | **NOT OPENED** |
| NEW 3–5 | not opened |
| NEW 6 | not started (hard gate before NEW 7) |
| NEW 7–9 | not opened |
| LIVE | **NO** |

Upcoming main path: **A0 PRE-STAGE REPORT — NEW 2D** (not opened) → remaining NEW 2 family (each with its own PRE-STAGE REPORT) ∥ NEW 3 ∥ NEW 4 after their own reports → NEW 5 → NEW 6 → NEW 7 → NEW 8 → NEW 9 → LIVE.

**NEW 2A** = **CLOSED.** Final Header: Search / Theme / Logo / Account / Cart on desktop and mobile; no persistent Custom text; no mobile `메뉴` / hamburger / CustomerNavSheet. Primary Custom discovery: Home `커스텀 제작 →` via `requestCustomAccess()`. Cart commerce term = `장바구니`. Global search → `/?q=`. Do not reopen 2A.

**NEW 2B** = **CLOSED.** Dedicated 커스텀 제작 UX/UI. Contract: `docs/decisions/NEW-2B_custom-creation-ux-ui.md`. Final flow: two-step only (`1/2 이미지 편집` → `다음으로` → `2/2 제품 미리보기` → `장바구니에 담기`). Custom **M only**, **200 × 283 mm**, aluminum. No fit-mode UI. Price authority `site_settings.custom_m_price`. Durable original/preview + trusted Cart v1. Source/payment-test complete; production Custom rollout **not** complete. Do not execute NEW 2 as one giant ticket. Do not reopen 2B implementation.

Durable 2B checkpoints: `b37c1f7` (open) → `0a65c24` (two-step UX) → `2e06be9` (trusted cart snapshot) → `97f2f1d` (durable handoff). Visual + payment-test E2E + A5/A0 **PASS**. Production 2B-5A/2B-5C/server **not** applied/deployed.

**NEW 2C** = **CLOSED.** Residual customer-shell alignment only. Contract: `docs/decisions/NEW-2C_global-shell-component-consistency.md`. Implementation: `src/components/CookieBanner.tsx` first-visit + settings inner shells now use `.container-shell` (`6ff78fcd64e951d88ab12dc6d88249fb77c8b4d3`). User visual approval **PASS**. A5 targeted QA **PASS**. Footer **out of scope** (#23-A5-F02 remains MINOR / OPTIONAL, not claimed fixed). Header IA / Workshop / tokens / ui primitives / Cart / account **unchanged**. No backend or deploy. Do not reopen 2C. Do not open 2D from this file.

Frozen complete (do not redesign): Home/Hero, PDP Desktop, PDP Mobile Story, Product Truth, Mount/Included, OWC, Product Information, PDP Footer — except the closed NEW 2A Header chrome, Home.tsx headline/CTA stack, copy-only PDP rail cart-term strings listed in the 2A note, and **NEW 2B-4 shared PDP preview reuse** (not a PDP visual redesign).

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
- AI 업스케일링 **quality** claims / fake immediate 4K or generative-fill UI
- 고해상도 guarantee language
- customer-facing `180℃`
- customer-facing `승화전사` where easier Korean is preferred

Approved direction: natural Korean, consumer-first, factual. NEW 2B may describe **real** production AI upscaling only in wording that matches actual behavior. Do **not** present fit/fill/all-view controls or immediate 4K / generative-fill UI. Fit-mode labels from early 2B-0 planning are **SUPERSEDED**.

---

## 10. Release process

For meaningful production work keep this sequence:

implementation → user visual approval if visible UI changes → A5 independent QA → commit/push → candidate 0% → candidate runtime verification → **explicit user promotion approval** → production 100% → post-promotion smoke → production verified

Never skip explicit user approval before promotion.

Scripts: `scripts/deploy-candidate.ps1`, `scripts/promote-candidate.ps1`, `scripts/rollback-production.ps1`. Do not retag `stable` unless an authorized ticket says so. Current stable rollback remains `metalora-direct-00087-voy`.
