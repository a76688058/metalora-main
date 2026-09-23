-- NEW 2F Slice A2 — OTP challenges, proof tickets, rate limits, trusted RPCs
-- Durable shared migration. No verified-phone unique index (blocked on Slice 0b).
-- Internal tables: RLS on, no anon/authenticated policies.
-- SECURITY DEFINER RPCs: service_role only. search_path pinned.

BEGIN;

CREATE TABLE IF NOT EXISTS public.otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL
    CHECK (purpose IN ('signup', 'recovery', 'change_phone', 'identity_link')),
  phone_fingerprint text NOT NULL
    CHECK (phone_fingerprint ~ '^[0-9a-f]{64}$'),
  user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  code_hmac text NOT NULL
    CHECK (code_hmac ~ '^[0-9a-f]{64}$'),
  status text NOT NULL
    CHECK (status IN ('active', 'verified', 'failed', 'expired', 'superseded')),
  expires_at timestamptz NOT NULL,
  verify_fails integer NOT NULL DEFAULT 0
    CHECK (verify_fails >= 0),
  ip_hmac text NOT NULL
    CHECK (ip_hmac ~ '^[0-9a-f]{64}$'),
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS otp_challenges_one_active_phone_purpose_uidx
  ON public.otp_challenges (phone_fingerprint, purpose)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS otp_challenges_phone_purpose_created_idx
  ON public.otp_challenges (phone_fingerprint, purpose, created_at DESC);

CREATE TABLE IF NOT EXISTS public.phone_verification_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_hmac text NOT NULL UNIQUE
    CHECK (ticket_hmac ~ '^[0-9a-f]{64}$'),
  purpose text NOT NULL
    CHECK (purpose IN ('signup', 'recovery', 'change_phone', 'identity_link')),
  phone_fingerprint text NOT NULL
    CHECK (phone_fingerprint ~ '^[0-9a-f]{64}$'),
  phone_e164 text NOT NULL
    CHECK (phone_e164 ~ '^\+82(10[0-9]{8}|1[16789][0-9]{7,8})$'),
  user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  status text NOT NULL
    CHECK (status IN ('issued', 'claimed', 'consumed', 'expired', 'failed')),
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz,
  consumed_at timestamptz,
  request_id uuid NOT NULL,
  challenge_id uuid REFERENCES public.otp_challenges (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS phone_verification_tickets_status_expires_idx
  ON public.phone_verification_tickets (status, expires_at);

CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (char_length(scope) BETWEEN 1 AND 64),
  key_hmac text NOT NULL
    CHECK (key_hmac ~ '^[0-9a-f]{64}$'),
  window_seconds integer NOT NULL CHECK (window_seconds > 0),
  bucket_started_at timestamptz NOT NULL,
  hit_count integer NOT NULL DEFAULT 0 CHECK (hit_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, key_hmac, window_seconds, bucket_started_at)
);

ALTER TABLE public.otp_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_verification_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.otp_challenges FROM PUBLIC;
REVOKE ALL ON TABLE public.otp_challenges FROM anon, authenticated;
GRANT ALL ON TABLE public.otp_challenges TO service_role;

REVOKE ALL ON TABLE public.phone_verification_tickets FROM PUBLIC;
REVOKE ALL ON TABLE public.phone_verification_tickets FROM anon, authenticated;
GRANT ALL ON TABLE public.phone_verification_tickets TO service_role;

REVOKE ALL ON TABLE public.auth_rate_limits FROM PUBLIC;
REVOKE ALL ON TABLE public.auth_rate_limits FROM anon, authenticated;
GRANT ALL ON TABLE public.auth_rate_limits TO service_role;

COMMENT ON TABLE public.otp_challenges IS
  'Slice A OTP challenges. Server-only. One active row per phone_fingerprint+purpose.';

COMMENT ON TABLE public.phone_verification_tickets IS
  'Opaque OTP proof tickets. Server stores HMAC only. Client never sees row ids.';

COMMENT ON TABLE public.auth_rate_limits IS
  'Deterministic fixed-window counters. Slice A OTP scopes; reusable for login_ip_user later.';

-- ---------------------------------------------------------------------------
-- Atomic rate-limit increment
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_rate_limit_hit(
  p_scope text,
  p_key_hmac text,
  p_window_seconds integer,
  p_bucket_started_at timestamptz
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_scope IS NULL OR btrim(p_scope) = '' OR char_length(p_scope) > 64 THEN
    RAISE EXCEPTION 'otp_rate_rejected' USING ERRCODE = '22023';
  END IF;
  IF p_key_hmac IS NULL OR p_key_hmac !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'otp_rate_rejected' USING ERRCODE = '22023';
  END IF;
  IF p_window_seconds IS NULL OR p_window_seconds <= 0 THEN
    RAISE EXCEPTION 'otp_rate_rejected' USING ERRCODE = '22023';
  END IF;
  IF p_bucket_started_at IS NULL THEN
    RAISE EXCEPTION 'otp_rate_rejected' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.auth_rate_limits (
    scope, key_hmac, window_seconds, bucket_started_at, hit_count
  ) VALUES (
    p_scope, p_key_hmac, p_window_seconds, p_bucket_started_at, 1
  )
  ON CONFLICT (scope, key_hmac, window_seconds, bucket_started_at)
  DO UPDATE SET hit_count = public.auth_rate_limits.hit_count + 1
  RETURNING hit_count INTO v_count;

  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- Create active challenge (expire/supersede + insert). Unique index is the race guard.
-- ---------------------------------------------------------------------------
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
     OR p_purpose NOT IN ('signup', 'recovery', 'change_phone', 'identity_link')
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
      id,
      purpose,
      phone_fingerprint,
      user_id,
      code_hmac,
      status,
      expires_at,
      verify_fails,
      ip_hmac,
      request_id,
      last_sent_at
    ) VALUES (
      p_id,
      p_purpose,
      p_phone_fingerprint,
      p_user_id,
      p_code_hmac,
      'active',
      p_expires_at,
      0,
      p_ip_hmac,
      p_request_id,
      now()
    );
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'conflict');
  END;

  RETURN jsonb_build_object('ok', true, 'id', p_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- Verify active challenge and issue proof ticket (HMAC only).
-- ---------------------------------------------------------------------------
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
  IF p_purpose NOT IN ('signup', 'recovery', 'change_phone', 'identity_link')
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
      SET verify_fails = 5,
          status = 'failed'
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
    ticket_hmac,
    purpose,
    phone_fingerprint,
    phone_e164,
    user_id,
    status,
    expires_at,
    request_id,
    challenge_id
  ) VALUES (
    p_ticket_hmac,
    v_challenge.purpose,
    v_challenge.phone_fingerprint,
    p_phone_e164,
    v_challenge.user_id,
    'issued',
    p_ticket_expires_at,
    p_request_id,
    v_challenge.id
  )
  RETURNING id INTO v_ticket_id;

  RETURN jsonb_build_object('ok', true, 'ticket_id', v_ticket_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- Atomic change_phone bind: claim ticket + write verified phone + consume.
-- Rolls back completely on fingerprint conflict. Does not touch phone_number.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.phone_bind_change_phone(
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
BEGIN
  IF p_user_id IS NULL
     OR p_ticket_hmac IS NULL
     OR p_ticket_hmac !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'otp_bind_rejected' USING ERRCODE = '22023';
  END IF;

  SELECT user_custom_id
  INTO v_username
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_username IS NULL OR btrim(v_username) = '' THEN
    RAISE EXCEPTION 'otp_bind_rejected' USING ERRCODE = '22023';
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

  IF NOT FOUND
     OR v_ticket.status IS DISTINCT FROM 'issued'
     OR v_ticket.purpose IS DISTINCT FROM 'change_phone'
     OR v_ticket.user_id IS DISTINCT FROM p_user_id
     OR v_ticket.expires_at <= now() THEN
    RAISE EXCEPTION 'otp_bind_rejected' USING ERRCODE = '22023';
  END IF;

  UPDATE public.phone_verification_tickets
  SET status = 'claimed',
      claimed_at = now()
  WHERE id = v_ticket.id;

  IF EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.verified_phone_fingerprint = v_ticket.phone_fingerprint
      AND p.id IS DISTINCT FROM p_user_id
  ) THEN
    RAISE EXCEPTION 'otp_bind_conflict' USING ERRCODE = '23505';
  END IF;

  UPDATE public.profiles
  SET
    verified_phone_e164 = v_ticket.phone_e164,
    verified_phone_fingerprint = v_ticket.phone_fingerprint,
    phone_verified_at = now(),
    updated_at = now()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'otp_bind_rejected' USING ERRCODE = '22023';
  END IF;

  UPDATE public.phone_verification_tickets
  SET status = 'consumed',
      consumed_at = now()
  WHERE id = v_ticket.id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.auth_rate_limit_hit(text, text, integer, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_rate_limit_hit(text, text, integer, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_rate_limit_hit(text, text, integer, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.otp_create_active_challenge(uuid, text, text, uuid, text, text, uuid, timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.otp_create_active_challenge(uuid, text, text, uuid, text, text, uuid, timestamptz, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.otp_create_active_challenge(uuid, text, text, uuid, text, text, uuid, timestamptz, integer) TO service_role;

REVOKE ALL ON FUNCTION public.otp_verify_and_issue_ticket(text, text, text, text, text, uuid, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.otp_verify_and_issue_ticket(text, text, text, text, text, uuid, uuid, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.otp_verify_and_issue_ticket(text, text, text, text, text, uuid, uuid, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.phone_bind_change_phone(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.phone_bind_change_phone(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.phone_bind_change_phone(uuid, text) TO service_role;

COMMENT ON FUNCTION public.phone_bind_change_phone(uuid, text) IS
  'Trusted atomic change_phone bind. service_role only. Caller must pass server-verified user id.';

COMMIT;
