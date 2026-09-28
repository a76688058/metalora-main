-- NEW 2F B2b — Before User Created (PAYMENT-TEST ONLY)
-- Target ref: bvihpoorwriejybixmoc
-- Intentionally NOT in supabase/migrations/ so production migrate tooling cannot pick it up.
--
-- Postgres Auth Hook contract:
--   allow  → {}
--   reject → { "error": { "http_code": 403, "message": "..." } }
-- Do not RAISE EXCEPTION for expected policy rejection.
-- Provider is taken from the hook payload only (never email-domain inference).
--
-- Intended GoTrue URI:
--   pg-functions://postgres/public/hook_before_user_created

BEGIN;

CREATE OR REPLACE FUNCTION public.hook_before_user_created(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  provider text;
  is_anonymous boolean;
BEGIN
  IF event IS NULL OR jsonb_typeof(event) <> 'object' THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Public password signup is not allowed.'
      )
    );
  END IF;

  is_anonymous := lower(coalesce(event->'user'->>'is_anonymous', 'false')) IN ('true', 't', '1');
  IF is_anonymous THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Public password signup is not allowed.'
      )
    );
  END IF;

  provider := lower(btrim(coalesce(event->'user'->'app_metadata'->>'provider', '')));

  IF provider = 'email' OR provider = 'anonymous' OR provider = '' THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Public password signup is not allowed.'
      )
    );
  END IF;

  RETURN '{}'::jsonb;
END;
$$;

ALTER FUNCTION public.hook_before_user_created(jsonb) OWNER TO postgres;

COMMENT ON FUNCTION public.hook_before_user_created(jsonb) IS
  'B2b payment-test Before User Created. Rejects public email/anonymous creation with http_code 403. Allows OAuth providers. Not a production migration.';

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;

REVOKE ALL ON FUNCTION public.hook_before_user_created(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hook_before_user_created(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.hook_before_user_created(jsonb) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.hook_before_user_created(jsonb) TO supabase_auth_admin;

COMMIT;
