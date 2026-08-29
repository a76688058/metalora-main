-- #16B-2B — Cart / CS / banners core constraints
-- Applied to shared Supabase project (production + metalora-cursor-test).
--
-- Live data validated: zero violating rows for all constraints below.
--
-- Scope:
--   - cart_items: user_id, product_id, quantity NOT NULL + quantity > 0
--   - cs_inquiries: user_id, title NOT NULL + non-blank title/content
--   - banners: is_active, display_order NOT NULL
--
-- Out of scope:
--   - orders, order_items, profiles, products, user_agreements, user_progress
--   - RLS, indexes, FKs, application code
--   - status CHECKs, product_id FK, banner display_order range

BEGIN;

-- ---------------------------------------------------------------------------
-- cart_items
-- ---------------------------------------------------------------------------
ALTER TABLE public.cart_items
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.cart_items
  ALTER COLUMN product_id SET NOT NULL;

ALTER TABLE public.cart_items
  ALTER COLUMN quantity SET NOT NULL;

ALTER TABLE public.cart_items
  DROP CONSTRAINT IF EXISTS cart_items_quantity_positive;

ALTER TABLE public.cart_items
  ADD CONSTRAINT cart_items_quantity_positive
  CHECK (quantity > 0);

-- ---------------------------------------------------------------------------
-- cs_inquiries
-- ---------------------------------------------------------------------------
ALTER TABLE public.cs_inquiries
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.cs_inquiries
  ALTER COLUMN title SET NOT NULL;

ALTER TABLE public.cs_inquiries
  DROP CONSTRAINT IF EXISTS cs_inquiries_title_nonblank;

ALTER TABLE public.cs_inquiries
  ADD CONSTRAINT cs_inquiries_title_nonblank
  CHECK (btrim(title) <> '');

ALTER TABLE public.cs_inquiries
  DROP CONSTRAINT IF EXISTS cs_inquiries_content_nonblank;

ALTER TABLE public.cs_inquiries
  ADD CONSTRAINT cs_inquiries_content_nonblank
  CHECK (btrim(content) <> '');

-- ---------------------------------------------------------------------------
-- banners
-- ---------------------------------------------------------------------------
ALTER TABLE public.banners
  ALTER COLUMN is_active SET NOT NULL;

ALTER TABLE public.banners
  ALTER COLUMN display_order SET NOT NULL;

COMMIT;
