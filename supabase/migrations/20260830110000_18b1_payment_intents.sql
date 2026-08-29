-- #18B-1 — Durable immutable payment intent snapshot table
-- Applied to shared Supabase project (production + metalora-cursor-test).
--
-- Stores a server-validated purchase snapshot BEFORE the client opens Toss payment.
-- Enables payment recovery when Toss confirm succeeds but finalize_paid_order fails.
-- Completion authority remains orders.payment_finalized_at (#18A-1).
--
-- Scope:
--   - CREATE public.payment_intents
--   - RLS enabled, no client policies
--   - service_role SELECT + INSERT only (immutable after insert)
-- Out of scope:
--   - server.ts / Cart / PaymentSuccess (#18B-2)
--   - backfill, finalize_paid_order changes, existing table RLS changes

BEGIN;

CREATE TABLE public.payment_intents (
  order_number text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id),
  user_custom_id text NOT NULL,
  total_price numeric NOT NULL,
  validated_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_intents_total_price_positive CHECK (total_price > 0),
  CONSTRAINT payment_intents_validated_snapshot_object CHECK (jsonb_typeof(validated_snapshot) = 'object')
);

COMMENT ON TABLE public.payment_intents IS
  'Immutable server-validated purchase snapshot created before Toss payment. '
  'Keyed by order_number (Toss orderId). Not a finalized order; see orders.payment_finalized_at.';

COMMENT ON COLUMN public.payment_intents.validated_snapshot IS
  'Server-authoritative JSON object for finalize_paid_order recovery (#18B-2). '
  'Expected keys include: shipping snapshot, orders.ordered_items snapshot, '
  'relational order_items snapshot. Must not be rebuilt from a later products catalog.';

CREATE INDEX idx_payment_intents_user_created_at
  ON public.payment_intents (user_id, created_at DESC);

ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.payment_intents FROM PUBLIC;
REVOKE ALL ON TABLE public.payment_intents FROM anon;
REVOKE ALL ON TABLE public.payment_intents FROM authenticated;
REVOKE ALL ON TABLE public.payment_intents FROM service_role;

GRANT SELECT, INSERT
ON TABLE public.payment_intents
TO service_role;

COMMIT;
