-- #18C-1C — READ-ONLY extract of live public.finalize_paid_order only.
-- Run in the PRODUCTION SQL editor. SELECT only.
-- Small result: copy `function_ddl` from the SQL editor grid.
-- Do not open in Excel. Do not use the discarded giant apply_sql blob.
--
-- `function_ddl` must contain the Hangul literals 고객 / 제품 / 기본.
-- utf8_ok must be true. Do not apply to TEST until that is true.
-- Hex must be eab3a0eab09d / eca09ced9288 / eab8b0ebb3b8.

SELECT
  n.nspname AS schema_name,
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  pg_get_functiondef(p.oid) || ';' AS function_ddl,
  (
    position('고객' IN p.prosrc) > 0
    AND position('제품' IN p.prosrc) > 0
    AND position('기본' IN p.prosrc) > 0
    AND position('원좉컼' IN p.prosrc) = 0
    AND position('湲곕낯' IN p.prosrc) = 0
  ) AS utf8_ok,
  encode(convert_to(substring(p.prosrc FROM '고객'), 'UTF8'), 'hex') AS gogaek_hex,
  encode(convert_to(substring(p.prosrc FROM '제품'), 'UTF8'), 'hex') AS jepum_hex,
  encode(convert_to(substring(p.prosrc FROM '기본'), 'UTF8'), 'hex') AS gibon_hex,
  encode(convert_to(pg_get_functiondef(p.oid) || ';', 'UTF8'), 'base64') AS function_ddl_utf8_b64
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'finalize_paid_order';
