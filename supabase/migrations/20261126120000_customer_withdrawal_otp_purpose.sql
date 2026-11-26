-- Customer withdrawal OTP purpose. NOT APPLIED by this implementation task.
-- Extends the existing purpose checks only. Does not change payment tables.

BEGIN;

ALTER TABLE public.otp_challenges DROP CONSTRAINT otp_challenges_purpose_check;
ALTER TABLE public.otp_challenges
  ADD CONSTRAINT otp_challenges_purpose_check
  CHECK (purpose IN ('signup', 'recovery', 'change_phone', 'identity_link', 'withdrawal'));

ALTER TABLE public.phone_verification_tickets DROP CONSTRAINT phone_verification_tickets_purpose_check;
ALTER TABLE public.phone_verification_tickets
  ADD CONSTRAINT phone_verification_tickets_purpose_check
  CHECK (purpose IN ('signup', 'recovery', 'change_phone', 'identity_link', 'withdrawal'));

CREATE OR REPLACE FUNCTION public.otp_create_active_challenge(
  p_id uuid,
  p_purpose text,
  p_phone_fingerprint text,
  p_user_id uuid,
  p_code_hmac text,
  p_ip_hmac text,
  p_request_id uuid,
  p_expires_at timestamptz,
  p_cooldown_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_existing public.otp_challenges%ROWTYPE;
BEGIN
  IF p_id IS NULL
     OR p_purpose NOT IN ('signup', 'recovery', 'change_phone', 'identity_link', 'withdrawal')
     OR p_phone_fingerprint IS NULL OR p_phone_fingerprint !~ '^[0-9a-f]{64}$'
     OR p_code_hmac IS NULL OR p_code_hmac !~ '^[0-9a-f]{64}$'
     OR p_ip_hmac IS NULL OR p_ip_hmac !~ '^[0-9a-f]{64}$'
     OR p_request_id IS NULL
     OR p_expires_at IS NULL
     OR p_cooldown_seconds IS NULL OR p_cooldown_seconds < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  UPDATE public.otp_challenges
  SET status = 'expired'
  WHERE phone_fingerprint = p_phone_fingerprint
    AND purpose = p_purpose
    AND status = 'active'
    AND expires_at <= now();

  SELECT *
  INTO v_existing
  FROM public.otp_challenges
  WHERE phone_fingerprint = p_phone_fingerprint
    AND purpose = p_purpose
    AND status = 'active'
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.last_sent_at + make_interval(secs => p_cooldown_seconds) > now() THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'cooldown');
    END IF;
    UPDATE public.otp_challenges
    SET status = 'superseded'
    WHERE id = v_existing.id;
  END IF;

  BEGIN
    INSERT INTO public.otp_challenges (
      id, purpose, phone_fingerprint, user_id, code_hmac, status, expires_at,
      verify_fails, ip_hmac, request_id, last_sent_at
    ) VALUES (
      p_id, p_purpose, p_phone_fingerprint, p_user_id, p_code_hmac, 'active', p_expires_at,
      0, p_ip_hmac, p_request_id, now()
    );
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'conflict');
  END;

  RETURN jsonb_build_object('ok', true, 'id', p_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.otp_verify_and_issue_ticket(
  p_purpose text,
  p_phone_fingerprint text,
  p_code_hmac text,
  p_ticket_hmac text,
  p_phone_e164 text,
  p_caller_user_id uuid,
  p_request_id uuid,
  p_ticket_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_challenge public.otp_challenges%ROWTYPE;
  v_ticket_id uuid;
BEGIN
  IF p_purpose NOT IN ('signup', 'recovery', 'change_phone', 'identity_link', 'withdrawal')
     OR p_phone_fingerprint IS NULL OR p_phone_fingerprint !~ '^[0-9a-f]{64}$'
     OR p_code_hmac IS NULL OR p_code_hmac !~ '^[0-9a-f]{64}$'
     OR p_ticket_hmac IS NULL OR p_ticket_hmac !~ '^[0-9a-f]{64}$'
     OR p_phone_e164 IS NULL
     OR p_phone_e164 !~ '^\+82(10[0-9]{8}|1[16789][0-9]{7,8})$'
     OR p_request_id IS NULL
     OR p_ticket_expires_at IS NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  UPDATE public.otp_challenges
  SET status = 'expired'
  WHERE phone_fingerprint = p_phone_fingerprint
    AND purpose = p_purpose
    AND status = 'active'
    AND expires_at <= now();

  SELECT *
  INTO v_challenge
  FROM public.otp_challenges
  WHERE phone_fingerprint = p_phone_fingerprint
    AND purpose = p_purpose
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  IF v_challenge.user_id IS NOT NULL
     AND (p_caller_user_id IS NULL OR v_challenge.user_id IS DISTINCT FROM p_caller_user_id) THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  IF v_challenge.code_hmac IS DISTINCT FROM p_code_hmac THEN
    IF v_challenge.verify_fails + 1 >= 5 THEN
      UPDATE public.otp_challenges
      SET verify_fails = 5, status = 'failed'
      WHERE id = v_challenge.id;
    ELSE
      UPDATE public.otp_challenges
      SET verify_fails = v_challenge.verify_fails + 1
      WHERE id = v_challenge.id;
    END IF;
    RETURN jsonb_build_object('ok', false);
  END IF;

  UPDATE public.otp_challenges
  SET status = 'verified'
  WHERE id = v_challenge.id;

  INSERT INTO public.phone_verification_tickets (
    ticket_hmac, purpose, phone_fingerprint, phone_e164, user_id, status, expires_at, request_id, challenge_id
  ) VALUES (
    p_ticket_hmac, v_challenge.purpose, v_challenge.phone_fingerprint, p_phone_e164,
    v_challenge.user_id, 'issued', p_ticket_expires_at, p_request_id, v_challenge.id
  )
  RETURNING id INTO v_ticket_id;

  RETURN jsonb_build_object('ok', true, 'ticket_id', v_ticket_id);
END;
$$;

COMMIT;
