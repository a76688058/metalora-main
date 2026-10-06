-- NEW4-5 — Versioned consent ledger (extend user_agreements)
-- Source-only. Do NOT apply to production from this ticket.
-- Additive / non-destructive. Does not fabricate Terms/Privacy versions
-- onto legacy profiles.agreed_to_* timestamps.

BEGIN;

-- Existing Workshop rows are the only version-provable agreements.
-- Their stored version is ML_Legal_v260325 (known). Classify as workshop_custom.
ALTER TABLE public.user_agreements
  ADD COLUMN IF NOT EXISTS policy_type text;

UPDATE public.user_agreements
SET policy_type = 'workshop_custom'
WHERE policy_type IS NULL
  AND agreement_version = 'ML_Legal_v260325';

-- Any unexpected historic row stays readable; do not invent a type/version.
UPDATE public.user_agreements
SET policy_type = 'workshop_custom'
WHERE policy_type IS NULL;

ALTER TABLE public.user_agreements
  ALTER COLUMN policy_type SET NOT NULL;

ALTER TABLE public.user_agreements
  DROP CONSTRAINT IF EXISTS user_agreements_policy_type_check;

ALTER TABLE public.user_agreements
  ADD CONSTRAINT user_agreements_policy_type_check
  CHECK (policy_type IN ('terms', 'privacy', 'workshop_custom', 'checkout_return_refund'));

-- IP was required and client-supplied. Keep historic values; do not require new PII.
ALTER TABLE public.user_agreements
  ALTER COLUMN ip_address DROP NOT NULL;

ALTER TABLE public.user_agreements
  ADD COLUMN IF NOT EXISTS source text;

ALTER TABLE public.user_agreements
  ADD COLUMN IF NOT EXISTS order_number text;

ALTER TABLE public.user_agreements
  DROP CONSTRAINT IF EXISTS user_agreements_user_policy_version_key;

ALTER TABLE public.user_agreements
  ADD CONSTRAINT user_agreements_user_policy_version_key
  UNIQUE (user_id, policy_type, agreement_version);

CREATE INDEX IF NOT EXISTS idx_user_agreements_user_policy
  ON public.user_agreements (user_id, policy_type);

COMMENT ON TABLE public.user_agreements IS
  'NEW4-5 versioned consent ledger. WHO + policy_type + agreement_version + agreed_at. Legacy Workshop ML_Legal_v260325 rows preserved. Membership timestamps on profiles remain unversioned legacy evidence.';

COMMENT ON COLUMN public.user_agreements.policy_type IS
  'terms | privacy | workshop_custom | checkout_return_refund. Cookie/GA is not stored here.';

COMMENT ON COLUMN public.user_agreements.agreement_version IS
  'Stable machine-readable policy version actually accepted. Do not backfill from unversioned profile timestamps.';

-- ---------------------------------------------------------------------------
-- Record consent with server timestamp. Callers cannot set agreed_at.
-- Authenticated: own user only. service_role: p_user_id required.
-- ---------------------------------------------------------------------------
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
BEGIN
  v_role := coalesce(auth.role(), '');

  IF auth.uid() IS NOT NULL THEN
    v_uid := auth.uid();
  ELSIF v_role = 'service_role' AND p_user_id IS NOT NULL THEN
    v_uid := p_user_id;
  ELSE
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
  END IF;

  IF p_policy_type IS DISTINCT FROM 'terms'
     AND p_policy_type IS DISTINCT FROM 'privacy'
     AND p_policy_type IS DISTINCT FROM 'workshop_custom'
     AND p_policy_type IS DISTINCT FROM 'checkout_return_refund' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  v_expected_version := CASE p_policy_type
    WHEN 'terms' THEN 'terms_v26.10.06'
    WHEN 'privacy' THEN 'privacy_v26.09.19'
    WHEN 'workshop_custom' THEN 'workshop_custom_v26.10.06'
    WHEN 'checkout_return_refund' THEN 'checkout_return_refund_v26.10.06'
  END;

  IF p_policy_version IS DISTINCT FROM v_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'version_mismatch');
  END IF;

  IF p_source IS NOT NULL AND (char_length(p_source) < 1 OR char_length(p_source) > 64) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  IF p_order_number IS NOT NULL AND (char_length(p_order_number) < 1 OR char_length(p_order_number) > 80) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
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
    NULLIF(btrim(coalesce(p_source, '')), ''),
    NULLIF(btrim(coalesce(p_order_number, '')), ''),
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
  'NEW4-5 insert-only consent evidence. Server now() timestamp. Authenticated users may record only for auth.uid(). Cookie/GA is not a ledger type.';

-- Direct table writes must not let users forge timestamps or other users' rows.
-- Inserts go through record_policy_consent.
DROP POLICY IF EXISTS "Users can insert own agreements" ON public.user_agreements;
DROP POLICY IF EXISTS "Users can view own agreements" ON public.user_agreements;

CREATE POLICY "Users can view own agreements"
  ON public.user_agreements
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.user_agreements FROM PUBLIC;
REVOKE ALL ON TABLE public.user_agreements FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.user_agreements FROM authenticated;
GRANT SELECT ON TABLE public.user_agreements TO authenticated;

COMMIT;
