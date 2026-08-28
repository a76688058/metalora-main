-- #16A-3 Phase 3 — Close public profiles SELECT
-- Shared Supabase project: applies to production AND metalora-cursor-test.
--
-- Prerequisites (already live):
--   - public.profiles_username_exists(text)
--   - public.profiles_is_current_user_admin()
--   - Frontend pre-auth username lookups use RPC (Phase 2)
--
-- Scope:
--   - DROP "Allow read access for all"
--   - ADD admin SELECT / UPDATE policies via profiles_is_current_user_admin()
--
-- Out of scope:
--   - Rewrite users_read_own_profile / users_update_own_profile (PUBLIC role)
--   - Modify #16A-0 privileged-fields trigger
--   - Frontend changes

BEGIN;

-- ---------------------------------------------------------------------------
-- Admin SELECT — all profile rows for authenticated admins
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_select_admin ON public.profiles;

CREATE POLICY profiles_select_admin
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.profiles_is_current_user_admin());

-- ---------------------------------------------------------------------------
-- Admin UPDATE — any profile row for authenticated admins
-- (#16A-0 trigger still blocks is_admin / total_spent client changes)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_update_admin ON public.profiles;

CREATE POLICY profiles_update_admin
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (public.profiles_is_current_user_admin())
  WITH CHECK (public.profiles_is_current_user_admin());

-- ---------------------------------------------------------------------------
-- Remove broad public/anonymous read access
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow read access for all" ON public.profiles;

COMMIT;
