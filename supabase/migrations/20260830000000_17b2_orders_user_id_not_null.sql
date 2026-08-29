-- #17B-2 — Enforce orders.user_id NOT NULL
-- Applied to shared Supabase project (production + metalora-cursor-test).
--
-- Ownership is now server-derived from verified Supabase auth identity
-- (#17B-1: /api/payment/confirm binds user_id to auth.getUser token only).
-- Live precheck (#17B-0): orders.user_id NULL count = 0; orphan auth count = 0.
-- Existing FK on orders.user_id is unchanged.
--
-- Scope:
--   - Guard: abort if any orders.user_id IS NULL
--   - ALTER COLUMN user_id SET NOT NULL
-- Out of scope:
--   - FK recreate/change, RLS, status, indexes, data backfill/UPDATE

BEGIN;

DO $$
DECLARE
  v_null_count bigint;
BEGIN
  SELECT COUNT(*) INTO v_null_count
  FROM public.orders
  WHERE user_id IS NULL;

  IF v_null_count > 0 THEN
    RAISE EXCEPTION
      '#17B-2 precheck failed: % orders row(s) have user_id IS NULL; backfill before applying NOT NULL',
      v_null_count;
  END IF;
END
$$;

ALTER TABLE public.orders
  ALTER COLUMN user_id SET NOT NULL;

COMMIT;
