-- #16A-4A — Lock down public.cs_inquiries RLS
-- Applied to shared Supabase project (production + metalora-cursor-test).
--
-- Replaced policy "CS문의_풀프리" (ALL / public / USING true / WITH CHECK true).
--
-- Prerequisites:
--   - public.profiles_is_current_user_admin() (#16A-3 Phase 1)
--
-- Scope:
--   - public.cs_inquiries policies only
--
-- Out of scope:
--   - cart_items, banners, public.inquiries
--   - column restrictions, status constraints, GRANT changes
--   - application code changes

BEGIN;

-- ---------------------------------------------------------------------------
-- User SELECT — own inquiries only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS cs_inquiries_select_own ON public.cs_inquiries;

CREATE POLICY cs_inquiries_select_own
  ON public.cs_inquiries
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- User INSERT — own inquiries only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS cs_inquiries_insert_own ON public.cs_inquiries;

CREATE POLICY cs_inquiries_insert_own
  ON public.cs_inquiries
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Admin SELECT — all inquiries
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS cs_inquiries_select_admin ON public.cs_inquiries;

CREATE POLICY cs_inquiries_select_admin
  ON public.cs_inquiries
  FOR SELECT
  TO authenticated
  USING (public.profiles_is_current_user_admin());

-- ---------------------------------------------------------------------------
-- Admin UPDATE — any inquiry (answer, status)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS cs_inquiries_update_admin ON public.cs_inquiries;

CREATE POLICY cs_inquiries_update_admin
  ON public.cs_inquiries
  FOR UPDATE
  TO authenticated
  USING (public.profiles_is_current_user_admin())
  WITH CHECK (public.profiles_is_current_user_admin());

-- ---------------------------------------------------------------------------
-- Remove dangerous full-access policy (only after replacements exist)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "CS문의_풀프리" ON public.cs_inquiries;

COMMIT;
