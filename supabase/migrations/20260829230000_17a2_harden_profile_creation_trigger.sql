-- #17A-2 — Harden auth.users → public.profiles creation trigger
-- Applied to shared Supabase project (production + metalora-cursor-test).
--
-- @metalora.me is the current member username/password identity convention
-- (LoginModal signUp). For those accounts, raw_user_meta_data.user_custom_id
-- must be present so profiles.user_custom_id is never created NULL via signup.
--
-- Non-member / real-email accounts (e.g. admin provisioning via Dashboard) are
-- intentionally NOT required to supply user_custom_id metadata yet.
--
-- Legacy rows with profiles.user_custom_id IS NULL are out of scope here;
-- remediation/backfill is a separate ticket. This migration does not UPDATE
-- or DELETE existing data and does not add a NOT NULL constraint.
--
-- Replaces live handle_new_user() which currently swallows all exceptions
-- (EXCEPTION WHEN OTHERS THEN RETURN NEW), allowing auth.users without profiles.
--
-- Scope:
--   - CREATE OR REPLACE public.handle_new_user()
-- Out of scope:
--   - Trigger DDL (on_auth_user_created already exists live)
--   - RLS / GRANT changes
--   - Application code changes
--   - Data backfill

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_user_custom_id text;
BEGIN
  v_user_custom_id := NULLIF(btrim(NEW.raw_user_meta_data->>'user_custom_id'), '');

  -- Member signup convention: username@metalora.me + non-blank user_custom_id metadata.
  IF NEW.email ILIKE '%@metalora.me' AND v_user_custom_id IS NULL THEN
    RAISE EXCEPTION
      'member signup requires non-blank user_custom_id metadata';
  END IF;

  INSERT INTO public.profiles (
    id,
    user_custom_id,
    full_name,
    phone_number,
    agreed_to_terms_at,
    agreed_to_privacy_at,
    agreed_to_cookie_at,
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
    NOW()
  );

  RETURN NEW;
END;
$$;

COMMIT;
