-- #16B-1 — High-value user-scoped indexes
-- Applied to shared Supabase project (production + metalora-cursor-test).
--
-- Composite (user_id, created_at DESC) indexes for frequent own-row
-- list queries on orders, cart_items, and cs_inquiries.
--
-- Out of scope:
--   - NOT NULL / CHECK constraints
--   - status or admin-wide indexes
--   - order_items, profiles, products, user_agreements (already covered)

BEGIN;

CREATE INDEX IF NOT EXISTS idx_orders_user_created_at
  ON public.orders (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cart_items_user_created_at
  ON public.cart_items (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cs_inquiries_user_created_at
  ON public.cs_inquiries (user_id, created_at DESC);

COMMIT;
