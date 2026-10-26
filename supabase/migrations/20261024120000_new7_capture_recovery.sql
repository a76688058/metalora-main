-- NEW7 capture recovery. LOCAL FILE ONLY.
-- Do not apply this migration from the implementation task.
-- PostgreSQL version is selected at apply time:
--   server_version_num >= 150000 uses UNIQUE NULLS NOT DISTINCT.
--   Older supported servers use a sentinel expression unique index.
--   Empty payment keys are rejected. Amount -1 is not a stored amount.
-- The live production finalize_paid_order body has not been diffed.
-- Diff it against this replacement before any production apply.
-- The capture row does not accept a caller MID-bypass flag.
-- require_live_mid is copied from payment_runtime_policy.
-- Payment-test require_live_mid = false is not in this file.
-- An authorized later payment-test apply may run only:
--   UPDATE public.payment_runtime_policy
--   SET require_live_mid = false
--   WHERE id IS TRUE AND live_mid = 'metalom5u3';

BEGIN;

CREATE TABLE public.payment_runtime_policy (
  id boolean PRIMARY KEY CHECK (id),
  require_live_mid boolean NOT NULL,
  live_mid text NOT NULL
);

INSERT INTO public.payment_runtime_policy (id, require_live_mid, live_mid)
VALUES (true, true, 'metalom5u3');

CREATE TABLE public.payment_provider_captures (
  order_number text PRIMARY KEY REFERENCES public.payment_intents (order_number),
  user_id uuid NOT NULL,
  claimed_payment_key text NOT NULL UNIQUE,
  observed_payment_key text,
  amount numeric NOT NULL,
  status text NOT NULL,
  failure_class text,
  provider_status text,
  provider_mid text,
  payment_method text,
  transaction_key text,
  confirm_epoch integer NOT NULL DEFAULT 0,
  confirm_claimed_at timestamptz,
  request_dispatched_at timestamptz,
  lookup_count integer NOT NULL DEFAULT 0,
  not_found_count integer NOT NULL DEFAULT 0,
  next_lookup_after timestamptz,
  escalation_level integer NOT NULL DEFAULT 0,
  review_enqueued_at timestamptz,
  cancel_idempotency_key uuid UNIQUE,
  cancel_path text,
  cancel_target_payment_key text,
  cancel_provider_attempted_at timestamptz,
  cancel_actor_user_id uuid,
  dispatch_blocked boolean NOT NULL DEFAULT false,
  reopened_after_close boolean NOT NULL DEFAULT false,
  require_live_mid boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT payment_provider_captures_status CHECK (status IN (
    'key_recorded', 'confirm_submitted', 'provider_done_pending_finalize',
    'provider_mismatch', 'provider_uncertain', 'operator_review', 'identity_conflict',
    'finalized', 'cancel_pending', 'local_cancel_uncertain', 'provider_canceled', 'operator_closed'
  )),
  CONSTRAINT payment_provider_captures_finalized_aligned CHECK (
    status <> 'finalized'
    OR (
      claimed_payment_key = observed_payment_key
      AND payment_method = '카드'
      AND provider_status = 'DONE'
    )
  ),
  CONSTRAINT payment_provider_captures_canceled_tx CHECK (
    status <> 'provider_canceled' OR transaction_key IS NOT NULL
  ),
  CONSTRAINT payment_provider_captures_cancel_fields CHECK (
    status NOT IN ('cancel_pending', 'local_cancel_uncertain', 'provider_canceled')
    OR (
      cancel_idempotency_key IS NOT NULL
      AND cancel_target_payment_key IS NOT NULL
      AND (
        (
          cancel_path = 'aligned_method_mismatch'
          AND claimed_payment_key = observed_payment_key
          AND cancel_target_payment_key = observed_payment_key
        )
        OR (
          cancel_path = 'identity_conflict_observed'
          AND claimed_payment_key IS DISTINCT FROM observed_payment_key
          AND cancel_target_payment_key = observed_payment_key
        )
      )
    )
  )
);

CREATE TABLE public.payment_capture_observations (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  order_number text NOT NULL REFERENCES public.payment_provider_captures (order_number),
  source text NOT NULL CHECK (source IN ('confirm_body', 'get_lookup')),
  observed_payment_key text,
  provider_order_id text,
  amount numeric,
  provider_mid text,
  payment_method text,
  provider_status text,
  transaction_key text,
  last_transaction_key text,
  observed_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

DO $uniq$
DECLARE
  v_version integer := current_setting('server_version_num')::integer;
BEGIN
  IF v_version >= 150000 THEN
    EXECUTE $sql$
      CREATE UNIQUE INDEX payment_capture_observations_identity
      ON public.payment_capture_observations (
        order_number, source, observed_payment_key, provider_order_id, amount,
        provider_mid, payment_method, provider_status, transaction_key, last_transaction_key
      ) NULLS NOT DISTINCT
    $sql$;
  ELSE
    EXECUTE $sql$
      CREATE UNIQUE INDEX payment_capture_observations_identity
      ON public.payment_capture_observations (
        order_number, source,
        coalesce(observed_payment_key, ''),
        coalesce(provider_order_id, ''),
        coalesce(amount, -1),
        coalesce(provider_mid, ''),
        coalesce(payment_method, ''),
        coalesce(provider_status, ''),
        coalesce(transaction_key, ''),
        coalesce(last_transaction_key, '')
      )
    $sql$;
  END IF;
END
$uniq$;

CREATE TABLE public.payment_capture_cancellation_ledger (
  transaction_key text PRIMARY KEY,
  order_number text NOT NULL UNIQUE REFERENCES public.payment_provider_captures (order_number),
  amount numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE TABLE public.payment_capture_review_events (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  order_number text NOT NULL REFERENCES public.payment_provider_captures (order_number),
  event_kind text NOT NULL,
  actor_user_id uuid,
  evidence_type text,
  evidence_reference text,
  disposition text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE OR REPLACE FUNCTION public.payment_provider_captures_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW.order_number IS DISTINCT FROM OLD.order_number
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.claimed_payment_key IS DISTINCT FROM OLD.claimed_payment_key
  THEN
    RAISE EXCEPTION 'immutable capture identity';
  END IF;
  IF OLD.cancel_idempotency_key IS NOT NULL AND (
    NEW.cancel_idempotency_key IS DISTINCT FROM OLD.cancel_idempotency_key
    OR NEW.cancel_path IS DISTINCT FROM OLD.cancel_path
    OR NEW.cancel_target_payment_key IS DISTINCT FROM OLD.cancel_target_payment_key
  ) THEN
    RAISE EXCEPTION 'immutable cancellation claim';
  END IF;
  IF OLD.cancel_provider_attempted_at IS NOT NULL
    AND NEW.cancel_provider_attempted_at IS DISTINCT FROM OLD.cancel_provider_attempted_at
  THEN
    RAISE EXCEPTION 'immutable dispatch reservation';
  END IF;
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NOT (
    (OLD.status = 'key_recorded' AND NEW.status = 'confirm_submitted')
    OR (OLD.status = 'confirm_submitted' AND NEW.status IN ('provider_done_pending_finalize', 'provider_mismatch', 'provider_uncertain', 'operator_review', 'identity_conflict'))
    OR (OLD.status = 'provider_uncertain' AND NEW.status IN ('provider_done_pending_finalize', 'provider_mismatch', 'provider_uncertain', 'operator_review', 'identity_conflict'))
    OR (OLD.status IN ('operator_review', 'operator_closed') AND NEW.status IN ('provider_done_pending_finalize', 'provider_mismatch', 'identity_conflict', 'operator_closed'))
    OR (OLD.status = 'provider_done_pending_finalize' AND NEW.status IN ('finalized', 'provider_mismatch', 'identity_conflict'))
    OR (OLD.status = 'provider_mismatch' AND NEW.status IN ('cancel_pending', 'operator_closed', 'identity_conflict', 'provider_done_pending_finalize'))
    OR (OLD.status = 'identity_conflict' AND NEW.status = 'cancel_pending')
    OR (OLD.status = 'cancel_pending' AND NEW.status IN ('local_cancel_uncertain', 'provider_canceled'))
    OR (OLD.status = 'local_cancel_uncertain' AND NEW.status = 'provider_canceled')
  ) THEN
    RAISE EXCEPTION 'invalid capture transition';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_provider_captures_guard
BEFORE UPDATE ON public.payment_provider_captures
FOR EACH ROW EXECUTE PROCEDURE public.payment_provider_captures_guard();

ALTER TABLE public.payment_runtime_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_provider_captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_capture_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_capture_cancellation_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_capture_review_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.payment_runtime_policy FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.payment_provider_captures FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.payment_capture_observations FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.payment_capture_cancellation_ledger FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.payment_capture_review_events FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assert_capture_service_role()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.capture_runtime_policy()
RETURNS public.payment_runtime_policy
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_count integer;
  v_row public.payment_runtime_policy%ROWTYPE;
BEGIN
  PERFORM public.assert_capture_service_role();
  SELECT count(*) INTO v_count FROM public.payment_runtime_policy;
  IF v_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'policy_unavailable';
  END IF;
  SELECT * INTO v_row FROM public.payment_runtime_policy WHERE id IS TRUE;
  IF NOT FOUND OR v_row.require_live_mid IS NULL OR v_row.live_mid IS DISTINCT FROM 'metalom5u3' THEN
    RAISE EXCEPTION 'policy_unavailable';
  END IF;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.capture_cancel_observations_consistent(
  p_order_number text,
  p_expected_key text,
  p_amount numeric,
  p_mid_mode text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_policy public.payment_runtime_policy%ROWTYPE;
BEGIN
  PERFORM public.assert_capture_service_role();
  IF p_expected_key IS NULL OR p_amount IS NULL THEN RETURN false; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.payment_capture_observations WHERE order_number = p_order_number
  ) THEN
    RETURN false;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.payment_capture_observations
    WHERE order_number = p_order_number
      AND (
        observed_payment_key IS DISTINCT FROM p_expected_key
        OR provider_order_id IS DISTINCT FROM p_order_number
        OR amount IS DISTINCT FROM p_amount
        OR provider_status IS DISTINCT FROM 'DONE'
        OR payment_method IS NULL
        OR transaction_key IS NULL
      )
  ) THEN
    RETURN false;
  END IF;
  IF (
    SELECT count(*) FROM (
      SELECT payment_method FROM public.payment_capture_observations
      WHERE order_number = p_order_number GROUP BY payment_method
    ) methods
  ) IS DISTINCT FROM 1 OR (
    SELECT count(*) FROM (
      SELECT transaction_key FROM public.payment_capture_observations
      WHERE order_number = p_order_number GROUP BY transaction_key
    ) txs
  ) IS DISTINCT FROM 1 OR (
    SELECT count(*) FROM (
      SELECT last_transaction_key FROM public.payment_capture_observations
      WHERE order_number = p_order_number GROUP BY last_transaction_key
    ) last_txs
  ) IS DISTINCT FROM 1 THEN
    RETURN false;
  END IF;
  IF p_mid_mode = 'live_exact' THEN
    RETURN NOT EXISTS (
      SELECT 1 FROM public.payment_capture_observations
      WHERE order_number = p_order_number AND provider_mid IS DISTINCT FROM 'metalom5u3'
    );
  END IF;
  v_policy := public.capture_runtime_policy();
  IF v_policy.require_live_mid THEN
    RETURN NOT EXISTS (
      SELECT 1 FROM public.payment_capture_observations
      WHERE order_number = p_order_number AND provider_mid IS DISTINCT FROM v_policy.live_mid
    );
  END IF;
  RETURN NOT EXISTS (
    SELECT 1 FROM public.payment_capture_observations
    WHERE order_number = p_order_number AND provider_mid IS NULL
  ) AND (
    SELECT count(*) FROM (
      SELECT provider_mid FROM public.payment_capture_observations
      WHERE order_number = p_order_number GROUP BY provider_mid
    ) mids
  ) = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_provider_capture_attempt(
  p_order_number text,
  p_user_id uuid,
  p_claimed_payment_key text,
  p_amount numeric
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_finalized timestamptz;
  v_policy public.payment_runtime_policy%ROWTYPE;
BEGIN
  PERFORM public.assert_capture_service_role();
  v_policy := public.capture_runtime_policy();
  SELECT payment_finalized_at INTO v_finalized
  FROM public.orders WHERE order_number = p_order_number;
  IF v_finalized IS NOT NULL THEN
    RAISE EXCEPTION 'already_finalized';
  END IF;
  INSERT INTO public.payment_provider_captures (
    order_number, user_id, claimed_payment_key, amount, status, require_live_mid
  ) VALUES (
    p_order_number, p_user_id, p_claimed_payment_key, p_amount, 'key_recorded', v_policy.require_live_mid
  )
  ON CONFLICT (order_number) DO NOTHING;
  IF EXISTS (
    SELECT 1 FROM public.payment_provider_captures
    WHERE order_number = p_order_number
      AND claimed_payment_key IS DISTINCT FROM p_claimed_payment_key
  ) THEN
    RAISE EXCEPTION 'payment_key_conflict';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_confirm_submit(p_order_number text, p_claimed_payment_key text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_row public.payment_provider_captures%ROWTYPE;
BEGIN
  PERFORM public.assert_capture_service_role();
  SELECT * INTO v_row FROM public.payment_provider_captures
  WHERE order_number = p_order_number FOR UPDATE;
  IF NOT FOUND OR v_row.claimed_payment_key IS DISTINCT FROM p_claimed_payment_key OR v_row.status IS DISTINCT FROM 'key_recorded' THEN
    RETURN false;
  END IF;
  UPDATE public.payment_provider_captures
  SET status = 'confirm_submitted', confirm_epoch = confirm_epoch + 1, confirm_claimed_at = pg_catalog.now()
  WHERE order_number = p_order_number;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_confirm_dispatched(p_order_number text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_row public.payment_provider_captures%ROWTYPE;
BEGIN
  PERFORM public.assert_capture_service_role();
  SELECT * INTO v_row FROM public.payment_provider_captures
  WHERE order_number = p_order_number FOR UPDATE;
  IF NOT FOUND OR v_row.status IS DISTINCT FROM 'confirm_submitted' OR v_row.request_dispatched_at IS NOT NULL THEN
    RETURN false;
  END IF;
  UPDATE public.payment_provider_captures
  SET request_dispatched_at = pg_catalog.now()
  WHERE order_number = p_order_number;
  RETURN true;
END;
$$;

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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_row public.payment_provider_captures%ROWTYPE;
  v_existing uuid;
  v_policy public.payment_runtime_policy%ROWTYPE;
  v_was_closed boolean;
BEGIN
  PERFORM public.assert_capture_service_role();
  SELECT * INTO v_row FROM public.payment_provider_captures WHERE order_number = p_order_number FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
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
  IF p_provider_status = 'DONE'
    AND p_observed_payment_key IS NOT DISTINCT FROM v_row.claimed_payment_key
    AND p_provider_order_id = p_order_number
    AND p_amount = v_row.amount
    AND p_payment_method = '카드'
    AND p_provider_mid IS NOT NULL
    AND (v_policy.require_live_mid IS FALSE OR p_provider_mid = v_policy.live_mid)
  THEN
    UPDATE public.payment_provider_captures
    SET status = 'provider_done_pending_finalize', failure_class = NULL,
        observed_payment_key = v_row.observed_payment_key, provider_status = 'DONE',
        provider_mid = p_provider_mid, payment_method = p_payment_method,
        transaction_key = p_transaction_key,
        reopened_after_close = v_was_closed OR reopened_after_close
    WHERE order_number = p_order_number;
    RETURN 'provider_done_pending_finalize';
  END IF;
  IF p_provider_status = 'DONE' THEN
    UPDATE public.payment_provider_captures
    SET status = CASE
          WHEN p_provider_mid IS NULL OR (v_policy.require_live_mid AND p_provider_mid IS DISTINCT FROM v_policy.live_mid)
            OR p_payment_method IS NULL OR p_payment_method IS DISTINCT FROM '카드'
          THEN 'provider_mismatch' ELSE 'operator_review' END,
        failure_class = CASE
          WHEN p_provider_mid IS NULL THEN 'mid_missing'
          WHEN v_policy.require_live_mid AND p_provider_mid IS DISTINCT FROM v_policy.live_mid THEN 'mid_mismatch'
          WHEN p_payment_method IS NULL THEN 'method_missing'
          WHEN p_payment_method IS DISTINCT FROM '카드' THEN 'method_mismatch'
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

CREATE OR REPLACE FUNCTION public.note_capture_lookup_attempt(p_order_number text, p_lookup_class text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_row public.payment_provider_captures%ROWTYPE;
BEGIN
  PERFORM public.assert_capture_service_role();
  SELECT * INTO v_row FROM public.payment_provider_captures WHERE order_number = p_order_number FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.payment_provider_captures
  SET lookup_count = lookup_count + 1,
      not_found_count = not_found_count + CASE WHEN p_lookup_class = 'not_found' THEN 1 ELSE 0 END,
      next_lookup_after = pg_catalog.now() + CASE LEAST(lookup_count, 5)
        WHEN 0 THEN interval '1 minute' WHEN 1 THEN interval '5 minutes' WHEN 2 THEN interval '15 minutes'
        WHEN 3 THEN interval '1 hour' WHEN 4 THEN interval '6 hours' ELSE interval '24 hours' END,
      escalation_level = GREATEST(escalation_level, CASE
        WHEN COALESCE(review_enqueued_at, CASE
          WHEN status = 'confirm_submitted' AND confirm_claimed_at IS NOT NULL
            AND pg_catalog.now() - confirm_claimed_at >= interval '2 minutes'
          THEN pg_catalog.now() ELSE NULL END) IS NULL THEN escalation_level
        WHEN pg_catalog.now() - COALESCE(review_enqueued_at, pg_catalog.now()) >= interval '24 hours' THEN 3
        WHEN pg_catalog.now() - COALESCE(review_enqueued_at, pg_catalog.now()) >= interval '6 hours' THEN 2
        WHEN pg_catalog.now() - COALESCE(review_enqueued_at, pg_catalog.now()) >= interval '1 hour' THEN 1
        ELSE escalation_level
      END),
      status = CASE
        WHEN status = 'confirm_submitted' AND confirm_claimed_at IS NOT NULL
          AND pg_catalog.now() - confirm_claimed_at >= interval '2 minutes'
        THEN 'operator_review' ELSE status END,
      failure_class = CASE
        WHEN status = 'confirm_submitted' AND confirm_claimed_at IS NOT NULL
          AND pg_catalog.now() - confirm_claimed_at >= interval '2 minutes'
        THEN COALESCE(failure_class, 'lookup_not_found') ELSE failure_class END,
      review_enqueued_at = CASE
        WHEN status = 'confirm_submitted' AND confirm_claimed_at IS NOT NULL
          AND pg_catalog.now() - confirm_claimed_at >= interval '2 minutes'
        THEN COALESCE(review_enqueued_at, pg_catalog.now()) ELSE review_enqueued_at END
  WHERE order_number = p_order_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.begin_unfinalized_capture_cancellation(
  p_order_number text, p_actor_user_id uuid, p_evidence text, p_evidence_reference text, p_disposition text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_row public.payment_provider_captures%ROWTYPE;
  v_policy public.payment_runtime_policy%ROWTYPE;
  v_key uuid;
BEGIN
  PERFORM public.assert_capture_service_role();
  SELECT * INTO v_row FROM public.payment_provider_captures WHERE order_number = p_order_number FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_row.cancel_idempotency_key IS NOT NULL THEN RETURN v_row.cancel_idempotency_key; END IF;
  v_policy := public.capture_runtime_policy();
  IF v_row.status IS DISTINCT FROM 'provider_mismatch' OR v_row.failure_class IS DISTINCT FROM 'method_mismatch'
    OR v_row.claimed_payment_key IS DISTINCT FROM v_row.observed_payment_key
    OR v_row.provider_status IS DISTINCT FROM 'DONE'
    OR v_row.payment_method IS NULL OR v_row.payment_method = '카드'
    OR (v_policy.require_live_mid AND v_row.provider_mid IS DISTINCT FROM v_policy.live_mid)
    OR NOT public.capture_cancel_observations_consistent(p_order_number, v_row.observed_payment_key, v_row.amount, 'policy')
  THEN
    RAISE EXCEPTION 'not_eligible';
  END IF;
  v_key := pg_catalog.gen_random_uuid();
  UPDATE public.payment_provider_captures
  SET status = 'cancel_pending', cancel_path = 'aligned_method_mismatch',
      cancel_target_payment_key = observed_payment_key, cancel_idempotency_key = v_key,
      cancel_actor_user_id = p_actor_user_id
  WHERE order_number = p_order_number;
  INSERT INTO public.payment_capture_review_events (order_number, event_kind, actor_user_id, evidence_reference)
  VALUES (p_order_number, 'aligned_cancel_claim', p_actor_user_id, p_evidence);
  RETURN v_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.begin_manual_observed_key_refund(
  p_order_number text, p_actor_user_id uuid, p_evidence text, p_evidence_reference text, p_disposition text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_row public.payment_provider_captures%ROWTYPE;
  v_key uuid;
  v_observed text;
  v_count integer;
BEGIN
  PERFORM public.assert_capture_service_role();
  SELECT * INTO v_row FROM public.payment_provider_captures WHERE order_number = p_order_number FOR UPDATE;
  IF NOT FOUND OR v_row.status IS DISTINCT FROM 'identity_conflict' THEN
    RAISE EXCEPTION 'not_conflict';
  END IF;
  SELECT count(*), min(observed_payment_key) INTO v_count, v_observed
  FROM (
    SELECT DISTINCT observed_payment_key FROM public.payment_capture_observations WHERE order_number = p_order_number
  ) keys;
  IF v_count IS DISTINCT FROM 1 OR v_observed IS NULL OR v_observed = v_row.claimed_payment_key THEN
    RAISE EXCEPTION 'inconsistent';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.payment_capture_observations
    WHERE order_number = p_order_number
      AND (
        observed_payment_key IS NULL
        OR provider_order_id IS DISTINCT FROM p_order_number
        OR amount IS DISTINCT FROM v_row.amount
        OR provider_mid IS DISTINCT FROM 'metalom5u3'
        OR provider_status IS DISTINCT FROM 'DONE'
        OR payment_method IS NULL
      )
  ) OR (
    SELECT count(DISTINCT payment_method) FROM public.payment_capture_observations WHERE order_number = p_order_number
  ) IS DISTINCT FROM 1 OR EXISTS (
    SELECT 1 FROM public.orders WHERE order_number = p_order_number AND payment_finalized_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'inconsistent';
  END IF;
  v_key := pg_catalog.gen_random_uuid();
  UPDATE public.payment_provider_captures
  SET status = 'cancel_pending', cancel_path = 'identity_conflict_observed',
      cancel_target_payment_key = v_observed, cancel_idempotency_key = v_key,
      cancel_actor_user_id = p_actor_user_id
  WHERE order_number = p_order_number;
  INSERT INTO public.payment_capture_review_events (order_number, event_kind, actor_user_id, evidence_reference)
  VALUES (p_order_number, 'manual_observed_refund_claim', p_actor_user_id, p_evidence);
  RETURN v_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_capture_cancel_dispatch(p_order_number text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_row public.payment_provider_captures%ROWTYPE;
BEGIN
  PERFORM public.assert_capture_service_role();
  SELECT * INTO v_row FROM public.payment_provider_captures WHERE order_number = p_order_number FOR UPDATE;
  IF NOT FOUND OR v_row.status IS DISTINCT FROM 'cancel_pending' OR v_row.cancel_provider_attempted_at IS NOT NULL
    OR v_row.cancel_idempotency_key IS NULL OR v_row.cancel_target_payment_key IS NULL
  THEN
    RETURN jsonb_build_object('won', false);
  END IF;
  UPDATE public.payment_provider_captures
  SET cancel_provider_attempted_at = pg_catalog.now()
  WHERE order_number = p_order_number;
  RETURN jsonb_build_object(
    'won', true,
    'target', v_row.cancel_target_payment_key,
    'idempotency_key', v_row.cancel_idempotency_key,
    'amount', v_row.amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revalidate_capture_cancel_before_send(p_order_number text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_row public.payment_provider_captures%ROWTYPE;
  v_bad boolean;
BEGIN
  PERFORM public.assert_capture_service_role();
  SELECT * INTO v_row FROM public.payment_provider_captures WHERE order_number = p_order_number FOR UPDATE;
  IF NOT FOUND OR v_row.cancel_provider_attempted_at IS NULL OR v_row.cancel_target_payment_key IS NULL THEN
    RETURN 'blocked';
  END IF;
  IF v_row.cancel_path = 'aligned_method_mismatch' THEN
    v_bad := v_row.claimed_payment_key IS DISTINCT FROM v_row.observed_payment_key
      OR v_row.cancel_target_payment_key IS DISTINCT FROM v_row.observed_payment_key
      OR NOT public.capture_cancel_observations_consistent(
        p_order_number, v_row.cancel_target_payment_key, v_row.amount, 'policy'
      )
      OR EXISTS (
        SELECT 1 FROM public.payment_capture_observations
        WHERE order_number = p_order_number
          AND (payment_method IS NULL OR payment_method = '카드')
      );
  ELSIF v_row.cancel_path = 'identity_conflict_observed' THEN
    v_bad := v_row.cancel_target_payment_key IS NOT DISTINCT FROM v_row.claimed_payment_key
      OR NOT public.capture_cancel_observations_consistent(
        p_order_number, v_row.cancel_target_payment_key, v_row.amount, 'live_exact'
      );
  ELSE
    v_bad := true;
  END IF;
  IF v_bad THEN
    UPDATE public.payment_provider_captures SET dispatch_blocked = true WHERE order_number = p_order_number;
    INSERT INTO public.payment_capture_review_events (order_number, event_kind)
    VALUES (p_order_number, 'dispatch_blocked');
    RETURN 'blocked';
  END IF;
  RETURN 'clear';
END;
$$;

CREATE OR REPLACE FUNCTION public.record_capture_dispatch_block(p_order_number text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM public.assert_capture_service_role();
  UPDATE public.payment_provider_captures SET dispatch_blocked = true WHERE order_number = p_order_number;
  INSERT INTO public.payment_capture_review_events (order_number, event_kind)
  VALUES (p_order_number, 'dispatch_blocked');
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_capture_cancel_uncertain(p_order_number text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM public.assert_capture_service_role();
  UPDATE public.payment_provider_captures
  SET status = 'local_cancel_uncertain'
  WHERE order_number = p_order_number AND status = 'cancel_pending' AND cancel_provider_attempted_at IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_capture_cancellation(p_order_number text, p_provider_body jsonb)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_row public.payment_provider_captures%ROWTYPE;
  v_cancel jsonb;
  v_tx text;
  v_total numeric;
  v_balance numeric;
  v_cancel_amount numeric;
  v_refundable numeric;
  v_full boolean := false;
BEGIN
  PERFORM public.assert_capture_service_role();
  SELECT * INTO v_row FROM public.payment_provider_captures WHERE order_number = p_order_number FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_row.status IS DISTINCT FROM 'cancel_pending' OR v_row.cancel_provider_attempted_at IS NULL THEN
    RAISE EXCEPTION 'not_dispatchable';
  END IF;
  BEGIN
    v_cancel := p_provider_body #> '{cancels,0}';
    v_tx := btrim(COALESCE(v_cancel->>'transactionKey', ''));
    v_total := (p_provider_body->>'totalAmount')::numeric;
    v_balance := (p_provider_body->>'balanceAmount')::numeric;
    v_cancel_amount := (v_cancel->>'cancelAmount')::numeric;
    v_refundable := CASE
      WHEN v_cancel IS NULL OR NOT (v_cancel ? 'refundableAmount') THEN 0
      ELSE (v_cancel->>'refundableAmount')::numeric
    END;
    v_full := p_provider_body->>'status' = 'CANCELED'
      AND p_provider_body->>'paymentKey' = v_row.cancel_target_payment_key
      AND p_provider_body->>'orderId' = p_order_number
      AND v_total = v_row.amount
      AND v_row.amount > 0
      AND v_balance = 0
      AND jsonb_typeof(p_provider_body->'cancels') = 'array'
      AND jsonb_array_length(p_provider_body->'cancels') = 1
      AND v_cancel->>'cancelStatus' = 'DONE'
      AND char_length(v_tx) BETWEEN 1 AND 64
      AND v_cancel_amount = v_row.amount
      AND v_refundable = 0;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    v_full := false;
  END;
  IF NOT v_full THEN
    UPDATE public.payment_provider_captures
    SET status = 'local_cancel_uncertain'
    WHERE order_number = p_order_number;
    RETURN 'unproven';
  END IF;
  INSERT INTO public.payment_capture_cancellation_ledger (transaction_key, order_number, amount)
  VALUES (v_tx, p_order_number, v_row.amount);
  UPDATE public.payment_provider_captures
  SET status = 'provider_canceled', transaction_key = v_tx
  WHERE order_number = p_order_number;
  RETURN 'provider_canceled';
END;
$$;

CREATE OR REPLACE FUNCTION public.attest_external_resolution(
  p_order_number text, p_actor_user_id uuid, p_evidence text, p_evidence_reference text, p_disposition text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_row public.payment_provider_captures%ROWTYPE;
BEGIN
  PERFORM public.assert_capture_service_role();
  SELECT * INTO v_row FROM public.payment_provider_captures WHERE order_number = p_order_number FOR UPDATE;
  IF NOT FOUND OR v_row.status IS DISTINCT FROM 'provider_mismatch' OR v_row.failure_class IS DISTINCT FROM 'mid_mismatch' THEN
    RAISE EXCEPTION 'not_mid_mismatch';
  END IF;
  IF v_row.observed_payment_key IS NULL OR v_row.provider_mid IS NULL THEN
    RAISE EXCEPTION 'unverified_identity';
  END IF;
  IF p_evidence IS NULL OR p_evidence = 'transaction_reference' OR p_evidence_reference IS NULL THEN
    RAISE EXCEPTION 'evidence';
  END IF;
  IF p_disposition NOT IN ('external_party_reports_closed', 'ownership_rejected') THEN
    RAISE EXCEPTION 'disposition';
  END IF;
  UPDATE public.payment_provider_captures SET status = 'operator_closed' WHERE order_number = p_order_number;
  INSERT INTO public.payment_capture_review_events (
    order_number, event_kind, actor_user_id, evidence_type, evidence_reference, disposition
  ) VALUES (
    p_order_number, 'external_disposition_recorded', p_actor_user_id, p_evidence, p_evidence_reference, p_disposition
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_capture_work_queue()
RETURNS TABLE (order_number text, status text, failure_class text, escalation_level integer, review_enqueued_at timestamptz, next_lookup_after timestamptz, dispatch_blocked boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM public.assert_capture_service_role();
  RETURN QUERY
  SELECT c.order_number, c.status, c.failure_class, c.escalation_level, c.review_enqueued_at, c.next_lookup_after, c.dispatch_blocked
  FROM public.payment_provider_captures c
  WHERE c.status IN ('operator_review', 'identity_conflict', 'local_cancel_uncertain')
    OR (c.status = 'cancel_pending' AND c.dispatch_blocked)
  ORDER BY c.escalation_level DESC, c.review_enqueued_at ASC NULLS LAST, c.order_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_capture_review(
  p_order_number text, p_action text, p_actor_user_id uuid, p_evidence_kind text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_row public.payment_provider_captures%ROWTYPE;
BEGIN
  PERFORM public.assert_capture_service_role();
  SELECT * INTO v_row FROM public.payment_provider_captures WHERE order_number = p_order_number FOR UPDATE;
  IF p_action IS DISTINCT FROM 'close_uncaptured' OR v_row.status IS DISTINCT FROM 'operator_review' THEN
    RAISE EXCEPTION 'not_closable';
  END IF;
  IF v_row.request_dispatched_at IS NOT NULL OR v_row.observed_payment_key IS NOT NULL OR p_evidence_kind IS DISTINCT FROM 'merchant_console_no_payment' THEN
    RAISE EXCEPTION 'evidence';
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_capture_observations WHERE order_number = p_order_number) THEN
    RAISE EXCEPTION 'evidence';
  END IF;
  UPDATE public.payment_provider_captures SET status = 'operator_closed' WHERE order_number = p_order_number;
  INSERT INTO public.payment_capture_review_events (order_number, event_kind, actor_user_id, evidence_type)
  VALUES (p_order_number, 'close_uncaptured', p_actor_user_id, p_evidence_kind);
END;
$$;

-- Replacement keeps the existing argument list. No capture row keeps the historical body.
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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
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
    OR v_capture.payment_method IS DISTINCT FROM '카드'
    OR v_capture.provider_status IS DISTINCT FROM 'DONE'
    OR v_capture.amount IS DISTINCT FROM p_total_price
    OR ((public.capture_runtime_policy()).require_live_mid AND v_capture.provider_mid IS DISTINCT FROM (public.capture_runtime_policy()).live_mid)
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

-- CREATE OR REPLACE preserves existing EXECUTE grants. The payment-test
-- function currently allows anon and authenticated. These statements run
-- in this transaction, so a successful commit cannot leave the replacement
-- executable by PUBLIC, anon, or authenticated.
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

DO $grant$
DECLARE
  v_signature text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.assert_capture_service_role()',
    'public.capture_runtime_policy()',
    'public.capture_cancel_observations_consistent(text,text,numeric,text)',
    'public.record_provider_capture_attempt(text,uuid,text,numeric)',
    'public.claim_confirm_submit(text,text)',
    'public.mark_confirm_dispatched(text)',
    'public.apply_provider_capture_observation(text,text,text,text,numeric,text,text,text,text,text)',
    'public.note_capture_lookup_attempt(text,text)',
    'public.begin_unfinalized_capture_cancellation(text,uuid,text,text,text)',
    'public.begin_manual_observed_key_refund(text,uuid,text,text,text)',
    'public.claim_capture_cancel_dispatch(text)',
    'public.revalidate_capture_cancel_before_send(text)',
    'public.record_capture_dispatch_block(text)',
    'public.mark_capture_cancel_uncertain(text)',
    'public.finalize_capture_cancellation(text,jsonb)',
    'public.attest_external_resolution(text,uuid,text,text,text)',
    'public.list_capture_work_queue()',
    'public.resolve_capture_review(text,text,uuid,text)',
    'public.finalize_paid_order(uuid,text,text,numeric,numeric,text,text,text,text,text,jsonb,jsonb,jsonb)'
  ]
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO postgres', v_signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_signature);
  END LOOP;
END
$grant$;

COMMIT;
