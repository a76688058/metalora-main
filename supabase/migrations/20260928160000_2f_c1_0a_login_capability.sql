-- NEW 2F C1-0A — Login capability columns + social activation RPC
-- Apply to payment-test (bvihpoorwriejybixmoc) from the C1-0A ticket.
-- Do NOT apply to production (qifloweuwyhvukabgnoa) in this ticket.
-- Does NOT: enable Google/Kakao, account_status, withdrawal, marketing, production unique-phone.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password_login_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS social_login_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.password_login_enabled IS
  'True when the Auth user has a legitimate password-login identity. Not a usable-member substitute.';

COMMENT ON COLUMN public.profiles.social_login_enabled IS
  'True after trusted social-first activation (or later linked social capability). Not a usable-member substitute.';

-- ---------------------------------------------------------------------------
-- Freeze capability flags for non-service_role (same guard as verified-phone).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profiles_guard_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.jwt() ->> 'role', '') = 'service_role'
     OR current_user IN ('postgres', 'supabase_admin', 'supabase_auth_admin')
     OR session_user IN ('postgres', 'supabase_admin', 'supabase_auth_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.is_admin := false;
    NEW.total_spent := 0;
    NEW.verified_phone_e164 := NULL;
    NEW.verified_phone_fingerprint := NULL;
    NEW.phone_verified_at := NULL;
    NEW.password_login_enabled := false;
    NEW.social_login_enabled := false;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.is_admin := OLD.is_admin;
    NEW.total_spent := OLD.total_spent;
    IF OLD.user_custom_id IS NOT NULL THEN
      NEW.user_custom_id := OLD.user_custom_id;
    END IF;
    NEW.verified_phone_e164 := OLD.verified_phone_e164;
    NEW.verified_phone_fingerprint := OLD.verified_phone_fingerprint;
    NEW.phone_verified_at := OLD.phone_verified_at;
    NEW.password_login_enabled := OLD.password_login_enabled;
    NEW.social_login_enabled := OLD.social_login_enabled;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Password Auth users get password capability at profile insert.
-- Social OAuth (non-@metalora.me) stays both flags false (pending).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_user_custom_id text;
  v_password_login boolean := false;
BEGIN
  v_user_custom_id := NULLIF(btrim(NEW.raw_user_meta_data->>'user_custom_id'), '');

  IF NEW.email ILIKE '%@metalora.me' THEN
    IF v_user_custom_id IS NULL THEN
      RAISE EXCEPTION
        'member signup requires non-blank user_custom_id metadata';
    END IF;
    v_user_custom_id := lower(v_user_custom_id);
    IF v_user_custom_id !~ '^[a-z0-9][a-z0-9._-]{3,31}$' THEN
      RAISE EXCEPTION
        'member signup user_custom_id must be 4–32 chars: letters, digits, . _ -';
    END IF;
    v_password_login := true;
  END IF;

  INSERT INTO public.profiles (
    id,
    user_custom_id,
    full_name,
    phone_number,
    agreed_to_terms_at,
    agreed_to_privacy_at,
    agreed_to_cookie_at,
    password_login_enabled,
    social_login_enabled,
    updated_at
  )
  VALUES (
    NEW.id,
    v_user_custom_id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'phone_number',
    (NEW.raw_user_meta_data->>'agreed_to_terms_at')::timestamptz,
    (NEW.raw_user_meta_data->>'agreed_to_privacy_at')::timestamptz,
    (NEW.raw_user_meta_data->>'agreed_to_cookie_at')::timestamptz,
    v_password_login,
    false,
    NOW()
  );

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Trusted password signup bind also stamps password capability.
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
    password_login_enabled = true,
    social_login_enabled = false,
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
-- Existing password-identity backfill. Capability ≠ usable member.
-- Predicate: virtual @metalora.me Auth email + nonblank username + email identity.
-- Does not require verified phone. Does not infer from ml… prefix.
-- ---------------------------------------------------------------------------
UPDATE public.profiles AS p
SET
  password_login_enabled = true,
  updated_at = now()
FROM auth.users AS u
WHERE p.id = u.id
  AND p.password_login_enabled = false
  AND p.user_custom_id IS NOT NULL
  AND btrim(p.user_custom_id) <> ''
  AND lower(coalesce(u.email, '')) LIKE '%@metalora.me'
  AND EXISTS (
    SELECT 1
    FROM auth.identities AS i
    WHERE i.user_id = u.id
      AND i.provider = 'email'
  );

-- ---------------------------------------------------------------------------
-- Atomically activate a pending social profile from an identity_link proof.
-- R2: other owner of fingerprint → phone_already_registered (pending unchanged).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.social_activate_pending(
  p_user_id uuid,
  p_ticket_hmac text,
  p_username text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_ticket public.phone_verification_tickets%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_contact text;
  v_username text;
BEGIN
  IF p_user_id IS NULL
     OR p_ticket_hmac IS NULL
     OR p_ticket_hmac !~ '^[0-9a-f]{64}$'
     OR p_username IS NULL
     OR p_username !~ '^ml[a-z0-9]{10}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  v_username := lower(p_username);

  SELECT *
  INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_profile');
  END IF;

  IF btrim(coalesce(v_profile.user_custom_id, '')) <> ''
     AND btrim(coalesce(v_profile.verified_phone_fingerprint, '')) <> ''
     AND v_profile.phone_verified_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already_complete', true);
  END IF;

  SELECT *
  INTO v_ticket
  FROM public.phone_verification_tickets
  WHERE ticket_hmac = p_ticket_hmac
  FOR UPDATE;

  IF NOT FOUND
     OR v_ticket.purpose IS DISTINCT FROM 'identity_link'
     OR v_ticket.status IS DISTINCT FROM 'issued'
     OR v_ticket.user_id IS DISTINCT FROM p_user_id
     OR v_ticket.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  UPDATE public.phone_verification_tickets
  SET status = 'expired'
  WHERE id = v_ticket.id
    AND status = 'issued'
    AND expires_at <= now();

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

  IF v_ticket.phone_e164 ~ '^\+8210[0-9]{8}$' THEN
    v_contact := '010-' || substr(v_ticket.phone_e164, 6, 4) || '-' || substr(v_ticket.phone_e164, 10, 4);
  ELSE
    v_contact := '0' || substr(v_ticket.phone_e164, 4);
  END IF;

  UPDATE public.profiles
  SET
    user_custom_id = v_username,
    verified_phone_e164 = v_ticket.phone_e164,
    verified_phone_fingerprint = v_ticket.phone_fingerprint,
    phone_verified_at = now(),
    phone_number = CASE
      WHEN phone_number IS NULL OR btrim(phone_number) = '' THEN v_contact
      ELSE phone_number
    END,
    agreed_to_terms_at = coalesce(agreed_to_terms_at, now()),
    agreed_to_privacy_at = coalesce(agreed_to_privacy_at, now()),
    agreed_to_cookie_at = coalesce(agreed_to_cookie_at, now()),
    password_login_enabled = false,
    social_login_enabled = true,
    updated_at = now()
  WHERE id = p_user_id
    AND (user_custom_id IS NULL OR btrim(user_custom_id) = '');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  UPDATE public.phone_verification_tickets
  SET status = 'consumed',
      consumed_at = now(),
      user_id = p_user_id
  WHERE id = v_ticket.id
    AND status = 'claimed'
    AND purpose = 'identity_link';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'social_activate_ticket_consume_failed';
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

REVOKE ALL ON FUNCTION public.social_activate_pending(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.social_activate_pending(uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.social_activate_pending(uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.social_activate_pending(uuid, text, text) IS
  'C1-0A pending social activation. service_role only. identity_link proof bound to caller. R2 fail-closed on phone collision.';

COMMIT;
