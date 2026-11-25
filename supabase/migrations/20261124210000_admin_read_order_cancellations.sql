-- UNAPPLIED SOURCE. Do not run against hosted TEST or production.
-- Read-only admin inspection of one order's cancellation rows.
-- Does not grant table SELECT, does not return the provider payment identifier, and does not change checkout.

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_read_order_cancellations(p_order_id uuid)
RETURNS TABLE (
  cancellation_id uuid,
  order_id uuid,
  status text,
  paid_amount numeric,
  cancel_amount numeric,
  cancel_reason text,
  created_at timestamptz,
  provider_attempted_at timestamptz,
  updated_at timestamptz,
  ledger_recorded boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT
    attempt.id,
    attempt.order_id,
    attempt.status,
    attempt.paid_amount,
    attempt.cancel_amount,
    attempt.cancel_reason,
    attempt.created_at,
    attempt.provider_attempted_at,
    attempt.updated_at,
    EXISTS (
      SELECT 1
      FROM public.payment_cancellation_ledger AS ledger
      WHERE ledger.cancellation_id = attempt.id
        AND ledger.order_id = attempt.order_id
    )
  FROM public.payment_cancellations AS attempt
  WHERE attempt.order_id = p_order_id
  ORDER BY attempt.created_at ASC, attempt.id ASC;
$$;

COMMENT ON FUNCTION public.admin_read_order_cancellations(uuid) IS
  'NEW7 read-only: one order''s cancellation metadata for an already authenticated admin request. Provider payment identifier is omitted.';

ALTER FUNCTION public.admin_read_order_cancellations(uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.admin_read_order_cancellations(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_read_order_cancellations(uuid) TO service_role;

COMMIT;
