-- #16A-3 Phase 1 — Profiles privacy helper functions
-- Shared Supabase project: applies to production AND metalora-cursor-test.--
-- Scope:
--   - SECURITY DEFINER RPC: username existence (boolean, no PII)
--   - SECURITY DEFINER helper: current-user admin check (boolean, RLS-safe)
--
-- Out of scope (later #16A-3 phases):
--   - DROP "Allow read access for all" or any existing profiles SELECT policies
--   - CREATE/ALTER profiles SELECT / admin UPDATE policies
--   - LoginModal / AuthContext / frontend changes
--
-- Username semantics must match src/components/LoginModal.tsx:
--   .eq('user_custom_id', formData.username) — exact, case-sensitive, no trim.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Username existence (login lookup + signup uniqueness)
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
    WHERE p.user_custom_id = $1
  );
$$;

ALTER FUNCTION public.profiles_username_exists(text) OWNER TO postgres;

COMMENT ON FUNCTION public.profiles_username_exists(text) IS
  'Returns true when a profiles row exists with the given user_custom_id. '
  'Boolean-only; exposes no row data. Matches LoginModal .eq(user_custom_id, username).';

REVOKE ALL ON FUNCTION public.profiles_username_exists(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profiles_username_exists(text) TO anon;
GRANT EXECUTE ON FUNCTION public.profiles_username_exists(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Current-session admin flag (for future profiles RLS policies)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profiles_is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
      AND p.is_admin IS TRUE
  );
$$;

ALTER FUNCTION public.profiles_is_current_user_admin() OWNER TO postgres;

COMMENT ON FUNCTION public.profiles_is_current_user_admin() IS
  'Returns true when auth.uid() has is_admin on public.profiles. '
  'SECURITY DEFINER (owner postgres) avoids recursive RLS when used in policies.';

REVOKE ALL ON FUNCTION public.profiles_is_current_user_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.profiles_is_current_user_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.profiles_is_current_user_admin() TO authenticated;
COMMIT;
