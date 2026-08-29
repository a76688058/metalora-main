-- =============================================================================
-- Metalora — READ-ONLY payment / order operational queries
-- =============================================================================
-- Every statement below is SELECT / WITH only.
-- Do NOT run UPDATE / INSERT / DELETE / ALTER from this file.
-- No PII columns are selected (counts / status aggregates only).
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
