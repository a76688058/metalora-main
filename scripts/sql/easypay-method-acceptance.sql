-- NOT APPLIED. Do not run this against Production without a separate Owner approval.
-- Read-only inspection on 2026-11-20, project METALORA.pj:
--   schema_migrations = 20260826110000, 20261112160000, 20261112165000, 20261112170000.
--   Capture migrations 20261024120000 and 20261113140000 are absent from that ledger.
--   apply_provider_capture_observation, finalize_paid_order, and
--   begin_full_order_cancellation accept only 카드.
--   claim, mark, and finalize cancellation functions contain no method gate.
-- Live function bodies match the local sources except one leading newline.
-- The only semantic change in this file is the accepted Toss checkout set:
-- 카드, CARD, 간편결제, EASY_PAY.
-- Amount, merchant, payment key, DONE status, transaction key, ownership,
-- idempotent PAID finalization, and the existing cancellation row return
-- stay unchanged. This file is not a migration.
--
-- Forward capture transaction-key safeguard.
-- Baseline: the inspected Production bodies of the two payment functions.
-- The only added behavior is transaction-key acceptance.
-- The finalizer does not record workshop media.
-- This file does not update orders, captures, or schema_migrations.
-- CREATE OR REPLACE preserves the existing owner. Ownership is not changed.
-- btrim(text) without a character list removes only U+0020. The list below
-- is the acceptance set: space, tab, newline, carriage return, form feed,
-- vertical tab. p_last_transaction_key is never an acceptance substitute.

BEGIN;

CREATE OR REPLACE FUNCTION public.apply_provider_capture_observation(
  p_order_number text,
  p_source text,
  p_observed_payment_key text,
  p_provider_order_id text,
  p_amount numeric,
  p_provider_mid text,
  p_payment_method text,
  p_provider_status text,
  p_transaction_key text,
  p_last_transaction_key text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_row public.payment_provider_captures%ROWTYPE;
  v_existing uuid;
  v_policy public.payment_runtime_policy%ROWTYPE;
  v_was_closed boolean;
  v_transaction_key text;
BEGIN
  PERFORM public.assert_capture_service_role();
  SELECT * INTO v_row FROM public.payment_provider_captures WHERE order_number = p_order_number FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  -- Acceptance key. last_transaction_key is not read.
  v_transaction_key := NULLIF(
    pg_catalog.btrim(p_transaction_key, E' \t\n\r\f\013'),
    ''
  );
  v_was_closed := v_row.status = 'operator_closed';
  SELECT id INTO v_existing
  FROM public.payment_capture_observations
  WHERE order_number = p_order_number
    AND source = p_source
    AND observed_payment_key IS NOT DISTINCT FROM p_observed_payment_key
    AND provider_order_id IS NOT DISTINCT FROM p_provider_order_id
    AND amount IS NOT DISTINCT FROM p_amount
    AND provider_mid IS NOT DISTINCT FROM p_provider_mid
    AND payment_method IS NOT DISTINCT FROM p_payment_method
    AND provider_status IS NOT DISTINCT FROM p_provider_status
    AND transaction_key IS NOT DISTINCT FROM p_transaction_key
    AND last_transaction_key IS NOT DISTINCT FROM p_last_transaction_key;
  IF v_existing IS NOT NULL THEN
    UPDATE public.payment_capture_observations SET observed_at = pg_catalog.now() WHERE id = v_existing;
  ELSE
    INSERT INTO public.payment_capture_observations (
      order_number, source, observed_payment_key, provider_order_id, amount,
      provider_mid, payment_method, provider_status, transaction_key, last_transaction_key
    ) VALUES (
      p_order_number, p_source, p_observed_payment_key, p_provider_order_id, p_amount,
      p_provider_mid, p_payment_method, p_provider_status, p_transaction_key, p_last_transaction_key
    );
  END IF;
  IF v_row.observed_payment_key IS NULL AND p_observed_payment_key IS NOT NULL THEN
    v_row.observed_payment_key := p_observed_payment_key;
  END IF;
  IF v_row.status IN ('cancel_pending', 'local_cancel_uncertain', 'provider_canceled', 'finalized') THEN
    UPDATE public.payment_provider_captures
    SET observed_payment_key = v_row.observed_payment_key
    WHERE order_number = p_order_number;
    RETURN v_row.status;
  END IF;
  v_policy := public.capture_runtime_policy();
  IF (
    SELECT count(DISTINCT observed_payment_key)
    FROM public.payment_capture_observations
    WHERE order_number = p_order_number AND observed_payment_key IS NOT NULL
  ) > 1 OR (
    p_observed_payment_key IS NOT NULL AND p_observed_payment_key IS DISTINCT FROM v_row.claimed_payment_key
  ) THEN
    UPDATE public.payment_provider_captures
    SET status = 'identity_conflict', failure_class = 'payment_key_conflict',
        observed_payment_key = v_row.observed_payment_key,
        review_enqueued_at = COALESCE(review_enqueued_at, pg_catalog.now())
    WHERE order_number = p_order_number;
    RETURN 'identity_conflict';
  END IF;
  -- Aligned DONE with no acceptance key.
  -- operator_review is legal only from confirm_submitted, provider_uncertain,
  -- and operator_review. Every other status keeps its current status.
  -- transaction_key is not written on this path.
  IF p_provider_status = 'DONE'
    AND p_observed_payment_key IS NOT DISTINCT FROM v_row.claimed_payment_key
    AND p_provider_order_id = p_order_number
    AND p_amount = v_row.amount
    AND p_payment_method IN ('카드', 'CARD', '간편결제', 'EASY_PAY')
    AND p_provider_mid IS NOT NULL
    AND (v_policy.require_live_mid IS FALSE OR p_provider_mid = v_policy.live_mid)
    AND v_transaction_key IS NULL
  THEN
    IF v_row.status IN ('confirm_submitted', 'provider_uncertain', 'operator_review') THEN
      UPDATE public.payment_provider_captures
      SET status = 'operator_review',
          failure_class = 'transaction_key_missing',
          observed_payment_key = v_row.observed_payment_key,
          provider_status = p_provider_status,
          provider_mid = p_provider_mid,
          payment_method = p_payment_method,
          review_enqueued_at = COALESCE(review_enqueued_at, pg_catalog.now())
      WHERE order_number = p_order_number;
      RETURN 'operator_review';
    END IF;
    UPDATE public.payment_provider_captures
    SET observed_payment_key = v_row.observed_payment_key
    WHERE order_number = p_order_number;
    RETURN v_row.status;
  END IF;
  IF p_provider_status = 'DONE'
    AND p_observed_payment_key IS NOT DISTINCT FROM v_row.claimed_payment_key
    AND p_provider_order_id = p_order_number
    AND p_amount = v_row.amount
    AND p_payment_method IN ('카드', 'CARD', '간편결제', 'EASY_PAY')
    AND p_provider_mid IS NOT NULL
    AND (v_policy.require_live_mid IS FALSE OR p_provider_mid = v_policy.live_mid)
    AND v_transaction_key IS NOT NULL
  THEN
    UPDATE public.payment_provider_captures
    SET status = 'provider_done_pending_finalize', failure_class = NULL,
        observed_payment_key = v_row.observed_payment_key, provider_status = 'DONE',
        provider_mid = p_provider_mid, payment_method = p_payment_method,
        transaction_key = v_transaction_key,
        reopened_after_close = v_was_closed OR reopened_after_close
    WHERE order_number = p_order_number;
    RETURN 'provider_done_pending_finalize';
  END IF;
  IF p_provider_status = 'DONE' THEN
    UPDATE public.payment_provider_captures
    SET status = CASE
          WHEN p_provider_mid IS NULL OR (v_policy.require_live_mid AND p_provider_mid IS DISTINCT FROM v_policy.live_mid)
            OR p_payment_method IS NULL OR p_payment_method NOT IN ('카드', 'CARD', '간편결제', 'EASY_PAY')
          THEN 'provider_mismatch' ELSE 'operator_review' END,
        failure_class = CASE
          WHEN p_provider_mid IS NULL THEN 'mid_missing'
          WHEN v_policy.require_live_mid AND p_provider_mid IS DISTINCT FROM v_policy.live_mid THEN 'mid_mismatch'
          WHEN p_payment_method IS NULL THEN 'method_missing'
          WHEN p_payment_method NOT IN ('카드', 'CARD', '간편결제', 'EASY_PAY') THEN 'method_mismatch'
          ELSE 'provider_open' END,
        observed_payment_key = v_row.observed_payment_key,
        provider_status = p_provider_status,
        provider_mid = p_provider_mid,
        payment_method = p_payment_method,
        review_enqueued_at = COALESCE(review_enqueued_at, pg_catalog.now())
    WHERE order_number = p_order_number;
    RETURN (SELECT status FROM public.payment_provider_captures WHERE order_number = p_order_number);
  END IF;
  UPDATE public.payment_provider_captures
  SET status = 'operator_review', failure_class = 'provider_open',
      observed_payment_key = v_row.observed_payment_key,
      provider_status = p_provider_status,
      review_enqueued_at = COALESCE(review_enqueued_at, pg_catalog.now())
  WHERE order_number = p_order_number;
  RETURN 'operator_review';
END;
$$;

-- Production finalizer baseline. The added predicate is the blank
-- transaction-key disjunct inside the capture-present eligibility check.
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
RETURNS TABLE (order_id uuid, order_number text, already_finalized boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_existing public.orders%ROWTYPE;
  v_capture public.payment_provider_captures%ROWTYPE;
  v_order_id uuid;
  v_item_count integer;
  v_inserted_items integer;
  v_profile_updates integer;
  v_has_capture boolean := false;
BEGIN
  PERFORM public.assert_capture_service_role();
  IF p_verified_user_id IS NULL OR p_user_custom_id IS NULL OR btrim(p_user_custom_id) = ''
    OR p_order_number IS NULL OR btrim(p_order_number) = ''
    OR p_total_price IS NULL OR p_paid_amount IS NULL OR p_paid_amount < 0 OR p_total_price < 0
    OR p_paid_amount IS DISTINCT FROM p_total_price
    OR p_order_items IS NULL OR jsonb_typeof(p_order_items) <> 'array'
  THEN
    RAISE EXCEPTION 'Invalid payment finalization request';
  END IF;
  v_item_count := jsonb_array_length(p_order_items);
  IF v_item_count IS NULL OR v_item_count < 1 THEN
    RAISE EXCEPTION 'Invalid payment finalization request';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('finalize_paid_order:' || p_order_number));
  SELECT * INTO v_capture FROM public.payment_provider_captures WHERE payment_provider_captures.order_number = p_order_number FOR UPDATE;
  v_has_capture := FOUND;
  SELECT o.* INTO v_existing FROM public.orders AS o WHERE o.order_number = p_order_number FOR UPDATE;
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
  IF v_has_capture AND (
    v_capture.status IS DISTINCT FROM 'provider_done_pending_finalize'
    OR v_capture.claimed_payment_key IS DISTINCT FROM v_capture.observed_payment_key
    OR v_capture.payment_method IS NULL OR v_capture.payment_method NOT IN ('카드', 'CARD', '간편결제', 'EASY_PAY')
    OR v_capture.provider_status IS DISTINCT FROM 'DONE'
    OR v_capture.amount IS DISTINCT FROM p_total_price
    OR ((public.capture_runtime_policy()).require_live_mid AND v_capture.provider_mid IS DISTINCT FROM (public.capture_runtime_policy()).live_mid)
    OR NULLIF(pg_catalog.btrim(v_capture.transaction_key, E' \t\n\r\f\013'), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'capture is not eligible for finalization';
  END IF;
  INSERT INTO public.orders (
    order_number, user_id, user_custom_id, status, total_price, shipping_name, shipping_phone,
    zip_code, address, address_detail, ordered_items, shipping_info
  ) VALUES (
    p_order_number, p_verified_user_id, p_user_custom_id, 'PAID', p_total_price,
    COALESCE(p_shipping_name, '고객'), COALESCE(p_shipping_phone, ''), COALESCE(p_zip_code, ''),
    COALESCE(p_address, ''), COALESCE(p_address_detail, ''), p_ordered_items, p_shipping_info
  ) RETURNING public.orders.id INTO v_order_id;
  INSERT INTO public.order_items (order_id, product_id, product_title, quantity, price, option, orientation, created_at)
  SELECT v_order_id,
    CASE WHEN elem->>'product_id' IS NULL OR btrim(elem->>'product_id') = '' THEN NULL ELSE (elem->>'product_id')::uuid END,
    COALESCE(NULLIF(btrim(elem->>'product_title'), ''), '제품'),
    (elem->>'quantity')::integer, (elem->>'price')::numeric,
    COALESCE(NULLIF(btrim(elem->>'option'), ''), '기본'), NULLIF(btrim(elem->>'orientation'), ''), pg_catalog.now()
  FROM jsonb_array_elements(p_order_items) AS elem;
  GET DIAGNOSTICS v_inserted_items = ROW_COUNT;
  IF v_inserted_items IS DISTINCT FROM v_item_count THEN
    RAISE EXCEPTION 'Order item persistence failed';
  END IF;
  UPDATE public.profiles
  SET total_spent = COALESCE(public.profiles.total_spent, 0) + p_paid_amount
  WHERE public.profiles.id = p_verified_user_id;
  GET DIAGNOSTICS v_profile_updates = ROW_COUNT;
  IF v_profile_updates <> 1 THEN RAISE EXCEPTION 'Profile update failed'; END IF;
  UPDATE public.orders SET payment_finalized_at = pg_catalog.now() WHERE public.orders.id = v_order_id;
  IF v_has_capture THEN
    UPDATE public.payment_provider_captures
    SET status = 'finalized'
    WHERE payment_provider_captures.order_number = p_order_number;
  END IF;
  order_id := v_order_id;
  order_number := p_order_number;
  already_finalized := false;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_provider_capture_observation(
  text, text, text, text, numeric, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.finalize_paid_order(
  uuid, text, text, numeric, numeric, text, text, text, text, text, jsonb, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.apply_provider_capture_observation(
  text, text, text, text, numeric, text, text, text, text, text
) TO service_role;

GRANT EXECUTE ON FUNCTION public.finalize_paid_order(
  uuid, text, text, numeric, numeric, text, text, text, text, text, jsonb, jsonb, jsonb
) TO service_role;


-- Cancellation uses the same accepted method set.
-- The existing active-row return stays ahead of any insert.
-- claim, mark, and finalize are unchanged because they have no method gate.

CREATE OR REPLACE FUNCTION public.begin_full_order_cancellation(
  p_order_id uuid,
  p_actor_user_id uuid,
  p_cancel_reason text
)
RETURNS TABLE (
  cancellation_id uuid,
  cancellation_status text,
  idempotency_key uuid,
  payment_key text,
  order_number text,
  paid_amount numeric,
  provider_attempted_at timestamptz,
  transaction_key text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_column text;
  v_snapshot text;
  v_key text;
  v_method text;
  v_info_method text;
  v_reason text;
  v_existing public.payment_cancellations%ROWTYPE;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'cancellation_server_only' USING ERRCODE = '42501';
  END IF;
  v_reason := btrim(coalesce(p_cancel_reason, ''));
  IF char_length(v_reason) < 1 OR char_length(v_reason) > 200 THEN
    RAISE EXCEPTION 'cancellation_reason_invalid' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_order
  FROM public.orders AS orders
  WHERE orders.id = p_order_id
  FOR UPDATE;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'cancellation_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_existing
  FROM public.payment_cancellations AS attempt
  WHERE attempt.order_id = p_order_id
    AND attempt.status IN ('pending', 'provider_uncertain', 'local_uncertain', 'confirmed')
  FOR UPDATE;
  IF v_existing.id IS NOT NULL THEN
    cancellation_id := v_existing.id;
    cancellation_status := v_existing.status;
    idempotency_key := v_existing.idempotency_key;
    payment_key := v_existing.payment_key;
    order_number := v_existing.order_number;
    paid_amount := v_existing.paid_amount;
    provider_attempted_at := v_existing.provider_attempted_at;
    transaction_key := v_existing.transaction_key;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_order.status IN ('PRODUCTION', 'SHIPPING', 'COMPLETED')
     OR EXISTS (
       SELECT 1
       FROM public.order_items AS item
       JOIN public.order_item_commerce_state AS commerce
         ON commerce.order_item_id = item.id
       WHERE item.order_id = v_order.id
         AND commerce.state = 'fulfilled'
     ) THEN
    RAISE EXCEPTION 'cancellation_fulfilled' USING ERRCODE = '42501';
  END IF;
  IF v_order.status IS DISTINCT FROM 'PAID' OR v_order.payment_finalized_at IS NULL THEN
    RAISE EXCEPTION 'cancellation_not_eligible' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.order_items AS item WHERE item.order_id = v_order.id) THEN
    RAISE EXCEPTION 'cancellation_not_eligible' USING ERRCODE = '42501';
  END IF;

  v_column := NULLIF(btrim(v_order."paymentKey"), '');
  v_snapshot := NULLIF(btrim(v_order.shipping_info->>'payment_key'), '');
  IF v_column IS NOT NULL AND v_snapshot IS NOT NULL AND v_column IS DISTINCT FROM v_snapshot THEN
    RAISE EXCEPTION 'cancellation_payment_key_mismatch' USING ERRCODE = '42501';
  END IF;
  v_key := coalesce(v_column, v_snapshot);
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'cancellation_payment_key_missing' USING ERRCODE = '42501';
  END IF;

  v_method := NULLIF(btrim(v_order.method), '');
  v_info_method := NULLIF(btrim(v_order.shipping_info->>'payment_method'), '');
  IF v_method IS NOT NULL AND v_info_method IS NOT NULL AND v_method IS DISTINCT FROM v_info_method THEN
    RAISE EXCEPTION 'cancellation_method_unsupported' USING ERRCODE = '42501';
  END IF;
  IF coalesce(v_method, v_info_method) IS NULL
     OR coalesce(v_method, v_info_method) NOT IN ('카드', 'CARD', '간편결제', 'EASY_PAY') THEN
    RAISE EXCEPTION 'cancellation_method_unsupported' USING ERRCODE = '42501';
  END IF;
  IF v_order.total_price IS NULL OR v_order.total_price <= 0 OR v_order.total_price <> trunc(v_order.total_price) THEN
    RAISE EXCEPTION 'cancellation_not_eligible' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.payment_cancellations (
    order_id, order_number, payment_key, idempotency_key, paid_amount,
    cancel_reason, status, actor_user_id
  ) VALUES (
    v_order.id, v_order.order_number, v_key, gen_random_uuid(), v_order.total_price,
    v_reason, 'pending', p_actor_user_id
  )
  RETURNING
    public.payment_cancellations.id,
    public.payment_cancellations.status,
    public.payment_cancellations.idempotency_key,
    public.payment_cancellations.payment_key,
    public.payment_cancellations.order_number,
    public.payment_cancellations.paid_amount,
    public.payment_cancellations.provider_attempted_at,
    public.payment_cancellations.transaction_key
  INTO
    cancellation_id, cancellation_status, idempotency_key, payment_key,
    order_number, paid_amount, provider_attempted_at, transaction_key;
  RETURN NEXT;
EXCEPTION
  WHEN unique_violation THEN
    SELECT
      attempt.id, attempt.status, attempt.idempotency_key, attempt.payment_key,
      attempt.order_number, attempt.paid_amount, attempt.provider_attempted_at, attempt.transaction_key
    INTO
      cancellation_id, cancellation_status, idempotency_key, payment_key,
      order_number, paid_amount, provider_attempted_at, transaction_key
    FROM public.payment_cancellations AS attempt
    WHERE attempt.order_id = p_order_id
      AND attempt.status IN ('pending', 'provider_uncertain', 'local_uncertain', 'confirmed');
    IF cancellation_id IS NULL THEN
      RAISE;
    END IF;
    RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_full_order_cancellation(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_full_order_cancellation(uuid, uuid, text) TO service_role;

COMMIT;
