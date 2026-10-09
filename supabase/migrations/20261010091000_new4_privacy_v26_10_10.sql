-- NEW4 — TEMPORARY rollout compatibility for Privacy consent writes.
-- Additive. Do NOT modify 20261007090000.
-- Source-only. Do NOT apply to production from this ticket.
--
-- TEMPORARY: policy type privacy accepts exactly privacy_v26.10.07 OR privacy_v26.10.10.
-- The new application records privacy_v26.10.10 only. The previous application records
-- privacy_v26.10.07. Dual acceptance lets the DB migrate before traffic promotion and
-- lets traffic roll back to the old revision while this function stays in place.
-- A later forward-only migration must remove privacy_v26.10.07 from NEW writes after
-- the new revision is stable. Do not ship that tightening in the same apply batch.
--
-- Preserves NEW4-5A restrictions:
--   Authenticated JWT: current Workshop only (auth.uid(), workshop_custom_v26.10.06).
--   service_role: current allowlisted type/version pairs; checkout requires order_number.
-- Existing ledger rows are not rewritten. Cookie/GA is not a ledger type.

BEGIN;

CREATE OR REPLACE FUNCTION public.record_policy_consent(
  p_policy_type text,
  p_policy_version text,
  p_source text DEFAULT NULL,
  p_order_number text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_uid uuid;
  v_role text;
  v_expected_version text;
  v_order_number text;
  v_source text;
BEGIN
  v_role := coalesce(auth.role(), '');
  v_source := NULLIF(btrim(coalesce(p_source, '')), '');
  v_order_number := NULLIF(btrim(coalesce(p_order_number, '')), '');

  IF v_source IS NOT NULL AND char_length(v_source) > 64 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  IF v_order_number IS NOT NULL AND char_length(v_order_number) > 80 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  IF p_policy_type IS DISTINCT FROM 'terms'
     AND p_policy_type IS DISTINCT FROM 'privacy'
     AND p_policy_type IS DISTINCT FROM 'workshop_custom'
     AND p_policy_type IS DISTINCT FROM 'checkout_return_refund' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  -- TEMPORARY rollout window: previous and current Privacy texts only.
  IF p_policy_type = 'privacy' THEN
    IF p_policy_version IS DISTINCT FROM 'privacy_v26.10.07'
       AND p_policy_version IS DISTINCT FROM 'privacy_v26.10.10' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'version_mismatch');
    END IF;
  ELSE
    v_expected_version := CASE p_policy_type
      WHEN 'terms' THEN 'terms_v26.10.06'
      WHEN 'workshop_custom' THEN 'workshop_custom_v26.10.06'
      WHEN 'checkout_return_refund' THEN 'checkout_return_refund_v26.10.06'
    END;

    IF p_policy_version IS DISTINCT FROM v_expected_version THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'version_mismatch');
    END IF;
  END IF;

  IF v_role = 'service_role' THEN
    IF p_user_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
    END IF;
    v_uid := p_user_id;

    IF p_policy_type = 'checkout_return_refund' THEN
      IF v_order_number IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
      END IF;
    ELSE
      v_order_number := NULL;
    END IF;

  ELSIF v_role = 'authenticated' AND auth.uid() IS NOT NULL THEN
    v_uid := auth.uid();

    IF p_user_id IS NOT NULL AND p_user_id IS DISTINCT FROM v_uid THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
    END IF;

    IF p_policy_type IS DISTINCT FROM 'workshop_custom' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
    END IF;

    IF v_order_number IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
    END IF;

  ELSE
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
  END IF;

  INSERT INTO public.user_agreements (
    user_id,
    policy_type,
    agreement_version,
    source,
    order_number,
    agreed_at
  )
  VALUES (
    v_uid,
    p_policy_type,
    p_policy_version,
    v_source,
    v_order_number,
    now()
  )
  ON CONFLICT (user_id, policy_type, agreement_version) DO NOTHING;

  RETURN jsonb_build_object('ok', true);
END;
$$;

ALTER FUNCTION public.record_policy_consent(text, text, text, text, uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.record_policy_consent(text, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_policy_consent(text, text, text, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_policy_consent(text, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_policy_consent(text, text, text, text, uuid) TO service_role;

COMMENT ON FUNCTION public.record_policy_consent(text, text, text, text, uuid) IS
  'TEMPORARY rollout: privacy accepts privacy_v26.10.07 OR privacy_v26.10.10 only. New app writes privacy_v26.10.10. Remove privacy_v26.10.07 in a later forward migration after stable promotion. NEW4-5A unchanged. Authenticated: current workshop_custom only. service_role: allowlisted type/version; checkout_return_refund requires order_number. Cookie/GA is not a ledger type.';

COMMIT;
