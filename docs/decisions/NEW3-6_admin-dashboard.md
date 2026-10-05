# NEW3-6 — Admin dashboard operational fix

Status: **READY FOR NEW3-6 FINAL QA**

Date: 2026-10-05

Decision: `/admin` keeps the existing analytics blocks. Decorative/false copy is removed. Fetch failure is never shown as a live zero. Range tabs cannot display another range’s totals. Totals/chart/calendar/day-detail page through PostgREST instead of relying on the default row cap.

## Retained dashboard blocks

- Revenue + 일간/월간/연간 tabs
- Order count
- Average order value
- Product count
- 14-day revenue chart
- KST revenue calendar
- Day-click detail sheet (revenue, order count, top item)

## Removed

- Quote: “Premium Metal Art Membership”
- False copy: “데이터는 1시간마다 자동으로 갱신됩니다.”
- AOV commentary: “프리미엄 세그먼트 유지 중”
- Unused `useProducts()` / ProductContext
- Unused decorative imports (`Globe`, `Activity`, unused Recharts pie/bar)
- Title “대시보드 v2.0” and “실시간” subtitle (no auto-refresh exists)

## Canonical status contract

Paid-commerce metrics include only:

`PAID` · `PRODUCTION` · `SHIPPING` · `COMPLETED`

Same stored values as NEW3-2 / NEW3-3. Korean/lowercase aliases (`결제확인`, `paid`, …) are **not** included. No new statuses.

## Error vs zero

Each query surface has its own load state.

- Success with zero rows → genuine `₩0` / `0건` / `0개`
- Failure → `—` or an explicit error + `다시 시도`
- Product count failure cannot render as `0개`
- Stats failure cannot render as live `₩0` / `0건`

Previous confirmed values are shown only when they belong to the exact selected range (or exact calendar month). Retry of a range clears that range’s cache first, so a failed refresh cannot keep unlabeled totals on screen. No unlabeled stale fallback.

## Range cache / loading

Stats are keyed by `daily` | `monthly` | `yearly`. Changing tabs shows:

- cached values for that exact range, or
- a skeleton while that range loads

The previous tab’s numbers are not kept in the newly selected tab. Layout stays mounted; range switch is not a full-page spinner.

## Comparison semantics

Compared values are **current-range paid revenue** vs **previous-range paid revenue** (same paid-status contract). All three tabs compute a real previous window:

| Range | Current | Previous | Label |
|---|---|---|---|
| 일간 | KST today | previous KST day | 전일 대비 |
| 월간 | KST this month | previous KST month | 전월 대비 |
| 연간 | KST this year | previous KST year | 전년 대비 |

Zero-base / rounding:

- previous `0` and current `0` → `변동 없음` (no up/down icon, no `0% 상승`)
- previous `0` and current `> 0` → `{기간} 신규 매출 발생` (no manufactured `100%` / `∞%` / `NaN%`)
- previous `> 0` and rounded percent `0` → `변동 없음` (no `-0% 감소` / `0% 상승`)
- previous `> 0` and percent `> 0` → `{기간} N% 상승`
- previous `> 0` and percent `< 0` → `{기간} N% 감소`

Queries are unchanged; only the comparison mapping and label are corrected.

## Query strategy

No dashboard RPC aggregation is in the current client contract. All order reads use explicit paged retrieval:

- page size `1000`
- `.range(from, to)` until a short page
- max 100 pages; hitting the cap is an **error**, not a silent undercount
- selects are field-limited (`id, total_price` / `id, total_price, created_at` / `id, total_price, ordered_items`)
- product count: `select('id', { count: 'exact', head: true })`

## Calendar / day detail

- Same paid-status contract and KST day boundaries as before
- Month switch clears heatmap until that month’s query succeeds (failed/missing month is not drawn as empty-zero days)
- Day sheet pages all matching rows; query errors are visible in the sheet
- Genuine empty day still shows `0` / `데이터 없음` after a successful fetch

## Async race

Independent generation refs for stats, calendar, trend, products, and day report. Latest-request-wins. Unmount increments all refs. Retry uses the same loaders.

## Ops counts

**Skipped.** PAID / PRODUCTION work-queue counts would need extra queries and are not implied by the range/calendar payloads. Correctness over new features.

## Do Not Do

- Do not edit preserved WIP.
- Do not redesign the chart/calendar visual system.
- Do not commit / deploy / mutate production.
