# METALORA project state

Persistent checkpoint for session handoff. Last updated after **#21-4** production verification.

This is the authoritative current-state file. Do **not** create additional overlapping status/handoff documents. `docs/operations.md` remains the runbook; do not duplicate it here.

---

## 1. Current production baseline

| Item | Value |
|------|--------|
| #21-3 | **CLOSED — PRODUCTION VERIFIED** |
| #21-4 | **CLOSED — PRODUCTION VERIFIED** |
| Production revision | `metalora-direct-00071-xuz` |
| Production traffic | **100%** |
| Production source SHA | `ebf11b39df8b37f3fdebdd2f7d670bcbbba2eb96` |
| Production image digest | `sha256:2d7d9440856b4d5aa6dc784ca80257fcbc4fbec472b19c640ad678045262caec` |
| Previous production | `metalora-direct-00069-but` @ **0%** |
| Stable rollback | `metalora-direct-00064-vat` |
| `main` / `origin/main` | `ebf11b39df8b37f3fdebdd2f7d670bcbbba2eb96` |
| Expected worktree | clean |

Cloud Run service: `metalora-direct` (`metalora-auth`, `us-west1`). After #21-4F, tag `candidate` still aliases production `00071-xuz`. Next 0% deploy must retag `candidate` without moving 100% traffic except via an approved promotion ticket. Do **not** retag `stable`.

Workspace: `C:\Users\admin\Desktop\metalora-main-clean-19f3`  
Branch: `main`

---

## 2. #21-4 verified behavior

Direct-request SEO remains **server-owned** (`server.ts` first-load HTML) and was verified on the promoted revision and `https://metalora.art`.

SPA navigation now updates/cleans via `DocumentHead`:

- `document.title`
- description
- canonical
- robots
- OG
- Twitter
- JSON-LD

Verified production transitions:

- Home → PDP → Home
- Home → policy → Home
- Home → `/login` → Home
- Product A → Product B

Verified:

- no stale Product metadata
- no stale canonical
- login `noindex` removed on return to Home
- JSON-LD does not accumulate
- canonical count stays exactly **1**
- robots lifecycle works (0 on indexable routes; exactly one `noindex, nofollow` on `/login`)

#21-1 SEO/HTTP behavior remains intact (health, unknown API JSON 404, unknown document 404+noindex, missing asset 404 text/plain, robots/sitemap/rss).

---

## 3. Future guardrails

### A. ProductContext catalog cap

Current ProductContext fetch uses `limit(20)`.

Current public visible catalog: **4 products**. **SAFE TODAY.**

**Hard future guardrail:** if public visible catalog approaches or exceeds 20, re-audit SPA Product SEO resolution **before** relying on the current `DocumentHead` implementation. Do not assume 20 is the permanent complete-catalog size.

### B. JSON-LD ownership

Current `DocumentHead` replaces **all** `script[type="application/ld+json"]`.

Current repo/runtime JSON-LD is route SEO only: Organization, WebSite, Product, BreadcrumbList. **SAFE TODAY.**

**Hard future guardrail:** if any unrelated / third-party / independent JSON-LD is introduced, `DocumentHead` ownership must be narrowed **before** release.

---

## 4. Preserved WIP / agent naming

Preserved historical WIP: `wip/19f3-preserved-20260915`

**RULE:** NEVER switch / reset / stash / clean / edit / touch this preserved WIP during current `main` work.

File ownership is governed by `.cursor/rules/01-ownership-write-scope.mdc` (A0–A6). Task tickets may explicitly authorize a cross-owner write; they do **not** transfer permanent ownership. No agent owns the whole repository.

| Name in instructions | Meaning |
|----------------------|---------|
| `보존 WIP A2` | Old original A2 attached to preserved WIP. **Do not use** for current implementation. |
| `clean main A2` | A clean-main implementation session/window used when the task’s authoritative owner allows that write. It does **not** mean A2 owns the clean-main repo, may edit cross-owner files by default, or replaces A0–A6 ownership. |
| `A5` | Independent read-only QA agent. Must also point to the clean `main` workspace before QA. |

---

## 5. #20 restore obligation

#20 status: **CLOSED WITH DEFERRED RESTORE OBLIGATION**

Do **not** reopen during #21 work.

Before **#24 live-payment activation** OR **first real production customer payment**, whichever occurs first:

- upgrade paid backup capability
- confirm scheduled backups
- record PITR status if applicable
- execute and record restore drill
- document Storage recovery

Until completed: do **not** call production restorable; do **not** enable real payments.

See `docs/operations.md` section E for the live backup-capability snapshot.

---

## 6. Product / legal holds

Keep unresolved:

- 인증·허가 = **심의 예정**
- 제조국 / 원산지 = **심의 예정**
- 수입자 = **심의 예정**

Do **not** invent: `해당없음`, `대한민국 제조`, `Made in Korea`, `KC 완료`.

---

## 7. Current customer-copy rules

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

Current mounted PDP/Home copy from **#21-3** is production verified.

---

## 8. Next #21 priorities

Recommended order:

1. **#21-5** — Sitemap DB failure semantics + lastmod accuracy
2. **#21-6** — RSS serialization hardening
3. **#21-7** — Policy metadata / server-visible content / internal-link improvements
4. **#21-8** — Google Search Console / Naver Search Advisor verification and submission evidence

Do **not** mark external search-engine submission complete without actual account/submission evidence.

---

## 9. Release process

For meaningful production work keep this sequence:

implementation → user visual approval if visible UI changes → A5 independent QA → commit/push → candidate 0% → candidate runtime verification → **explicit user promotion approval** → production 100% → post-promotion smoke → production verified

Never skip explicit user approval before promotion.

Scripts: `scripts/deploy-candidate.ps1`, `scripts/promote-candidate.ps1`, `scripts/rollback-production.ps1`. Note: `deploy-candidate.ps1` retags `stable` to current production; #21-4E skipped that step so rollback stayed `00064-vat`. Do not retag `stable` unless an authorized ticket says so.
