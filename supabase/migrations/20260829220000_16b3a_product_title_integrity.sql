-- #16B-3A — Product title integrity
-- Applied to shared Supabase project (production + metalora-cursor-test).
--
-- Live validated: zero NULL/blank titles after legacy row cleanup.
-- Guarded DELETE below is safe for migration replay on older DB snapshots.
--
-- Scope:
--   - Remove one known legacy incomplete product (if still present)
--   - products.title NOT NULL + non-blank CHECK
--
-- Out of scope:
--   - profiles.user_custom_id, orders.status, title uniqueness
--   - RLS, indexes, FK changes, application code

BEGIN;

-- ---------------------------------------------------------------------------
-- Guarded cleanup — exact legacy row only (replay-safe on older snapshots)
-- ---------------------------------------------------------------------------
DELETE FROM public.products AS p
WHERE p.id = 'a8fa7bdb-f65c-4e1c-b7f5-27a1ca1f73a8'
  AND p.title = ''
  AND p.is_visible IS FALSE
  AND NOT EXISTS (
    SELECT 1
    FROM public.order_items AS oi
    WHERE oi.product_id = p.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.cart_items AS ci
    WHERE ci.product_id = p.id::text
  );

-- ---------------------------------------------------------------------------
-- title NOT NULL + non-blank
-- ---------------------------------------------------------------------------
ALTER TABLE public.products
  ALTER COLUMN title SET NOT NULL;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_title_nonblank;

ALTER TABLE public.products
  ADD CONSTRAINT products_title_nonblank
  CHECK (btrim(title) <> '');

COMMIT;
