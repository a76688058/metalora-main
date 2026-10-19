-- NEW7 full-order cancellation ledger.
-- Local draft. Do not apply to hosted TEST or production until a separate write is approved.
-- Does not open public payment, does not store a new payment key, and does not implement partial refunds.
-- Public checkout stays frozen. Customer self-service cancellation is not granted here.

BEGIN;

CREATE TABLE public.payment_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders (id) ON DELETE RESTRICT,
  order_number text NOT NULL,
  payment_key text NOT NULL CHECK (char_length(btrim(payment_key)) BETWEEN 1 AND 200),
  idempotency_key uuid NOT NULL UNIQUE,
  paid_amount numeric NOT NULL CHECK (paid_amount > 0 AND paid_amount = trunc(paid_amount)),
  cancel_reason text NOT NULL CHECK (char_length(btrim(cancel_reason)) BETWEEN 1 AND 200),
  status text NOT NULL CHECK (
    status IN ('pending', 'provider_uncertain', 'provider_rejected', 'confirmed', 'local_uncertain')
  ),
  provider_attempted_at timestamptz,
  provider_code text,
  transaction_key text,
  cancel_amount numeric,
  actor_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT payment_cancellations_amount_ck CHECK (
    cancel_amount IS NULL OR (cancel_amount = paid_amount AND cancel_amount > 0)
  ),
  CONSTRAINT payment_cancellations_confirmed_ck CHECK (
    status <> 'confirmed'
    OR (transaction_key IS NOT NULL AND cancel_amount = paid_amount)
  )
);

COMMENT ON TABLE public.payment_cancellations IS
  'NEW7: one full-order cancellation attempt. payment_key is copied from the paid order. '
  'A rejected attempt may be followed by a new row. Confirmed, pending, and uncertain rows are unique per order.';

CREATE UNIQUE INDEX payment_cancellations_active_order_idx
  ON public.payment_cancellations (order_id)
  WHERE status IN ('pending', 'provider_uncertain', 'local_uncertain', 'confirmed');

CREATE TABLE public.payment_cancellation_ledger (
  transaction_key text PRIMARY KEY CHECK (char_length(btrim(transaction_key)) BETWEEN 1 AND 64),
  cancellation_id uuid NOT NULL REFERENCES public.payment_cancellations (id) ON DELETE RESTRICT,
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders (id) ON DELETE RESTRICT,
  payment_key text NOT NULL,
  paid_amount numeric NOT NULL CHECK (paid_amount > 0),
  cancel_amount numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT payment_cancellation_ledger_full_ck CHECK (cancel_amount = paid_amount)
);

COMMENT ON TABLE public.payment_cancellation_ledger IS
  'NEW7: one confirmed full cancellation per order. The amount cannot exceed or split the paid amount.';

ALTER TABLE public.payment_cancellations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_cancellation_ledger ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.payment_cancellations FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.payment_cancellation_ledger FROM PUBLIC, anon, authenticated, service_role;

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
  IF coalesce(v_method, v_info_method) IS DISTINCT FROM '카드' THEN
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

CREATE OR REPLACE FUNCTION public.claim_full_order_cancellation(p_cancellation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'cancellation_server_only' USING ERRCODE = '42501';
  END IF;
  UPDATE public.payment_cancellations AS attempt
  SET provider_attempted_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  WHERE attempt.id = p_cancellation_id
    AND attempt.status = 'pending'
    AND attempt.provider_attempted_at IS NULL
  RETURNING attempt.id INTO v_id;
  RETURN v_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_full_order_cancellation(
  p_cancellation_id uuid,
  p_status text,
  p_provider_code text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'cancellation_server_only' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('provider_uncertain', 'provider_rejected', 'local_uncertain') THEN
    RAISE EXCEPTION 'cancellation_not_eligible' USING ERRCODE = '42501';
  END IF;
  UPDATE public.payment_cancellations AS attempt
  SET status = p_status,
      provider_code = left(NULLIF(btrim(p_provider_code), ''), 64),
      updated_at = pg_catalog.now()
  WHERE attempt.id = p_cancellation_id
    AND attempt.status IN ('pending', 'provider_uncertain', 'local_uncertain');
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_full_order_cancellation(
  p_cancellation_id uuid,
  p_transaction_key text,
  p_cancel_amount numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_attempt public.payment_cancellations%ROWTYPE;
  v_order_id uuid;
  v_status text;
  v_item uuid;
  v_key text;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'cancellation_server_only' USING ERRCODE = '42501';
  END IF;
  v_key := NULLIF(btrim(p_transaction_key), '');
  IF v_key IS NULL OR char_length(v_key) > 64 THEN
    RAISE EXCEPTION 'cancellation_not_eligible' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_attempt
  FROM public.payment_cancellations AS attempt
  WHERE attempt.id = p_cancellation_id
  FOR UPDATE;
  IF v_attempt.id IS NULL THEN
    RAISE EXCEPTION 'cancellation_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF p_cancel_amount IS DISTINCT FROM v_attempt.paid_amount THEN
    RAISE EXCEPTION 'cancellation_amount_mismatch' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payment_cancellation_ledger AS ledger
    WHERE ledger.order_id = v_attempt.order_id
      AND ledger.transaction_key IS DISTINCT FROM v_key
  ) THEN
    RAISE EXCEPTION 'cancellation_already_recorded' USING ERRCODE = '23505';
  END IF;

  FOR v_item IN
    SELECT item.id
    FROM public.order_items AS item
    WHERE item.order_id = v_attempt.order_id
    ORDER BY item.id
  LOOP
    PERFORM public.set_order_item_commerce_state(v_item, 'cancelled');
  END LOOP;

  SELECT orders.id, orders.status
    INTO v_order_id, v_status
  FROM public.orders AS orders
  WHERE orders.id = v_attempt.order_id
  FOR UPDATE;
  IF v_status IS DISTINCT FROM 'PAID' AND v_status IS DISTINCT FROM 'CANCELLED' THEN
    RAISE EXCEPTION 'cancellation_not_eligible' USING ERRCODE = '42501';
  END IF;
  UPDATE public.orders
  SET status = 'CANCELLED'
  WHERE id = v_order_id;

  INSERT INTO public.payment_cancellation_ledger (
    transaction_key, cancellation_id, order_id, payment_key, paid_amount, cancel_amount
  ) VALUES (
    v_key, v_attempt.id, v_attempt.order_id, v_attempt.payment_key, v_attempt.paid_amount, p_cancel_amount
  )
  ON CONFLICT (transaction_key) DO NOTHING;

  UPDATE public.payment_cancellations
  SET status = 'confirmed',
      transaction_key = v_key,
      cancel_amount = p_cancel_amount,
      updated_at = pg_catalog.now()
  WHERE id = v_attempt.id;
END;
$$;

ALTER FUNCTION public.begin_full_order_cancellation(uuid, uuid, text) OWNER TO postgres;
ALTER FUNCTION public.claim_full_order_cancellation(uuid) OWNER TO postgres;
ALTER FUNCTION public.mark_full_order_cancellation(uuid, text, text) OWNER TO postgres;
ALTER FUNCTION public.finalize_full_order_cancellation(uuid, text, numeric) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.begin_full_order_cancellation(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_full_order_cancellation(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_full_order_cancellation(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_full_order_cancellation(uuid, text, numeric) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.begin_full_order_cancellation(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_full_order_cancellation(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_full_order_cancellation(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_full_order_cancellation(uuid, text, numeric) TO service_role;

COMMIT;
