-- Existing authenticated-user member enrollment.
-- Create only. Do NOT apply to production (qifloweuwyhvukabgnoa) in this ticket.
-- Does NOT: createUser, remap auth.users.email, mutate is_admin, rewrite phone_number.

BEGIN;

-- ---------------------------------------------------------------------------
-- Atomically consume an identity_link proof and enroll the same auth uid.
-- Proof must belong to p_user_id. Consumed / expired / foreign proofs fail closed.
-- Username uniqueness + phone fingerprint uniqueness enforced in-transaction.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.member_enroll_existing(
  p_user_id uuid,
  p_ticket_hmac text,
  p_username text,
  p_consented boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_ticket public.phone_verification_tickets%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_username text;
  v_existing_username text;
BEGIN
  IF p_user_id IS NULL
     OR p_ticket_hmac IS NULL
     OR p_ticket_hmac !~ '^[0-9a-f]{64}$'
     OR p_username IS NULL
     OR p_consented IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  v_username := lower(btrim(p_username));
  IF v_username IS NULL OR v_username !~ '^[a-z0-9]{4,32}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SELECT *
  INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_profile');
  END IF;

  v_existing_username := NULLIF(btrim(v_profile.user_custom_id), '');

  IF v_existing_username IS NOT NULL
     AND btrim(coalesce(v_profile.verified_phone_fingerprint, '')) <> ''
     AND v_profile.phone_verified_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already_complete', true);
  END IF;

  IF v_existing_username IS NOT NULL
     AND lower(v_existing_username) IS DISTINCT FROM v_username THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'username_mismatch');
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

  IF v_ticket.status IN ('claimed', 'consumed', 'failed') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'used');
  END IF;

  IF v_ticket.purpose IS DISTINCT FROM 'identity_link'
     OR v_ticket.status IS DISTINCT FROM 'issued'
     OR v_ticket.user_id IS DISTINCT FROM p_user_id
     OR v_ticket.expires_at <= now()
     OR v_ticket.phone_fingerprint IS NULL
     OR v_ticket.phone_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  IF btrim(coalesce(v_profile.verified_phone_fingerprint, '')) <> ''
     AND v_profile.verified_phone_fingerprint IS DISTINCT FROM v_ticket.phone_fingerprint THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.verified_phone_fingerprint = v_ticket.phone_fingerprint
      AND p.id IS DISTINCT FROM p_user_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'phone_already_registered');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE lower(p.user_custom_id) = v_username
      AND p.id IS DISTINCT FROM p_user_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'username_collision');
  END IF;

  UPDATE public.phone_verification_tickets
  SET status = 'claimed',
      claimed_at = now()
  WHERE id = v_ticket.id
    AND status = 'issued'
    AND purpose = 'identity_link'
    AND user_id = p_user_id
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'used');
  END IF;

  UPDATE public.profiles
  SET
    user_custom_id = coalesce(v_existing_username, v_username),
    verified_phone_e164 = v_ticket.phone_e164,
    verified_phone_fingerprint = v_ticket.phone_fingerprint,
    phone_verified_at = now(),
    agreed_to_terms_at = coalesce(agreed_to_terms_at, now()),
    agreed_to_privacy_at = coalesce(agreed_to_privacy_at, now()),
    agreed_to_cookie_at = coalesce(agreed_to_cookie_at, now()),
    password_login_enabled = true,
    updated_at = now()
  WHERE id = p_user_id
    AND (
      user_custom_id IS NULL
      OR btrim(user_custom_id) = ''
      OR lower(user_custom_id) = v_username
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member_enroll_profile_update_failed';
  END IF;

  UPDATE public.phone_verification_tickets
  SET status = 'consumed',
      consumed_at = now(),
      user_id = p_user_id
  WHERE id = v_ticket.id
    AND status = 'claimed'
    AND purpose = 'identity_link'
    AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member_enroll_ticket_consume_failed';
  END IF;

  RETURN jsonb_build_object('ok', true, 'already_complete', false);
EXCEPTION
  WHEN unique_violation THEN
    IF SQLERRM ILIKE '%user_custom_id%' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'username_collision');
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'phone_already_registered');
END;
$$;

REVOKE ALL ON FUNCTION public.member_enroll_existing(uuid, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.member_enroll_existing(uuid, text, text, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_enroll_existing(uuid, text, text, boolean) TO service_role;

COMMENT ON FUNCTION public.member_enroll_existing(uuid, text, text, boolean) IS
  'Enroll an existing auth user as a usable member from an identity_link proof. service_role only. Same uid. Does not change auth.users.email or is_admin. Consumes the proof once.';

COMMIT;
