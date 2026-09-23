-- DEFERRED until NEW 2F Slice B2 stops LoginModal from calling this RPC.
-- DO NOT apply to payment-test or production before B2.
-- Intentionally NOT in supabase/migrations/ so migrate/apply tooling cannot
-- pick it up accidentally.
--
-- After B2:
--   1. Confirm Login/Signup no longer call profiles_username_exists
--   2. Apply this file to payment-test only
--   3. Then a later production gate

REVOKE ALL ON FUNCTION public.profiles_username_exists(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.profiles_username_exists(text) FROM anon;
REVOKE ALL ON FUNCTION public.profiles_username_exists(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.profiles_username_exists(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.profiles_username_exists(text) TO postgres;
