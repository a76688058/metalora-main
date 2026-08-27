-- #16A-3A — Profiles privacy compatibility bridge
-- DRAFT for version control. Do NOT apply until explicitly approved.
-- Shared Supabase project: applies to production AND metalora-cursor-test.
--
-- Scope:
--   - private.is_current_user_admin() for RLS (not exposed as public RPC)
--   - DROP public "Allow read access for all"
--   - authenticated admin SELECT via private helper
--   - TEMPORARY anon SELECT policy + column grants (id, user_custom_id only)
--     so production LoginModal username lookup keeps working without FE change
--
-- Out of scope:
--   - username availability RPC
--   - authenticated table privilege changes
--   - INSERT/UPDATE policy changes
--   - #16A-0 privileged-fields trigger
--   - FORCE ROW LEVEL SECURITY
--
-- Deferred (#16A-3B): remove anon username bridge; tighten enumeration.

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (
      SELECT p.is_admin
      FROM public.profiles AS p
      WHERE p.id = (SELECT auth.uid())
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION private.is_current_user_admin() FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_current_user_admin() TO authenticated;

DROP POLICY IF EXISTS "Allow read access for all"
ON public.profiles;

CREATE POLICY "profiles_select_admin"
ON public.profiles
FOR SELECT
TO authenticated
USING ((SELECT private.is_current_user_admin()));

CREATE POLICY "profiles_anon_username_lookup"
ON public.profiles
FOR SELECT
TO anon
USING (true);

REVOKE SELECT ON TABLE public.profiles FROM anon;

GRANT SELECT (id, user_custom_id)
ON TABLE public.profiles
TO anon;

COMMIT;
