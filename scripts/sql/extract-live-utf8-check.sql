-- #18C-1C — READ-ONLY UTF-8 check of live finalize_paid_order body.
-- Run in the PRODUCTION SQL editor. SELECT only.
-- Do not guess literals from mojibake. Compare live hex to expected hex.
--
-- Expected UTF-8 hex (NFC, from the live-applied function source / pg_proc.prosrc):
--   고객 = eab3a0eab09d
--   제품 = eca09ced9288
--   기본 = eab8b0ebb3b8
-- PASS: has_* true, live_*_hex equals expected_*_hex, has_mojibake_* false.

SELECT
  n.nspname AS schema_name,
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  (position('고객' IN p.prosrc) > 0) AS has_gogaek,
  (position('제품' IN p.prosrc) > 0) AS has_jepum,
  (position('기본' IN p.prosrc) > 0) AS has_gibon,
  (position('원좉컼' IN p.prosrc) > 0) AS has_mojibake_gogaek,
  (position('湲곕낯' IN p.prosrc) > 0) AS has_mojibake_gibon,
  encode(convert_to(substring(p.prosrc FROM '고객'), 'UTF8'), 'hex') AS live_gogaek_hex,
  encode(convert_to(substring(p.prosrc FROM '제품'), 'UTF8'), 'hex') AS live_jepum_hex,
  encode(convert_to(substring(p.prosrc FROM '기본'), 'UTF8'), 'hex') AS live_gibon_hex,
  'eab3a0eab09d'::text AS expected_gogaek_hex,
  'eca09ced9288'::text AS expected_jepum_hex,
  'eab8b0ebb3b8'::text AS expected_gibon_hex,
  octet_length(p.prosrc) AS prosrc_bytes,
  char_length(p.prosrc) AS prosrc_chars
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'finalize_paid_order';
