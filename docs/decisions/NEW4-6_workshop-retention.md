# NEW4-6 — Workshop image retention automation

Status: **READY FOR A6/A5 RETENTION REVIEW**

Date: 2026-10-07

Decision: Persist a server-side `orders.completed_at` when an operator moves an order INTO `COMPLETED`, then purge Workshop customer original + preview Storage objects after 3 days using the existing service-role Storage API `.remove()`. Record `orders.image_purged_at` only after both physical deletion and reference cleanup succeed. Also purge never-ordered Workshop uploads after 3 days of inactivity. Public 3-day copy is **not** published. Production was **not** mutated.

Payment: **FROZEN until NEW7**. This ticket does not touch payment authority or `PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7`.

---

## Completion timestamp

Field: `orders.completed_at timestamptz null`

Set when: DB trigger `orders_workshop_retention_clock` sees `status` transition INTO `COMPLETED`. Clock is `pg_catalog.now()`. Admin UI still only sends `{ status }` (plus courier/tracking when required). The client cannot supply this timestamp.

Ordinary unrelated updates: trigger copies `OLD.completed_at`. Courier/tracking edits do not rewrite it.

Status leaves `COMPLETED` before purge (`image_purged_at` is null): `completed_at` is cleared so a stale clock cannot continue toward purge.

Status later re-enters `COMPLETED` before purge: a **fresh** `completed_at` is set.

After assets are already purged (`image_purged_at` set): leaving or re-entering `COMPLETED` keeps the existing clocks. The implementation does not restore files.

Historical completed orders: **not backfilled**. Existing `COMPLETED` rows keep `completed_at` null. They are **not** eligible for auto-purge. Do not fabricate from `created_at` or `payment_finalized_at`.

Safe later ops handling (not this ticket): a dedicated ops ticket may set `completed_at = now()` on reviewed historical Workshop `COMPLETED` rows, starting a **fresh** 3-day clock. UI cannot currently leave `COMPLETED`, so do not rely on a re-transition without an explicit ops action.

---

## Purge evidence

Field: `orders.image_purged_at timestamptz null`

Set only after:

1. Storage API `supabase.storage.from('workshop').remove(paths)` succeeded for every referenced customer object (missing objects count as success)
2. stale operational image references were cleaned
3. the order row is still `COMPLETED` and `image_purged_at` is still null

Non-`service_role` updates cannot set or clear `image_purged_at` (trigger restores `OLD.image_purged_at`).

Partial failure: leave `image_purged_at` null and retry later. A failed object does not mark the order purged.

---

## Completed-order purge eligibility

All of:

- Workshop/customer-image order (`workshop-single` / `is_custom` / `shaderType = 커스텀 제작` / remaining original+preview URL keys, or live workshop Storage paths)
- `status = COMPLETED`
- `completed_at` is not null
- `completed_at <= now() - 3 days`
- `image_purged_at` is null

Not eligible: `PAID`, `PRODUCTION`, `SHIPPING`. Catalog product images are not deleted. Payment time is not the clock.

Assets deleted: original (`originals/{uid}/…`) **YES**; preview/derived (`previews/{uid}/…`) **YES**. Paths are parsed from stored URLs, not guessed.

Reference cleanup (null image URLs only; keep product/option/qty/price/ids/history):

- `orders.ordered_items` image / `user_image_url` / `custom_config.original_image_url` / `custom_config.preview_image_url`
- `payment_intents.validated_snapshot` matching `order_number`
- `cart_items` workshop rows that still point at those paths (delete `workshop-single` rows; otherwise null image fields)
- `user_progress.uploaded_image_url` when it is the same Storage object

`order_items` has no live `user_image_url` column (finalize persists title/qty/price/option/orientation only). Image facts live in `ordered_items` JSON.

Order/payment/contract rows: **retained**.

Reprint after purge: customer must re-upload. No app-managed backup copy was found (`collections` is unused; catalog `products` images are not Workshop customer uploads).

---

## Abandoned / never-ordered uploads

Definition: a canonical `workshop` object under `originals/` or `previews/` that is **not** referenced by an unpurged order, and is older than 3 days, and is not protected by recent cart / progress / in-flight payment-intent activity.

Last-activity sources (existing, not invented):

- unpurged `orders.ordered_items` paths — order lifecycle, not abandoned
- `cart_items.created_at` (only cart timestamp; quantity edits do not refresh the clock)
- `user_progress.updated_at`
- `payment_intents.created_at` for in-flight snapshots younger than 3 days
- Storage object `created_at` (fallback `updated_at`) for unreferenced objects

3-day rule: last relevant activity `<= now() - 3 days`.

Ordered assets protected: **YES**. Unpurged order references win over the abandoned clock, including `PAID` / `PRODUCTION` / `SHIPPING` / `COMPLETED` not yet purged.

References cleaned: same cart / progress / stale unpaid intent snapshot image URLs as above. Intent/order rows are not deleted.

Draft `user_progress` blob URLs are not stored (client skips `blob:`). Durable abandoned objects are Storage originals/previews leftover from cart-add, failed cleanup, or never-ordered cart rows.

---

## Automation

Mechanism: Cloud Run / `server.ts` `POST /api/internal/workshop-retention/purge` using service-role Storage `.remove()`. pg_cron was not used because a DB-native `DELETE FROM storage.objects` is not accepted as proof of physical object removal.

Authorization: `Authorization: Bearer $WORKSHOP_RETENTION_JOB_SECRET` (min 32 chars), compared with `timingSafeEqual`. No spoofable internal header. Unconfigured secret → 503. Wrong secret → 401. Not a public API.

Schedule: designed for **hourly** Cloud Scheduler. Not configured in this ticket. Eligibility is `completed_at + 3 days`; the next hourly run then purges. Future customer copy, when later published, must not claim stricter than “배송완료 상태 처리 후 3일이 지나면 순차 삭제”. **Not published now.**

Idempotent: **YES**. Re-running after success no-ops (`image_purged_at` set; missing Storage objects succeed; null refs stay null).

Physical Storage deletion verified: **YES at implementation level** — `supabase.storage.from('workshop').remove([path])` (same supported helper as `removeWorkshopPaths`). No remote deletion was executed from this ticket.

---

## Failure / retry

Storage delete failure: `image_purged_at` remains null; retry later.

Missing object: treated as success for that path.

DB reference cleanup failure after object deletion: do not stamp `image_purged_at`; retry cleanup (Storage remove of already-gone objects is success; workshop markers remain after URL strip so eligibility is not wedged).

Batch: up to 25 **eligible Workshop** completed orders per run. Candidates are loaded with keyset pagination `(completed_at ASC, id ASC)` in pages of 100, skipping non-Workshop COMPLETED rows in application code. Catalog/non-Workshop completed orders are **never** stamped `image_purged_at` to skip them. Offset pagination is not used.

Abandoned pass: if Storage delete succeeds and DB ref cleanup fails, objects may be absent from later listings so leftover refs are not automatically retried. **Follow-up (non-blocking):** do not reorder to cleanup-before-delete (that can stamp a Workshop order whose `collectWorkshopPaths` became empty while files remain). No schema/queue in this patch.

Logs: order number, attempted/deleted counts, reason class. No raw image URLs, signed tokens, secrets, or customer PII.

---

## Migrations

Path: `supabase/migrations/20261007070000_new4_6_workshop_retention.sql`

Production applied: **NO**

Historical `completed_at` fabricated: **NO**

NEW4-5 files/semantics: **preserved** (not modified).

Future deployment order before any NEW4 candidate that includes these changes is promoted:

1. `supabase/migrations/20261006220000_new4_5_consent_ledger.sql`
2. `supabase/migrations/20261006223000_new4_5a_restrict_consent_rpc.sql`
3. `supabase/migrations/20261007070000_new4_6_workshop_retention.sql`
4. app deploy containing the NEW4-6 purge endpoint
5. later dedicated ticket: Secret Manager `WORKSHOP_RETENTION_JOB_SECRET` + hourly Cloud Scheduler (OIDC + bearer). **Not this ticket.**

Non-blocking NEW4-5 documentation gap (do not reopen NEW4-5): a NEW4-5 release requires **both** consent migrations (ledger + 5A RPC restriction) before app promote. They remain unapplied.

---

## Public policy

3-day promise added: **NO**

Stale old privacy 7-day copy changed: **NO** (NEW4-4 later)

NEW4-0 owner lock is unchanged. This ticket implements backend capability only.

---

## NEW4-7 dependency

Purge keys durable order numbers/ids and Storage paths (`originals|{previews}/{uid}/{file}`), not a live Auth profile. Abandoned listing walks the `workshop` bucket, so objects can still be purged after Auth user deletion.

NEW4-7 must not assume Workshop images remain available after this purge clock. Account deletion should not rely on `user_progress` / `cart_items` alone; leftover Storage objects are covered by the abandoned pass.

`orders.user_id` is currently `NOT NULL` with no anonymization path — that remains a NEW4-7 concern, not this ticket. CASCADE on `user_agreements.user_id` is unchanged here.

---

## Production mutation

deploy: **NONE**  
Supabase mutation: **NONE**  
Storage deletion: **NONE**  
scheduler mutation: **NONE**  
payment activation: **NONE**

---

## Do Not Do

- Do not apply these migrations now
- Do not push / deploy / configure Cloud Scheduler from this ticket
- Do not publish 3-day customer copy
- Do not fabricate historical `completed_at`
- Do not `DELETE FROM storage.objects` as a substitute for Storage API remove
- Do not edit protected A3 WIP or `dist/`

---

## Ownership

A6. Admin `COMPLETED` clock is DB-trigger backed so `AdminOrders.tsx` / protected overlays were not edited.

Relevant files:

- `supabase/migrations/20261007070000_new4_6_workshop_retention.sql`
- `src/lib/workshopRetention.ts`
- `server.ts`
- `scripts/verify-new4-6-workshop-retention.ts`
- `.env.example` / `.env.payment-test.example` (secret **name** only)
