-- #16A-0 — Profiles privileged-fields guard
-- DRAFT for version control. Do NOT apply until explicitly approved.
-- Shared Supabase project: applies to production AND metalora-cursor-test.
--
-- Scope:
--   - BEFORE INSERT/UPDATE trigger on public.profiles
--   - Force/preserve is_admin + total_spent for non-service_role actors
--   - Allow mutations of those columns only when JWT role is service_role
--     (e.g. server.ts payment confirm via supabaseAdmin)
--
-- Out of scope (later tickets):
--   - profiles RLS policy changes / public SELECT removal
--   - GRANT/REVOKE
--   - username RPC
--   - frontend changes
--   - column defaults / NOT NULL / data backfill
--
-- Note: service_role bypasses RLS; this trigger still runs on DML unless
-- the session is service_role (JWT). RLS bypass ≠ trigger bypass.

BEGIN;

CREATE OR REPLACE FUNCTION public.profiles_guard_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Trusted payment/backend: PostgREST service_role JWT only.
  -- Do not use deprecated auth.role(), current_user, or session_user allowances.
  IF coalesce(auth.jwt() ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.is_admin := false;
    NEW.total_spent := 0;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.is_admin := OLD.is_admin;
    NEW.total_spent := OLD.total_spent;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_guard_privileged_fields ON public.profiles;

CREATE TRIGGER trg_profiles_guard_privileged_fields
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_guard_privileged_fields();

COMMIT;
