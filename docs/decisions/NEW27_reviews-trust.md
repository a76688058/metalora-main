# NEW27 — Reviews / Trust

Status: **APPROVED / NOT IMPLEMENTED**

Date: 2026-10-15

Decision: `#27` Reviews / Trust is a mandatory pre-launch feature. The historical classification "optional / primarily POST-LAUNCH" is superseded for current work. The historical row stays in the pipeline notes. Implementation and independent QA must pass before NEW9 final launch pass. This note does not add a release stage and does not open NEW7. It does not change NEW6, which remains Backup / Restore.

This file lives on branch `review/prelaunch-27`. It is not integrated into the NEW6 release candidate until a later, separate merge.

## Approved purchase eligibility

- A review links to one `public.order_items.id`.
- `orders.status` must be `COMPLETED`.
- `orders.completed_at` must be present.
- `orders.payment_finalized_at` must be present.
- `orders.user_id` must be the signed-in author.
- The server decides eligibility. The client cannot send a verified-purchase flag.
- One review per `order_items.id`. Quantity does not add another review.
- A cancelled order cannot create a review.
- A refunded item cannot keep a public verified review.
- Workshop lines may be reviewed in the account area. Their `product_id` is null, so they are excluded from catalog product aggregates.

## Approved review content

- Rating is an integer from 1 to 5.
- A written review is required.
- At most 3 images, each at most 5 MB, JPEG, PNG, or WebP.
- Public pages show a verified-purchase label, the review creation time, a paginated list, the average of approved ratings, the approved count, and an empty state.
- Public order is newest approved first.
- Only `approved` reviews are public. `pending`, `rejected`, and `hidden` do not affect the average or the count.
- Public responses omit phone number and address.

## Approved customer and admin behavior

- The customer can see eligible lines, write, view, edit, and delete their own review.
- An edit returns the review to `pending`.
- Delete removes public visibility and the images. The moderation audit row remains, without the review body or image bytes.
- Admin can list the pending queue, approve, reject, hide, process a user report, and read moderation history.
- Every moderation action stores the moderator and the time.
- A non-admin cannot moderate.

## Refund and cancellation authority

Inspected schema, payment-test DDL snapshot `scripts/sql/generated/metalora-payment-test-public-schema.sql` and NEW4-6:

- `orders.status` defaults to `PENDING`. Admin fulfillment values are `PAID`, `PRODUCTION`, `SHIPPING`, `COMPLETED`.
- `orders.payment_finalized_at` marks server finalization.
- `orders.completed_at` is set when status enters `COMPLETED`. Historical `COMPLETED` rows were not backfilled and can have a null `completed_at`.
- `order_items` columns used for entitlement are `id`, `order_id`, `product_id` (nullable), `product_title`, `quantity`, `price`, `option`, `orientation`.
- No column on `orders`, `order_items`, or `payment_intents` is a confirmed refund or cancellation authority.

Do not treat any existing column as that authority.

Minimum addition, written only by the payment server with the service role:

`public.order_item_commerce_state`

- `order_item_id` primary key, references `order_items(id)`
- `order_id` not null
- `state` text check: `fulfilled`, `cancelled`, `refunded`
- `source` text check: `payment_server`
- `updated_at` timestamptz not null

Clients have no insert, update, or delete policy. Absence of a row means not eligible. A review insert requires `state = fulfilled` plus the completed-order checks above. A transition to `cancelled` or `refunded` hides a public review in the same transaction and writes a moderation event whose actor is the server. Fail closed. Synthetic payment-test fixtures may insert this row only through the service role. Production stays without this writer until a separate payment-server approval. That approval is not NEW7 opening and is not a plan upgrade.

## Image storage

Proposed bucket, not created by this note: `metalora-reviews-apne3`, region `asia-northeast3`, private, uniform bucket-level access, no public ACL. Do not use `gs://metalora-workshop-apne3` or the terminated Supabase `workshop` bucket.

Paths: `reviews/{review_id}/{uuid}.jpg` after server re-encode. The database stores the path, not a URL. Upload URLs are issued only after the ownership and eligibility checks. The server checks the declared type, the extension, the magic bytes, and the size, then re-encodes to JPEG and strips EXIF, including GPS. Reads use a signed URL that expires in 300 seconds, and only for an approved review or the author or an admin. Hidden, rejected, pending, and deleted reviews do not receive new signed URLs. A URL already issued stays valid until that 300-second expiry. Deletion removes the object. Account withdrawal must call the same removal before NEW9. Orphan objects under an incomplete upload prefix expire after 1 day by lifecycle rule. That rule is a proposal until the bucket is approved.

## Tables

`public.reviews`: `id`, `order_item_id` unique, `order_id`, `user_id`, `product_id` nullable, `rating`, `body`, `status` (`pending`, `approved`, `rejected`, `hidden`), `created_at`, `updated_at`. Links are set by the server and are not client-editable.

`public.review_images`: `id`, `review_id`, `object_path`, `content_type`, `byte_size`.

`public.review_moderation_events`: append-only `id`, `review_id`, `actor_id` nullable for the server, `action`, `from_status`, `to_status`, `created_at`. No body and no image bytes. No update or delete.

RLS: owner select on own rows. Public select only where `status = approved` and the commerce state is still `fulfilled`. Admin select for `profiles.is_admin`. No direct client insert or status update. Create, edit, and delete use one security-definer function with `search_path` locked to `pg_catalog, pg_temp`, executed as the invoker check inside the function against `auth.uid()`. Moderation uses a second function that checks `is_admin` and inserts the audit row in the same transaction. Status transitions are only those two functions.

## Ownership

A0: this contract and later `App.tsx` route mount. A6: migration, RLS, functions, bucket design, payment-test proof. A3: account and order-linked UI plus admin queue. A2: catalog review list after the frozen PDP sections, without redesigning those sections. A1: a shared star control only if one is required. A5: read-only QA after visual approval. A4: no assignment.

## QA before NEW9

Required negative cases: unpaid or non-completed order, missing `completed_at`, missing commerce-state row, cancelled, refunded, duplicate `order_item_id`, another customer's line, non-owner edit or delete, non-admin moderation, hidden review absent from the public read and from the average, oversized or non-image upload, EXIF not retained, deleted image no longer signable, withdrawal removes images, audit row remains without the review text.

Synthetic payment-test fixtures only until a real-order test is separately authorized. Do not fabricate a production payment.

## Completed

Owner approved the product requirements on 2026-10-15. Isolated branch `review/prelaunch-27` created from `80011575886215b3eac6b9af7c1802dcc74acfce`.

## Blocker / Open Item

No migration has been applied. No bucket has been created. The commerce-state writer is not authorized on production. NEW9 cannot pass until the QA list above passes on the release candidate.

## Do Not Do

- Do not implement this inside the NEW6 worktree.
- Do not apply a production migration.
- Do not apply a payment-test migration until that database write is separately approved.
- Do not create the bucket until separately approved.
- Do not open NEW7.
- Do not change the payment freeze.
- Do not add a pipeline stage.
- Do not treat this branch as already merged.

## Resume Condition

Owner authorizes A6 to draft the payment-test migration in this worktree. Bucket creation remains a separate approval.

## Resume Procedure

A6 writes the migration and verifier in `C:\Users\admin\Desktop\metalora-reviews` only. Stop before applying it.

## Ownership

A0 for this note. A6 for schema and storage. A3 for account and moderation UI. A2 for the catalog list. A5 for QA.

## Relevant Files

`docs/decisions/RELEASE_remaining-pipeline.md`, `docs/decisions/NEW-1_launch-pipeline-v3.md`, `src/types/database.ts`, `src/components/admin/adminOrders.ts`, `supabase/migrations/20260826120000_16a1_orders_order_items_rls.sql`, `supabase/migrations/20261007070000_new4_6_workshop_retention.sql`.
