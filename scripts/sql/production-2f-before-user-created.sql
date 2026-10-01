-- NEW 2 P0.9A — Production Before User Created hook SOURCE
-- Target ref (future apply only): qifloweuwyhvukabgnoa
-- Status: NOT APPLIED. NOT mapped in Hosted Auth.
-- Intentionally NOT in supabase/migrations/.
-- Production has NO supabase_migrations ledger. supabase db push remains FORBIDDEN.
-- Apply later only via the controlled production SQL procedure, then map Hosted Auth.
--
-- Postgres Auth Hook contract (Before User Created):
--   allow  → {}
--   reject → { "error": { "http_code": 403, "message": "..." } }
-- Do not RAISE EXCEPTION for expected policy rejection.
-- Provider is taken from the hook payload only (never email-domain inference).
-- Payload fields used (same as payment-test / GoTrue hook event):
--   event.user.is_anonymous
--   event.user.app_metadata.provider
-- Do not require email (custom:naver missing-email must remain allowed).
--
-- Trusted social providers only: google, kakao, custom:naver.
-- Reject: public email, anonymous, empty/malformed provider, bare naver,
--         arbitrary custom:*, apple, unknown.
--
-- Approved METALORA password members are created by service-role
-- Admin createUser via POST /api/auth/signup/complete (not public signUp).
-- This function must not invent an email-provider bypass for anon-key signup.
-- Sign-in is not governed by Before User Created.
--
-- Intended future GoTrue URI (do not map in P0.9A):
--   pg-functions://postgres/public/hook_before_user_created

BEGIN;

CREATE OR REPLACE FUNCTION public.hook_before_user_created(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
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

  IF provider = 'google' OR provider = 'kakao' OR provider = 'custom:naver' THEN
    RETURN '{}'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Public password signup is not allowed.'
    )
  );
END;
$$;

ALTER FUNCTION public.hook_before_user_created(jsonb) OWNER TO postgres;

COMMENT ON FUNCTION public.hook_before_user_created(jsonb) IS
  'P0.9A production Before User Created SOURCE. Rejects public email/anonymous/unknown creation with http_code 403. Allows only google, kakao, custom:naver. Authorize/reject only — no username, phone, or merge. NOT applied/mapped until a later controlled ticket.';

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;

REVOKE ALL ON FUNCTION public.hook_before_user_created(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hook_before_user_created(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.hook_before_user_created(jsonb) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.hook_before_user_created(jsonb) TO supabase_auth_admin;

COMMIT;
