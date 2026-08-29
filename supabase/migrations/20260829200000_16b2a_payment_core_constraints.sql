-- #16B-2A — Payment core database constraints
-- Applied to shared Supabase project (production + metalora-cursor-test).
--
-- Live data validated: zero violating rows for all constraints below.
-- Live schema already has orders.order_number UNIQUE,
-- order_items.order_id FK -> orders(id) ON DELETE CASCADE,
-- order_items.quantity NOT NULL, order_items.price NOT NULL.
--
-- Scope:
--   - orders.order_number NOT NULL
--   - orders.total_price NOT NULL + non-negative CHECK
--   - order_items.order_id NOT NULL
--   - order_items quantity/price CHECKs
--
-- Out of scope:
--   - orders.user_id, orders.status
--   - products, profiles, cart_items, cs_inquiries, banners
--   - FK / index / UNIQUE changes

BEGIN;

-- ---------------------------------------------------------------------------
-- orders — order_number and total_price invariants
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders
  ALTER COLUMN order_number SET NOT NULL;

ALTER TABLE public.orders
  ALTER COLUMN total_price SET NOT NULL;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_total_price_nonnegative;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_total_price_nonnegative
  CHECK (total_price >= 0);

-- ---------------------------------------------------------------------------
-- order_items — parent link and line-value invariants
-- ---------------------------------------------------------------------------
ALTER TABLE public.order_items
  ALTER COLUMN order_id SET NOT NULL;

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_quantity_positive;

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_quantity_positive
  CHECK (quantity > 0);

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_price_nonnegative;

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_price_nonnegative
  CHECK (price >= 0);

COMMIT;
