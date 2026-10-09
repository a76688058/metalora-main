-- NEW4 — Canonical-only Workshop durable-write acceptance.
-- Forward-only. Do NOT apply to production from this source ticket.
--
-- Replaces public.workshop_ref_is_accepted so NEW durable writes (add_custom_cart_item
-- and authenticated cart_items / user_progress guards) accept only own canonical paths:
--   originals/{auth.uid()}/{uuid}.{jpg|jpeg|png|webp}
--   previews/{auth.uid()}/{uuid}.jpg
--
-- Legacy public Workshop storage is retired. Durable noncanonical refs were verified
-- zero immediately before rollout. public.workshop_ref_is_own_legacy_supabase is kept
-- for defensive reads / rollback analysis and is no longer consulted by this wrapper.
-- Application parsers that still recognize legacy URLs are unchanged.
--
-- Does NOT: rewrite rows, add orders/payment_intents JSON CHECKs, drop the legacy
-- helper, change service_role trigger exemption, or alter GCS path semantics.
-- Rollback requires a NEW forward migration restoring dual acceptance.

BEGIN;

CREATE OR REPLACE FUNCTION public.workshop_ref_is_accepted(
  p_ref text,
  p_expected_kind text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT COALESCE(
    public.workshop_ref_is_own_canonical(p_ref, p_expected_kind),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.workshop_ref_is_accepted(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.workshop_ref_is_accepted(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.workshop_ref_is_accepted(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workshop_ref_is_accepted(text, text) TO service_role;

COMMENT ON FUNCTION public.workshop_ref_is_accepted(text, text) IS
  'NEW4 canonical-only durable Workshop refs. Own canonical path for auth.uid() and expected kind. Legacy helper retained but unused here.';

COMMIT;
