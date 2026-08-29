-- #16A-2 — Products public WRITE lockdown only
-- Applied to shared Supabase project (production + metalora-cursor-test).
--
-- Scope (narrow / P0):
--   - DROP public INSERT + UPDATE policies only
--   - Do NOT change SELECT policies (keep current read/admin behavior)
--   - Do NOT create new SELECT or admin policies
--   - No FORCE ROW LEVEL SECURITY
--   - No GRANT/REVOKE
--   - No schema/data changes
--
-- Deferred (#16A-2C / later, after production FE has #16A-2A admin JWT fetch):
--   - Drop duplicate / open SELECT policies
--   - public SELECT visible-only
--   - Deduplicate admin ALL policies

BEGIN;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "상품 삽입 허용" ON public.products;
DROP POLICY IF EXISTS "상품 수정 허용" ON public.products;

COMMIT;
