-- NEW 2F Slice B1 — Recovery session, password-reset tickets, security events
-- Apply to payment-test (bvihpoorwriejybixmoc) only from the B1 ticket.
-- Does NOT revoke profiles_username_exists (deferred script outside this folder).

BEGIN;

CREATE TABLE IF NOT EXISTS public.recovery_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_hmac text NOT NULL UNIQUE
    CHECK (session_hmac ~ '^[0-9a-f]{64}$'),
  user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  account_kind text NOT NULL
    CHECK (account_kind IN ('password', 'social', 'none')),
  status text NOT NULL
    CHECK (status IN ('issued', 'consumed', 'expired')),
  expires_at timestamptz NOT NULL,
  request_id uuid NOT NULL,
  purpose text NOT NULL DEFAULT 'recovery' CHECK (purpose = 'recovery'),
  proof_ticket_id uuid REFERENCES public.phone_verification_tickets (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recovery_sessions_user_created_idx
  ON public.recovery_sessions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.password_reset_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_hmac text NOT NULL UNIQUE
    CHECK (ticket_hmac ~ '^[0-9a-f]{64}$'),
  recovery_session_id uuid NOT NULL REFERENCES public.recovery_sessions (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status text NOT NULL
    CHECK (status IN ('issued', 'claimed', 'completed', 'failed', 'expired', 'indeterminate')),
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz,
  finished_at timestamptz,
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS password_reset_tickets_one_issued_session_uidx
  ON public.password_reset_tickets (recovery_session_id)
  WHERE status = 'issued';

CREATE TABLE IF NOT EXISTS public.auth_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event text NOT NULL CHECK (char_length(event) BETWEEN 1 AND 64),
  outcome text NOT NULL CHECK (char_length(outcome) BETWEEN 1 AND 64),
  request_id uuid NOT NULL,
  user_id uuid,
  ip_hmac text NOT NULL CHECK (ip_hmac ~ '^[0-9a-f]{64}$'),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS auth_security_events_created_idx
  ON public.auth_security_events (created_at DESC);

ALTER TABLE public.recovery_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_security_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.recovery_sessions FROM PUBLIC;
REVOKE ALL ON TABLE public.recovery_sessions FROM anon, authenticated;
GRANT ALL ON TABLE public.recovery_sessions TO service_role;

REVOKE ALL ON TABLE public.password_reset_tickets FROM PUBLIC;
REVOKE ALL ON TABLE public.password_reset_tickets FROM anon, authenticated;
GRANT ALL ON TABLE public.password_reset_tickets TO service_role;

REVOKE ALL ON TABLE public.auth_security_events FROM PUBLIC;
REVOKE ALL ON TABLE public.auth_security_events FROM anon, authenticated;
GRANT ALL ON TABLE public.auth_security_events TO service_role;

CREATE OR REPLACE FUNCTION public.recovery_consume_and_open_session(
  p_proof_ticket_hmac text,
  p_session_hmac text,
  p_reset_ticket_hmac text,
  p_user_id uuid,
  p_account_kind text,
  p_request_id uuid,
  p_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_proof public.phone_verification_tickets%ROWTYPE;
  v_session_id uuid;
BEGIN
  IF p_proof_ticket_hmac IS NULL OR p_proof_ticket_hmac !~ '^[0-9a-f]{64}$'
     OR p_session_hmac IS NULL OR p_session_hmac !~ '^[0-9a-f]{64}$'
     OR p_account_kind NOT IN ('password', 'social', 'none')
     OR p_request_id IS NULL
     OR p_expires_at IS NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  IF p_account_kind = 'password' THEN
    IF p_user_id IS NULL
       OR p_reset_ticket_hmac IS NULL
       OR p_reset_ticket_hmac !~ '^[0-9a-f]{64}$' THEN
      RETURN jsonb_build_object('ok', false);
    END IF;
  END IF;

  UPDATE public.phone_verification_tickets
  SET status = 'expired'
  WHERE ticket_hmac = p_proof_ticket_hmac
    AND status = 'issued'
    AND expires_at <= now();

  SELECT *
  INTO v_proof
  FROM public.phone_verification_tickets
  WHERE ticket_hmac = p_proof_ticket_hmac
  FOR UPDATE;

  IF NOT FOUND
     OR v_proof.status IS DISTINCT FROM 'issued'
     OR v_proof.purpose IS DISTINCT FROM 'recovery'
     OR v_proof.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  UPDATE public.phone_verification_tickets
  SET status = 'consumed',
      claimed_at = coalesce(claimed_at, now()),
      consumed_at = now()
  WHERE id = v_proof.id;

  INSERT INTO public.recovery_sessions (
    session_hmac, user_id, account_kind, status, expires_at, request_id, proof_ticket_id
  ) VALUES (
    p_session_hmac, p_user_id, p_account_kind, 'issued', p_expires_at, p_request_id, v_proof.id
  )
  RETURNING id INTO v_session_id;

  IF p_account_kind = 'password' THEN
    INSERT INTO public.password_reset_tickets (
      ticket_hmac, recovery_session_id, user_id, status, expires_at, request_id
    ) VALUES (
      p_reset_ticket_hmac, v_session_id, p_user_id, 'issued', p_expires_at, p_request_id
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'session_id', v_session_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.password_reset_claim_by_session(
  p_session_hmac text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_session public.recovery_sessions%ROWTYPE;
  v_ticket public.password_reset_tickets%ROWTYPE;
BEGIN
  UPDATE public.password_reset_tickets
  SET status = 'indeterminate',
      finished_at = now()
  WHERE status = 'claimed'
    AND finished_at IS NULL
    AND claimed_at IS NOT NULL
    AND claimed_at < now() - interval '60 seconds';

  UPDATE public.recovery_sessions
  SET status = 'expired'
  WHERE session_hmac = p_session_hmac
    AND status = 'issued'
    AND expires_at <= now();

  SELECT *
  INTO v_session
  FROM public.recovery_sessions
  WHERE session_hmac = p_session_hmac
  FOR UPDATE;

  IF NOT FOUND
     OR v_session.status IS DISTINCT FROM 'issued'
     OR v_session.account_kind IS DISTINCT FROM 'password'
     OR v_session.user_id IS NULL
     OR v_session.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  SELECT *
  INTO v_ticket
  FROM public.password_reset_tickets
  WHERE recovery_session_id = v_session.id
    AND status = 'issued'
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  UPDATE public.password_reset_tickets
  SET status = 'claimed',
      claimed_at = now()
  WHERE id = v_ticket.id
    AND status = 'issued'
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  UPDATE public.recovery_sessions
  SET status = 'consumed'
  WHERE id = v_session.id;

  RETURN jsonb_build_object(
    'ok', true,
    'ticket_id', v_ticket.id,
    'user_id', v_session.user_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.password_reset_finish(
  p_ticket_id uuid,
  p_outcome text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF p_outcome NOT IN ('completed', 'failed', 'indeterminate') THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  UPDATE public.password_reset_tickets
  SET status = p_outcome,
      finished_at = now()
  WHERE id = p_ticket_id
    AND status = 'claimed';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.password_reset_mark_stale_claimed()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.password_reset_tickets
  SET status = 'indeterminate',
      finished_at = now()
  WHERE status = 'claimed'
    AND finished_at IS NULL
    AND claimed_at IS NOT NULL
    AND claimed_at < now() - interval '60 seconds';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.recovery_consume_and_open_session(text, text, text, uuid, text, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recovery_consume_and_open_session(text, text, text, uuid, text, uuid, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recovery_consume_and_open_session(text, text, text, uuid, text, uuid, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.password_reset_claim_by_session(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.password_reset_claim_by_session(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.password_reset_claim_by_session(text) TO service_role;

REVOKE ALL ON FUNCTION public.password_reset_finish(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.password_reset_finish(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.password_reset_finish(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.password_reset_mark_stale_claimed() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.password_reset_mark_stale_claimed() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.password_reset_mark_stale_claimed() TO service_role;

COMMENT ON TABLE public.recovery_sessions IS
  'Slice B1 recovery sessions. Opaque token is HMAC-only. created_at is issued_at. TTL ~10 min. purpose recovery. Server-only.';

COMMENT ON TABLE public.password_reset_tickets IS
  'Slice B1 one-time password-reset tickets. issued→claimed→completed|failed|indeterminate. Never reopen. Server-only.';

COMMENT ON TABLE public.auth_security_events IS
  'Append-only auth security events. ip_hmac only. No raw IP/phone/password/OTP/tokens.';

COMMENT ON TABLE public.auth_rate_limits IS
  'Deterministic fixed-window counters. OTP + recovery/reset/change/signup-check. login_ip_user / login_ip schema-ready but unused until an enforceable login call site exists.';

COMMIT;
