-- #18C-1B — READ-ONLY extract of live auth.users → handle_new_user trigger.
-- Run in the PRODUCTION SQL editor, or via supabase db query --db-url LIVE.
-- SELECT only. Do not DROP / CREATE on production.
-- Paste the returned CREATE TRIGGER statement into the TEST project only.

SELECT
  '-- metalora-live-auth-trigger' || E'\n' ||
  '-- APPLY ON metalora-payment-test ONLY. Do not run this CREATE on production.' || E'\n' ||
  pg_get_triggerdef(t.oid, true) || ';'
  AS trigger_sql
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
JOIN pg_namespace pn ON pn.oid = p.pronamespace
WHERE n.nspname = 'auth'
  AND c.relname = 'users'
  AND NOT t.tgisinternal
  AND t.tgname = 'on_auth_user_created'
  AND pn.nspname = 'public'
  AND p.proname = 'handle_new_user';
