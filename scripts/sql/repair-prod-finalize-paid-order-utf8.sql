-- #18C-1D — PRODUCTION function-only UTF-8 repair for public.finalize_paid_order
--
-- NOT-APPLY by default. Historical / high-risk recovery tooling only.
-- STOP: do not run until explicit user approval. Never apply from deploy or #19.
-- Run in the PRODUCTION SQL editor as UTF-8 (do not open this file in Excel).
--
-- Does NOT:
--   ALTER / INSERT / UPDATE / DELETE tables or rows
--   change RLS, constraints, indexes, or any other function
--   apply to metalora-payment-test
--
-- Does:
--   CREATE OR REPLACE FUNCTION with the same signature as
--   supabase/migrations/20260830100000_18a1_finalize_paid_order_rpc.sql
--   re-assert COMMENT + EXECUTE grants (service_role only)
--
-- Authoritative literals (UTF-8 NFC):
--   고객 = eab3a0eab09d
--   제품 = eca09ced9288
--   기본 = eab8b0ebb3b8

CREATE OR REPLACE FUNCTION public.finalize_paid_order(
  p_verified_user_id uuid,
  p_user_custom_id text,
  p_order_number text,
  p_total_price numeric,
  p_paid_amount numeric,
  p_shipping_name text,
  p_shipping_phone text,
  p_zip_code text,
  p_address text,
  p_address_detail text,
  p_ordered_items jsonb,
  p_shipping_info jsonb,
  p_order_items jsonb
)
RETURNS TABLE (
  order_id uuid,
  order_number text,
  already_finalized boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_existing public.orders%ROWTYPE;
  v_order_id uuid;
  v_item_count integer;
  v_inserted_items integer;
  v_profile_updates integer;
BEGIN
  IF p_verified_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid payment finalization request';
  END IF;

  IF p_user_custom_id IS NULL OR btrim(p_user_custom_id) = '' THEN
    RAISE EXCEPTION 'Invalid payment finalization request';
  END IF;

  IF p_order_number IS NULL OR btrim(p_order_number) = '' THEN
    RAISE EXCEPTION 'Invalid payment finalization request';
  END IF;

  IF p_total_price IS NULL OR p_paid_amount IS NULL OR p_paid_amount < 0 OR p_total_price < 0 THEN
    RAISE EXCEPTION 'Invalid payment finalization request';
  END IF;

  IF p_paid_amount IS DISTINCT FROM p_total_price THEN
    RAISE EXCEPTION 'Invalid payment finalization request';
  END IF;

  IF p_order_items IS NULL OR jsonb_typeof(p_order_items) <> 'array' THEN
    RAISE EXCEPTION 'Invalid payment finalization request';
  END IF;

  v_item_count := jsonb_array_length(p_order_items);
  IF v_item_count IS NULL OR v_item_count < 1 THEN
    RAISE EXCEPTION 'Invalid payment finalization request';
  END IF;

  -- Serialize concurrent finalization for the same order_number (works before row exists).
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('finalize_paid_order:' || p_order_number)
  );

  SELECT o.*
  INTO v_existing
  FROM public.orders AS o
  WHERE o.order_number = p_order_number
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.user_id IS DISTINCT FROM p_verified_user_id THEN
      RAISE EXCEPTION 'Order ownership mismatch';
    END IF;

    IF v_existing.payment_finalized_at IS NOT NULL THEN
      IF v_existing.total_price IS DISTINCT FROM p_total_price THEN
        RAISE EXCEPTION 'Order finalization amount mismatch';
      END IF;

      order_id := v_existing.id;
      order_number := v_existing.order_number;
      already_finalized := true;
      RETURN NEXT;
      RETURN;
    END IF;

    RAISE EXCEPTION 'Order requires recovery before finalization';
  END IF;

  INSERT INTO public.orders (
    order_number,
    user_id,
    user_custom_id,
    status,
    total_price,
    shipping_name,
    shipping_phone,
    zip_code,
    address,
    address_detail,
    ordered_items,
    shipping_info
  )
  VALUES (
    p_order_number,
    p_verified_user_id,
    p_user_custom_id,
    'PAID',
    p_total_price,
    COALESCE(p_shipping_name, '고객'),
    COALESCE(p_shipping_phone, ''),
    COALESCE(p_zip_code, ''),
    COALESCE(p_address, ''),
    COALESCE(p_address_detail, ''),
    p_ordered_items,
    p_shipping_info
  )
  RETURNING public.orders.id INTO v_order_id;

  INSERT INTO public.order_items (
    order_id,
    product_id,
    product_title,
    quantity,
    price,
    option,
    orientation,
    created_at
  )
  SELECT
    v_order_id,
    CASE
      WHEN elem->>'product_id' IS NULL OR btrim(elem->>'product_id') = '' THEN NULL
      ELSE (elem->>'product_id')::uuid
    END,
    COALESCE(NULLIF(btrim(elem->>'product_title'), ''), '제품'),
    (elem->>'quantity')::integer,
    (elem->>'price')::numeric,
    COALESCE(NULLIF(btrim(elem->>'option'), ''), '기본'),
    NULLIF(btrim(elem->>'orientation'), ''),
    pg_catalog.now()
  FROM jsonb_array_elements(p_order_items) AS elem;

  GET DIAGNOSTICS v_inserted_items = ROW_COUNT;
  IF v_inserted_items IS NULL OR v_inserted_items <> v_item_count THEN
    RAISE EXCEPTION 'Order item persistence failed';
  END IF;

  UPDATE public.profiles
  SET total_spent = COALESCE(public.profiles.total_spent, 0) + p_paid_amount
  WHERE public.profiles.id = p_verified_user_id;

  GET DIAGNOSTICS v_profile_updates = ROW_COUNT;
  IF v_profile_updates <> 1 THEN
    RAISE EXCEPTION 'Profile update failed';
  END IF;

  UPDATE public.orders
  SET payment_finalized_at = pg_catalog.now()
  WHERE public.orders.id = v_order_id;

  order_id := v_order_id;
  order_number := p_order_number;
  already_finalized := false;
  RETURN NEXT;
END;
$$;

ALTER FUNCTION public.finalize_paid_order(
  uuid, text, text, numeric, numeric, text, text, text, text, text, jsonb, jsonb, jsonb
) OWNER TO postgres;

COMMENT ON FUNCTION public.finalize_paid_order(
  uuid, text, text, numeric, numeric, text, text, text, text, text, jsonb, jsonb, jsonb
) IS
  'Atomically inserts a NEW paid order, relational order_items, and increments '
  'profiles.total_spent. Idempotent when payment_finalized_at is already set. '
  'Legacy/unmarked existing rows raise recovery error. service_role only.';

REVOKE ALL ON FUNCTION public.finalize_paid_order(
  uuid, text, text, numeric, numeric, text, text, text, text, text, jsonb, jsonb, jsonb
) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.finalize_paid_order(
  uuid, text, text, numeric, numeric, text, text, text, text, text, jsonb, jsonb, jsonb
) FROM anon;

REVOKE EXECUTE ON FUNCTION public.finalize_paid_order(
  uuid, text, text, numeric, numeric, text, text, text, text, text, jsonb, jsonb, jsonb
) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.finalize_paid_order(
  uuid, text, text, numeric, numeric, text, text, text, text, text, jsonb, jsonb, jsonb
) TO service_role;
