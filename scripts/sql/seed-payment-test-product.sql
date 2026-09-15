-- #18C-2 — TEST-ONLY minimum product fixture for metalora-payment-test.
-- Do NOT run on production (qifloweuwyhvukabgnoa).
-- Do NOT run until the SQL editor project is metalora-payment-test
--   (API host bvihpoorwriejybixmoc.supabase.co).
-- Do NOT seed auth.users, profiles, orders, order_items, or payment_intents.
-- Idempotent: upserts the single synthetic product id below.

BEGIN;

DO $$
DECLARE
  other_count integer;
BEGIN
  SELECT count(*)::integer
  INTO other_count
  FROM public.products
  WHERE id <> '018c18c2-0000-4000-8000-000000000001'::uuid;

  IF other_count > 0 THEN
    RAISE EXCEPTION
      'payment-test product seed aborted: % other product row(s) exist',
      other_count;
  END IF;
END
$$;

INSERT INTO public.products (
  id,
  title,
  subtitle,
  description,
  options,
  front_image,
  is_new,
  is_limited,
  is_sale,
  is_visible,
  display_order,
  supported_orientations
)
VALUES (
  '018c18c2-0000-4000-8000-000000000001'::uuid,
  '[TEST] Payment fixture',
  'SYNTHETIC',
  'Synthetic payment-test fixture. Not a catalog product.',
  jsonb_build_array(
    jsonb_build_object(
      'id', 'paytest-opt-m',
      'name', 'M',
      'dimension', '200 × 283 mm',
      'price', 100,
      'stock', 99,
      'isActive', true
    )
  ),
  '/hero/spatial-room.webp',
  false,
  false,
  false,
  true,
  0,
  '["portrait"]'::jsonb
)
ON CONFLICT (id) DO UPDATE
SET
  title = EXCLUDED.title,
  subtitle = EXCLUDED.subtitle,
  description = EXCLUDED.description,
  options = EXCLUDED.options,
  front_image = EXCLUDED.front_image,
  is_new = EXCLUDED.is_new,
  is_limited = EXCLUDED.is_limited,
  is_sale = EXCLUDED.is_sale,
  is_visible = EXCLUDED.is_visible,
  display_order = EXCLUDED.display_order,
  supported_orientations = EXCLUDED.supported_orientations;

COMMIT;

-- Post-seed check (expect 1 row, is_visible true, price 100):
-- SELECT id, title, is_visible, options
-- FROM public.products
-- WHERE id = '018c18c2-0000-4000-8000-000000000001';
