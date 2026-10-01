-- NEW 2F M2C-0 — NEW password username creation charset
-- Additive. Does not rewrite 20260928160000_2f_c1_0a_login_capability.sql.
-- Apply to payment-test (bvihpoorwriejybixmoc) from this ticket.
-- Do NOT apply to production (qifloweuwyhvukabgnoa) in this ticket.
-- Does NOT: rewrite existing user_custom_id rows, tighten CHECK, change Login lookup.

BEGIN;

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
    IF v_user_custom_id !~ '^[a-z0-9]{4,32}$' THEN
      RAISE EXCEPTION
        'member signup user_custom_id must be 4–32 alphanumeric chars';
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

COMMIT;
