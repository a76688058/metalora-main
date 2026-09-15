-- =============================================================================
-- Metalora — READ-ONLY payment / order operational queries
-- =============================================================================
-- Every statement below is SELECT / WITH only.
-- Do NOT run UPDATE / INSERT / DELETE / ALTER from this file.
-- No PII columns are selected (counts / status aggregates / internal IDs).
-- Queries A–H: payment-flow volume / stale-intent / legacy unmarked.
-- Queries #20J-*: commerce/data anomaly detection. NO AUTO-REPAIR.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A. Unfinalized payment intents
--    Intents with no matching order that has payment_finalized_at set.
-- -----------------------------------------------------------------------------
SELECT COUNT(*) AS unfinalized_intent_count
FROM public.payment_intents AS pi
WHERE NOT EXISTS (
  SELECT 1
  FROM public.orders AS o
  WHERE o.order_number = pi.order_number
    AND o.payment_finalized_at IS NOT NULL
);

-- -----------------------------------------------------------------------------
-- B. Payment intents older than 24 hours without finalized orders
-- -----------------------------------------------------------------------------
SELECT COUNT(*) AS stale_intent_over_24h_count
FROM public.payment_intents AS pi
WHERE pi.created_at < now() - interval '24 hours'
  AND NOT EXISTS (
    SELECT 1
    FROM public.orders AS o
    WHERE o.order_number = pi.order_number
      AND o.payment_finalized_at IS NOT NULL
  );

-- -----------------------------------------------------------------------------
-- C. Finalized new-flow order count
-- -----------------------------------------------------------------------------
SELECT COUNT(*) AS finalized_order_count
FROM public.orders
WHERE payment_finalized_at IS NOT NULL;

-- -----------------------------------------------------------------------------
-- D. Legacy / unmarked order count
-- -----------------------------------------------------------------------------
SELECT COUNT(*) AS legacy_unmarked_order_count
FROM public.orders
WHERE payment_finalized_at IS NULL;

-- -----------------------------------------------------------------------------
-- E. Paid-like unmarked orders with zero relational order_items
--    Known paid-like / fulfillment statuses only.
--    Do NOT treat '결제대기' as paid.
-- -----------------------------------------------------------------------------
SELECT COUNT(*) AS paid_like_unmarked_zero_items_count
FROM public.orders AS o
WHERE o.payment_finalized_at IS NULL
  AND o.status IN (
    'PAID',
    'PRODUCTION',
    'SHIPPING',
    'COMPLETED',
    '결제확인',
    '제작중',
    '배송중',
    '배송완료',
    '구매확정'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.order_items AS oi
    WHERE oi.order_id = o.id
  );

-- -----------------------------------------------------------------------------
-- F. Finalized orders with zero relational order_items
--    (should be near-zero for healthy new-flow finalizations)
-- -----------------------------------------------------------------------------
SELECT COUNT(*) AS finalized_zero_items_count
FROM public.orders AS o
WHERE o.payment_finalized_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.order_items AS oi
    WHERE oi.order_id = o.id
  );

-- -----------------------------------------------------------------------------
-- G. Payment intents with matching finalized orders
-- -----------------------------------------------------------------------------
SELECT COUNT(*) AS intents_with_finalized_order_count
FROM public.payment_intents AS pi
WHERE EXISTS (
  SELECT 1
  FROM public.orders AS o
  WHERE o.order_number = pi.order_number
    AND o.payment_finalized_at IS NOT NULL
);

-- -----------------------------------------------------------------------------
-- H. Status distribution for orders
-- -----------------------------------------------------------------------------
SELECT
  o.status,
  COUNT(*) AS order_count
FROM public.orders AS o
GROUP BY o.status
ORDER BY order_count DESC, o.status ASC;

-- =============================================================================
-- #20J — Commerce / data anomaly detection
-- =============================================================================
-- SELECT / WITH only. Do not INSERT / UPDATE / DELETE / UPSERT / MERGE /
-- ALTER / DROP / CREATE / TRUNCATE / FOR UPDATE / call mutating RPCs.
-- Do not repair rows from these results.
-- Correlate with Cloud Logging [PAYMENT_OPS_FAILURE] (#20C) and Discord
-- alert_eligible=true (#20D) using order_number + request_id + deploy_sha
-- + time window. GA4 is #22 and is not part of this workflow.
--
-- Schema sources: supabase/migrations (16B-2A, 16C-1, 17B-2, 18A-1, 18B-1),
-- scripts/sql/generated/metalora-payment-test-public-schema.sql (live extract),
-- server.ts finalize/prepare, src/lib/authIntegrity.ts, memberUsername.ts.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- #20J-1. Payment amount mismatch (finalized new-flow only)
--
-- Anomaly: payment_intents.total_price (authoritative prepare snapshot) differs
--          from orders.total_price after payment_finalized_at is set.
-- Inclusion: INNER JOIN on order_number AND orders.payment_finalized_at IS NOT NULL.
--            Unfinished intents, abandoned attempts, and legacy unmarked orders
--            (payment_finalized_at IS NULL) are excluded — they have no comparable
--            finalized amount under the #18 contract.
-- Healthy: zero rows (finalize_paid_order requires p_paid_amount = p_total_price
--          and confirm compares Toss amount to intent total_price).
-- Severity: HIGH (reconciliation-required).
-- Operator: inspect order_number; correlate #20C logs / #20D if alerted.
--           Do NOT UPDATE orders.total_price or profiles.total_spent.
-- NO AUTO-REPAIR.
-- -----------------------------------------------------------------------------
SELECT
  o.order_number,
  pi.total_price AS intent_total,
  o.total_price AS order_total,
  (o.total_price - pi.total_price) AS delta,
  o.payment_finalized_at
FROM public.payment_intents AS pi
INNER JOIN public.orders AS o
  ON o.order_number = pi.order_number
WHERE o.payment_finalized_at IS NOT NULL
  AND pi.total_price IS DISTINCT FROM o.total_price
ORDER BY o.payment_finalized_at DESC, o.order_number;

-- -----------------------------------------------------------------------------
-- #20J-1b. Finalized ownership mismatch (intent user_id vs order user_id)
--
-- Anomaly: same order_number finalized, but payment_intents.user_id differs
--          from orders.user_id (#17B server-derived ownership).
-- Healthy: zero rows.
-- Severity: HIGH.
-- Operator: inspect IDs only; do not reassign user_id in SQL.
-- NO AUTO-REPAIR.
-- -----------------------------------------------------------------------------
SELECT
  o.order_number,
  pi.user_id AS intent_user_id,
  o.user_id AS order_user_id,
  o.payment_finalized_at
FROM public.payment_intents AS pi
INNER JOIN public.orders AS o
  ON o.order_number = pi.order_number
WHERE o.payment_finalized_at IS NOT NULL
  AND pi.user_id IS DISTINCT FROM o.user_id
ORDER BY o.payment_finalized_at DESC, o.order_number;

-- -----------------------------------------------------------------------------
-- #20J-2. Duplicate order_number — remaining cross-table collision
--
-- Intra-table duplicates are structurally impossible:
--   orders.order_number UNIQUE (orders_order_number_key)
--   payment_intents.order_number PRIMARY KEY
-- Matching order_number on BOTH tables is NORMAL for #18 new-flow (intent then
-- finalized order). Do not treat that join as a duplicate.
--
-- Remaining real anomaly: a payment_intent whose order_number already exists
-- as an UNMARKED order (payment_finalized_at IS NULL). Confirm returns
-- recovery_required / 409; finalize_paid_order refuses to overwrite legacy rows.
-- Healthy: zero rows.
-- Severity: HIGH (reconciliation-required).
-- Operator: correlate #20C recovery_required / #20D; do not DELETE/UPDATE the
--           unmarked order from this pack; do not invent order_items.
-- NO AUTO-REPAIR.
-- -----------------------------------------------------------------------------
SELECT
  pi.order_number,
  o.id AS unmarked_order_id,
  o.status AS unmarked_status,
  pi.created_at AS intent_created_at,
  o.created_at AS unmarked_order_created_at
FROM public.payment_intents AS pi
INNER JOIN public.orders AS o
  ON o.order_number = pi.order_number
WHERE o.payment_finalized_at IS NULL
ORDER BY pi.created_at DESC, pi.order_number;

-- -----------------------------------------------------------------------------
-- #20J-3. Duplicate payment identifier reuse
--
-- Storage contract (do NOT treat orders."paymentKey" as the #18 authority):
--   New-flow: shipping_info.payment_key (JSONB text), written at finalize.
--   Legacy column orders."paymentKey" may still exist; finalize_paid_order does
--   not write it. Prefer JSONB, fall back to the legacy column when JSONB is blank.
-- No UNIQUE constraint exists on either location, so reuse CAN occur.
-- Output is md5 fingerprint + counts + order_number list — never the raw key,
-- never shipping_info, never Toss payload.
-- Healthy: zero rows.
-- Severity: HIGH (PSP identifier reused across orders).
-- Operator: inspect listed order_numbers; correlate #20C; do not UPDATE keys.
-- NO AUTO-REPAIR.
-- -----------------------------------------------------------------------------
WITH extracted AS (
  SELECT
    o.id AS order_id,
    o.order_number,
    o.payment_finalized_at,
    NULLIF(btrim(
      COALESCE(
        CASE
          WHEN jsonb_typeof(o.shipping_info) = 'object'
            THEN o.shipping_info ->> 'payment_key'
          ELSE NULL
        END,
        o."paymentKey"
      )
    ), '') AS payment_identifier
  FROM public.orders AS o
),
fingerprinted AS (
  SELECT
    order_id,
    order_number,
    payment_finalized_at,
    md5(payment_identifier) AS payment_key_fingerprint
  FROM extracted
  WHERE payment_identifier IS NOT NULL
)
SELECT
  f.payment_key_fingerprint,
  COUNT(*) AS order_row_count,
  COUNT(*) FILTER (WHERE f.payment_finalized_at IS NOT NULL) AS finalized_count,
  string_agg(f.order_number, ', ' ORDER BY f.order_number) AS order_numbers
FROM fingerprinted AS f
GROUP BY f.payment_key_fingerprint
HAVING COUNT(*) > 1
ORDER BY order_row_count DESC, f.payment_key_fingerprint;

-- -----------------------------------------------------------------------------
-- #20J-3b. Same-order conflicting payment identifiers (JSONB vs legacy column)
--
-- Anomaly: both shipping_info.payment_key and orders."paymentKey" are non-blank
--          and not equal. Fingerprints only.
-- Healthy: zero rows.
-- Severity: REVIEW (not automatically pager-level).
-- Operator: treat JSONB payment_key as the #18 new-flow value; do not overwrite.
-- NO AUTO-REPAIR.
-- -----------------------------------------------------------------------------
SELECT
  o.order_number,
  md5(NULLIF(btrim(o.shipping_info ->> 'payment_key'), '')) AS jsonb_key_fingerprint,
  md5(NULLIF(btrim(o."paymentKey"), '')) AS legacy_column_fingerprint,
  (o.payment_finalized_at IS NOT NULL) AS is_finalized
FROM public.orders AS o
WHERE jsonb_typeof(o.shipping_info) = 'object'
  AND NULLIF(btrim(o.shipping_info ->> 'payment_key'), '') IS NOT NULL
  AND NULLIF(btrim(o."paymentKey"), '') IS NOT NULL
  AND btrim(o.shipping_info ->> 'payment_key') IS DISTINCT FROM btrim(o."paymentKey")
ORDER BY o.order_number;

-- -----------------------------------------------------------------------------
-- #20J-4. profiles.total_spent vs finalized-order totals
--
-- Qualifying orders: payment_finalized_at IS NOT NULL only.
-- finalize_paid_order increments total_spent by p_paid_amount, which must equal
-- orders.total_price. Legacy unmarked orders (payment_finalized_at IS NULL) were
-- never incremented by this RPC — do not include them (false positives).
-- Healthy: zero rows (stored IS NOT DISTINCT FROM SUM(finalized total_price)).
-- Severity: HIGH when a row appears (money mismatch). Manual correction of
--           total_spent is prohibited without a separate recovery procedure.
-- Operator: inspect profile id + delta; do NOT UPDATE profiles.total_spent.
-- NO AUTO-REPAIR.
-- -----------------------------------------------------------------------------
SELECT
  p.id AS profile_id,
  p.total_spent AS stored_total_spent,
  COALESCE(x.finalized_sum, 0) AS calculated_finalized_sum,
  (p.total_spent - COALESCE(x.finalized_sum, 0)) AS delta
FROM public.profiles AS p
LEFT JOIN (
  SELECT
    o.user_id,
    SUM(o.total_price) AS finalized_sum
  FROM public.orders AS o
  WHERE o.payment_finalized_at IS NOT NULL
  GROUP BY o.user_id
) AS x ON x.user_id = p.id
WHERE p.total_spent IS DISTINCT FROM COALESCE(x.finalized_sum, 0)
ORDER BY ABS(p.total_spent - COALESCE(x.finalized_sum, 0)) DESC, p.id;

-- -----------------------------------------------------------------------------
-- #20J-5. Profile / member anomalies (#16 / #17)
--
-- Intentional exceptions (do NOT flag as anomalies):
--   profiles.user_custom_id IS NULL for non-member / admin-provisioned accounts
--     (16C-1 COMMENT; CHECK allows NULL; isUsableMemberProfile requires a
--     non-blank username for member checkout, not for every profile row).
--   Duplicate username: structurally prevented by idx_profiles_user_custom_id
--     and profiles_user_custom_id_lower_uidx. Not queried as a live duplicate.
--   Format-invalid username: prevented by profiles_user_custom_id_format CHECK.
-- -----------------------------------------------------------------------------

-- #20J-5a. Finalized orders whose owner has no profiles row
-- Anomaly: commerce ownership points at a missing profile.
-- Healthy: zero rows.
-- Severity: HIGH (reconciliation-required).
-- Operator: inspect user_id / order_number; do not INSERT a fake profile from SQL.
-- NO AUTO-REPAIR.
SELECT
  o.order_number,
  o.user_id,
  o.payment_finalized_at
FROM public.orders AS o
WHERE o.payment_finalized_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = o.user_id
  )
ORDER BY o.payment_finalized_at DESC, o.order_number;

-- #20J-5b. Payment intents whose user_id has no profiles row
-- Anomaly: prepare snapshot exists without a profile (finalize would fail
--          "Profile update failed").
-- Healthy: zero rows.
-- Severity: HIGH if the intent is still unfinalized (recovery path blocked).
-- Operator: correlate #20C db_finalize_rpc; do not INSERT profiles from SQL.
-- NO AUTO-REPAIR.
SELECT
  pi.order_number,
  pi.user_id,
  pi.created_at,
  EXISTS (
    SELECT 1
    FROM public.orders AS o
    WHERE o.order_number = pi.order_number
      AND o.payment_finalized_at IS NOT NULL
  ) AS has_finalized_order
FROM public.payment_intents AS pi
WHERE NOT EXISTS (
  SELECT 1
  FROM public.profiles AS p
  WHERE p.id = pi.user_id
)
ORDER BY pi.created_at DESC, pi.order_number;

-- #20J-5c. Member-domain auth users whose profile username is NULL
-- Anomaly: @metalora.me signup contract requires non-blank user_custom_id
--          (handle_new_user / memberUsername). NULL username is still valid
--          for non-member emails and admin-provisioned rows — those are excluded
--          by the email-domain predicate. Email itself is not projected.
-- Requires a SQL role that can SELECT auth.users (typical: postgres).
-- Healthy: zero rows.
-- Severity: REVIEW (member identity unusable; not automatically pager-level).
-- Operator: inspect profile id only; do not rewrite user_custom_id here.
-- NO AUTO-REPAIR.
SELECT
  p.id AS profile_id,
  p.is_admin
FROM public.profiles AS p
INNER JOIN auth.users AS u ON u.id = p.id
WHERE p.user_custom_id IS NULL
  AND u.email ILIKE '%@metalora.me'
ORDER BY p.id;

-- -----------------------------------------------------------------------------
-- #20J-6. Catalog / soft-stock consistency
--
-- DISCLAIMER: products.options.stock is a catalog availability flag checked at
-- /api/payment/prepare only. It is NOT decremented, NOT row-locked, and NOT an
-- inventory ledger. These queries do NOT prove physical inventory accuracy.
--
-- Prepare semantics used here:
--   is_visible IS DISTINCT FROM false  → product is treated as visible
--   option isActive JSON false         → rejected
--   numeric stock <= 0                 → rejected
--   non-numeric / missing stock        → prepare does NOT reject (inconsistent
--                                        catalog data; flagged separately)
-- Healthy: zero rows for 6a–6d. 6e may list sold-out-but-visible products (INFO).
-- Operator: fix catalog in admin UI; do not SQL-patch options JSON here.
-- NO AUTO-REPAIR.
-- -----------------------------------------------------------------------------

-- #20J-6a. Visible products whose options is not a JSON array
-- Severity: REVIEW (prepare cannot match options).
SELECT
  p.id AS product_id,
  COALESCE(jsonb_typeof(p.options), 'null') AS options_json_type,
  (p.is_visible IS DISTINCT FROM false) AS treated_as_visible
FROM public.products AS p
WHERE p.is_visible IS DISTINCT FROM false
  AND jsonb_typeof(p.options) IS DISTINCT FROM 'array'
ORDER BY p.id;

-- #20J-6b. Negative numeric stock on an option (defensive numeric parse)
-- Severity: REVIEW.
SELECT
  p.id AS product_id,
  opt.elem ->> 'id' AS option_id,
  CASE
    WHEN opt.elem ->> 'stock' ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN (opt.elem ->> 'stock')::numeric
    ELSE NULL
  END AS parsed_stock
FROM public.products AS p
CROSS JOIN LATERAL jsonb_array_elements(p.options) AS opt(elem)
WHERE jsonb_typeof(p.options) = 'array'
  AND jsonb_typeof(opt.elem) = 'object'
  AND CASE
    WHEN opt.elem ->> 'stock' ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN (opt.elem ->> 'stock')::numeric
    ELSE NULL
  END < 0
ORDER BY p.id, option_id;

-- #20J-6c. Malformed / non-numeric stock when the key is present
-- Severity: REVIEW (prepare Number() is non-finite → does not block purchase).
SELECT
  p.id AS product_id,
  opt.elem ->> 'id' AS option_id,
  jsonb_typeof(opt.elem -> 'stock') AS stock_json_type
FROM public.products AS p
CROSS JOIN LATERAL jsonb_array_elements(p.options) AS opt(elem)
WHERE jsonb_typeof(p.options) = 'array'
  AND jsonb_typeof(opt.elem) = 'object'
  AND (opt.elem ? 'stock')
  AND jsonb_typeof(opt.elem -> 'stock') IS DISTINCT FROM 'null'
  AND NOT (opt.elem ->> 'stock' ~ '^-?[0-9]+(\.[0-9]+)?$')
ORDER BY p.id, option_id;

-- #20J-6d. Duplicate option id within one product (prepare uses first match)
-- Severity: REVIEW.
SELECT
  p.id AS product_id,
  opt.elem ->> 'id' AS option_id,
  COUNT(*) AS option_id_count
FROM public.products AS p
CROSS JOIN LATERAL jsonb_array_elements(p.options) AS opt(elem)
WHERE jsonb_typeof(p.options) = 'array'
  AND jsonb_typeof(opt.elem) = 'object'
  AND NULLIF(btrim(opt.elem ->> 'id'), '') IS NOT NULL
GROUP BY p.id, opt.elem ->> 'id'
HAVING COUNT(*) > 1
ORDER BY option_id_count DESC, p.id, option_id;

-- #20J-6e. Visible product with no prepare-purchasable option
-- Purchasable = option object with id, isActive is not JSON false, and stock
-- is not a parsed number <= 0. Empty/malformed options already covered above.
-- Severity: INFO (may be intentional sold-out; hide via is_visible if needed).
SELECT
  p.id AS product_id
FROM public.products AS p
WHERE p.is_visible IS DISTINCT FROM false
  AND jsonb_typeof(p.options) = 'array'
  AND jsonb_array_length(p.options) >= 0
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p.options) AS opt(elem)
    WHERE jsonb_typeof(opt.elem) = 'object'
      AND NULLIF(btrim(opt.elem ->> 'id'), '') IS NOT NULL
      AND opt.elem -> 'isActive' IS DISTINCT FROM 'false'::jsonb
      AND COALESCE(
        CASE
          WHEN opt.elem ->> 'stock' ~ '^-?[0-9]+(\.[0-9]+)?$'
            THEN (opt.elem ->> 'stock')::numeric
          ELSE NULL
        END,
        1
      ) > 0
  )
ORDER BY p.id;
