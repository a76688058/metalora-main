-- #18C-1D — SELECT-only checks for finalize_paid_order UTF-8 repair
-- Run on PRODUCTION. Do not INSERT / UPDATE / DELETE / ALTER.
--
-- A) BEFORE apply: confirm signature / definer / search_path / grants.
-- B) AFTER apply: same query plus literal hex PASS.

SELECT
  n.nspname AS schema_name,
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS identity_args,
  pg_get_function_result(p.oid) AS result_type,
  p.prosecdef AS is_security_definer,
  p.proconfig AS proconfig,
  pg_get_userbyid(p.proowner) AS owner_name,
  (position('고객' IN p.prosrc) > 0) AS has_gogaek,
  (position('제품' IN p.prosrc) > 0) AS has_jepum,
  (position('기본' IN p.prosrc) > 0) AS has_gibon,
  encode(convert_to(substring(p.prosrc FROM '고객'), 'UTF8'), 'hex') AS live_gogaek_hex,
  encode(convert_to(substring(p.prosrc FROM '제품'), 'UTF8'), 'hex') AS live_jepum_hex,
  encode(convert_to(substring(p.prosrc FROM '기본'), 'UTF8'), 'hex') AS live_gibon_hex,
  'eab3a0eab09d'::text AS expected_gogaek_hex,
  'eca09ced9288'::text AS expected_jepum_hex,
  'eab8b0ebb3b8'::text AS expected_gibon_hex,
  (
    pg_get_function_identity_arguments(p.oid)
    = 'p_verified_user_id uuid, p_user_custom_id text, p_order_number text, p_total_price numeric, p_paid_amount numeric, p_shipping_name text, p_shipping_phone text, p_zip_code text, p_address text, p_address_detail text, p_ordered_items jsonb, p_shipping_info jsonb, p_order_items jsonb'
  ) AS signature_matches_18a1,
  (p.prosecdef IS TRUE) AS security_definer_ok,
  ('search_path=pg_catalog, pg_temp' = ANY (COALESCE(p.proconfig, ARRAY[]::text[]))
    OR 'search_path=pg_catalog,pg_temp' = ANY (COALESCE(p.proconfig, ARRAY[]::text[]))) AS search_path_ok
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'finalize_paid_order';

SELECT
  r.grantee,
  r.privilege_type,
  r.is_grantable
FROM information_schema.routine_privileges r
WHERE r.specific_schema = 'public'
  AND r.routine_name = 'finalize_paid_order'
ORDER BY r.grantee, r.privilege_type;
