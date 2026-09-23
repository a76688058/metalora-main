-- NEW 2F Slice B2 — Trusted password-signup proof claim + phone bind
-- Apply to payment-test (bvihpoorwriejybixmoc) only from the B2 ticket.
-- Does NOT: unique production phone index, username-exists revoke,
-- Before User Created hook, Auth config mutation.

BEGIN;

-- ---------------------------------------------------------------------------
-- Atomically claim an issued signup-purpose proof. One claimant.
-- Does not reopen claimed / consumed / failed tickets.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.signup_claim_proof(
  p_ticket_hmac text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_ticket public.phone_verification_tickets%ROWTYPE;
BEGIN
  IF p_ticket_hmac IS NULL OR p_ticket_hmac !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  UPDATE public.phone_verification_tickets
  SET status = 'expired'
  WHERE ticket_hmac = p_ticket_hmac
    AND status = 'issued'
    AND expires_at <= now();

  SELECT *
  INTO v_ticket
  FROM public.phone_verification_tickets
  WHERE ticket_hmac = p_ticket_hmac
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  IF v_ticket.purpose IS DISTINCT FROM 'signup' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  IF v_ticket.status IN ('claimed', 'consumed', 'failed') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'used');
  END IF;

  IF v_ticket.status IS DISTINCT FROM 'issued'
     OR v_ticket.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  UPDATE public.phone_verification_tickets
  SET status = 'claimed',
      claimed_at = now()
  WHERE id = v_ticket.id
    AND status = 'issued'
    AND purpose = 'signup'
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'used');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- Bind verified phone onto a newly created member after signup proof claim.
-- Initializes profiles.phone_number once from the verified E.164.
-- Does not touch phone_bind_change_phone.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.phone_bind_signup(
  p_user_id uuid,
  p_ticket_hmac text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_ticket public.phone_verification_tickets%ROWTYPE;
  v_username text;
  v_contact text;
BEGIN
  IF p_user_id IS NULL
     OR p_ticket_hmac IS NULL
     OR p_ticket_hmac !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SELECT user_custom_id
  INTO v_username
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_username IS NULL OR btrim(v_username) = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_profile');
  END IF;

  SELECT *
  INTO v_ticket
  FROM public.phone_verification_tickets
  WHERE ticket_hmac = p_ticket_hmac
  FOR UPDATE;

  IF NOT FOUND
     OR v_ticket.purpose IS DISTINCT FROM 'signup'
     OR v_ticket.status IS DISTINCT FROM 'claimed' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.verified_phone_fingerprint = v_ticket.phone_fingerprint
      AND p.id IS DISTINCT FROM p_user_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict');
  END IF;

  IF v_ticket.phone_e164 ~ '^\+8210[0-9]{8}$' THEN
    v_contact := '010-' || substr(v_ticket.phone_e164, 6, 4) || '-' || substr(v_ticket.phone_e164, 10, 4);
  ELSE
    v_contact := '0' || substr(v_ticket.phone_e164, 4);
  END IF;

  UPDATE public.profiles
  SET
    verified_phone_e164 = v_ticket.phone_e164,
    verified_phone_fingerprint = v_ticket.phone_fingerprint,
    phone_verified_at = now(),
    phone_number = CASE
      WHEN phone_number IS NULL OR btrim(phone_number) = '' THEN v_contact
      ELSE phone_number
    END,
    updated_at = now()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_profile');
  END IF;

  UPDATE public.phone_verification_tickets
  SET status = 'consumed',
      consumed_at = now(),
      user_id = p_user_id
  WHERE id = v_ticket.id
    AND status = 'claimed'
    AND purpose = 'signup';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- Terminalize a claimed signup proof after Auth-create or bind failure.
-- Never reopens claimed / consumed / failed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.signup_fail_proof(
  p_ticket_hmac text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF p_ticket_hmac IS NULL OR p_ticket_hmac !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  UPDATE public.phone_verification_tickets
  SET status = 'failed'
  WHERE ticket_hmac = p_ticket_hmac
    AND purpose = 'signup'
    AND status = 'claimed';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.signup_claim_proof(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_claim_proof(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.signup_claim_proof(text) TO service_role;

REVOKE ALL ON FUNCTION public.phone_bind_signup(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.phone_bind_signup(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.phone_bind_signup(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.signup_fail_proof(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_fail_proof(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.signup_fail_proof(text) TO service_role;

COMMENT ON FUNCTION public.signup_claim_proof(text) IS
  'B2 one-time signup proof claim. service_role only. issued→claimed. Never reopens terminal states.';

COMMENT ON FUNCTION public.phone_bind_signup(uuid, text) IS
  'B2 trusted signup phone bind. service_role only. Claimed signup proof → verified phone + one-time contact init.';

COMMENT ON FUNCTION public.signup_fail_proof(text) IS
  'B2 terminalize claimed signup proof after Auth-create or bind failure. Never reopens.';

COMMIT;
