-- #16C-1 — Profiles username / creation contract
-- Prepared for shared Supabase (production + metalora-cursor-test).
-- NOT applied from this ticket. Requires USER APPROVAL before production apply.
--
-- Does NOT:
--   - UPDATE / DELETE existing rows
--   - DROP columns or tables
--   - SET NOT NULL on user_custom_id (legacy/admin NULL rows remain)
--
-- Apply may FAIL if existing rows violate CHECK, NOT NULL, or the
-- lower(user_custom_id) unique index. If so: inspect, do not rewrite here.
--
-- Pre-apply inspect (read-only, user-approved session):
--   SELECT count(*) FROM public.profiles WHERE is_admin IS NULL;
--   SELECT count(*) FROM public.profiles WHERE total_spent IS NULL;
--   SELECT id, user_custom_id FROM public.profiles
--     WHERE user_custom_id IS NOT NULL
--       AND (
--         char_length(user_custom_id) NOT BETWEEN 4 AND 32
--         OR user_custom_id <> btrim(user_custom_id)
--         OR user_custom_id ~ '[[:space:]]'
--         OR position('@' IN user_custom_id) > 0
--       );
--   SELECT lower(user_custom_id) AS k, count(*)
--     FROM public.profiles
--     WHERE user_custom_id IS NOT NULL
--     GROUP BY 1 HAVING count(*) > 1;

BEGIN;

-- ---------------------------------------------------------------------------
-- Column comments (contract)
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN public.profiles.user_custom_id IS
  'Member login id. New @metalora.me signups store lower(trim(username)). '
  'NULL allowed for non-member / admin-provisioned accounts. '
  'Lookup is case-insensitive via profiles_username_exists.';

COMMENT ON COLUMN public.profiles.is_admin IS
  'Admin flag. Client INSERT/UPDATE cannot set this (#16A-0 trigger). '
  'Only service_role JWT may change it.';

COMMENT ON COLUMN public.profiles.total_spent IS
  'Cumulative paid amount. Client cannot set this (#16A-0 trigger). '
  'Incremented only by trusted payment finalization.';

-- ---------------------------------------------------------------------------
-- Defaults (idempotent)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ALTER COLUMN is_admin SET DEFAULT false;

ALTER TABLE public.profiles
  ALTER COLUMN total_spent SET DEFAULT 0;

-- Fails if any NULL exists. No backfill in this file.
ALTER TABLE public.profiles
  ALTER COLUMN is_admin SET NOT NULL;

ALTER TABLE public.profiles
  ALTER COLUMN total_spent SET NOT NULL;

-- ---------------------------------------------------------------------------
-- Format CHECK — nullable; no data rewrite
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_user_custom_id_format;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_user_custom_id_format
  CHECK (
    user_custom_id IS NULL
    OR (
      char_length(user_custom_id) BETWEEN 4 AND 32
      AND user_custom_id = btrim(user_custom_id)
      AND user_custom_id !~ '[[:space:]]'
      AND position('@' IN user_custom_id) = 0
    )
  );

-- ---------------------------------------------------------------------------
-- Case-insensitive uniqueness for non-null usernames
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_custom_id_lower_uidx
  ON public.profiles (lower(user_custom_id))
  WHERE user_custom_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Username existence RPC — trim + case-insensitive, boolean only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profiles_username_exists(username text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE btrim(coalesce($1, '')) <> ''
      AND p.user_custom_id IS NOT NULL
      AND lower(p.user_custom_id) = lower(btrim($1))
  );
$$;

ALTER FUNCTION public.profiles_username_exists(text) OWNER TO postgres;

COMMENT ON FUNCTION public.profiles_username_exists(text) IS
  'True when a non-null profiles.user_custom_id matches lower(trim(username)). '
  'Boolean-only; no row data. Blank input is false.';

REVOKE ALL ON FUNCTION public.profiles_username_exists(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profiles_username_exists(text) TO anon;
GRANT EXECUTE ON FUNCTION public.profiles_username_exists(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Member profile creation: trim + lower user_custom_id for @metalora.me
-- Supersedes 17A-2 function body for this contract only. Trigger DDL unchanged.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Freeze user_custom_id after it is set (prevents auth-email desync)
-- service_role may still change it. NULL → first fill remains allowed.
-- Preserves #16A-0 is_admin / total_spent behavior.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profiles_guard_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.jwt() ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.is_admin := false;
    NEW.total_spent := 0;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.is_admin := OLD.is_admin;
    NEW.total_spent := OLD.total_spent;
    IF OLD.user_custom_id IS NOT NULL THEN
      NEW.user_custom_id := OLD.user_custom_id;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Additive own-row RLS (does not DROP live users_read_own_profile / update)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;

CREATE POLICY profiles_select_own
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;

CREATE POLICY profiles_update_own
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

COMMIT;
