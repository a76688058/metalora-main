-- #16A-4C — Tighten public.banners RLS
-- Applied to shared Supabase project (production + metalora-cursor-test).
--
-- Tightened "Allow public read access to active banners" to is_active IS TRUE.
-- Replaced recursive admin lookup in "Allow admin full access to banners"
-- with public.profiles_is_current_user_admin() (#16A-3 Phase 1).
--
-- Prerequisites:
--   - public.profiles_is_current_user_admin()
--
-- Out of scope:
--   - GRANT changes, application code, AdminBanners embedded SQL
--   - cart_items, cs_inquiries, profiles, other tables

BEGIN;

-- ---------------------------------------------------------------------------
-- Public SELECT — active banners only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow public read access to active banners" ON public.banners;

CREATE POLICY "Allow public read access to active banners"
  ON public.banners
  FOR SELECT
  TO public
  USING (is_active IS TRUE);

-- ---------------------------------------------------------------------------
-- Admin ALL — full banner management (incl. inactive rows)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow admin full access to banners" ON public.banners;

CREATE POLICY "Allow admin full access to banners"
  ON public.banners
  FOR ALL
  TO authenticated
  USING (public.profiles_is_current_user_admin())
  WITH CHECK (public.profiles_is_current_user_admin());

COMMIT;
