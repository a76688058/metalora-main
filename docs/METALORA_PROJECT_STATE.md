# METALORA project state

Persistent checkpoint for session handoff. Last updated after **#22 official closure**.

This is the authoritative current-state file. Do **not** create additional overlapping status/handoff documents. `docs/operations.md` remains the runbook; do not duplicate it here.

---

## 1. Current production baseline

| Item | Value |
|------|--------|
| #20 | **CLOSED WITH DEFERRED RESTORE OBLIGATION** |
| #21 | **CLOSED** |
| #22 | **CLOSED** |
| #23 | **NOT OPENED** |
| Production revision | `metalora-direct-00090-kig` |
| Production traffic | **100%** |
| Production source SHA | `0bb40e988a019716e748d12874693c247bfc410f` |
| Production image digest | `sha256:d45a463cc1ec05957c4064b4b2b2bc697161462c8823459115fe8607fea619c9` |
| Stable rollback | `metalora-direct-00087-voy` |
| `main` / `origin/main` (docs HEAD) | `b75483e4299206a7e4d23567b84ae6a8469601f4` |
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

Accepted A5 MINOR findings from #22J remain **ACCEPTED / NON-BLOCKING**. They were **not** fixed in #22.

See `docs/decisions/22J_privacy-cookie-package-promotion.md`.

---

## 5. #20 restore obligation

#20 status: **CLOSED WITH DEFERRED RESTORE OBLIGATION**

Do **not** reopen #20 because #22 closed.

Before **#24 live-payment activation** OR **first real production customer payment**, whichever occurs first:

- upgrade paid backup capability
- confirm scheduled backups
- record PITR status if applicable
- execute and record restore drill
- document Storage recovery

Until completed: do **not** call production restorable; do **not** enable real payments.

See `docs/operations.md` section E for the live backup-capability snapshot.

---

## 6. Pipeline

| Stage | Status |
|------|--------|
| #20 | CLOSED WITH DEFERRED RESTORE OBLIGATION |
| #21 | CLOSED |
| #22 | CLOSED |
| #23 | **NOT OPENED** |
| #24 | not opened (live payment / restore gate) |

Do **not** automatically open or implement #23. Do not alter #23 scope here.

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
