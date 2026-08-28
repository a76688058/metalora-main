-- #16A-4B — Remove dangerous public cart_items policy
-- Applied to shared Supabase project (production + metalora-cursor-test).
--
-- Removed redundant policy "장바구니_풀프리" (ALL / public / USING true / WITH CHECK true).
-- Keeps existing "Users can manage own cart items" (authenticated own-row ALL).
--
-- Out of scope:
--   - Replacing or modifying the secure own-row policy
--   - GRANT changes, application code, other tables

BEGIN;

DROP POLICY IF EXISTS "장바구니_풀프리" ON public.cart_items;

COMMIT;
