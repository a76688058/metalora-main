-- NEW4-7 — Admin-assisted account withdrawal data model.
-- Additive. Do NOT modify NEW4-5 / NEW4-5A / NEW4-6 migrations.
-- Source-only. Do NOT apply to production from this ticket.
--
-- Model: DISABLE + ANONYMIZE the Auth user. Keep the UUID as a non-personal
-- technical subject so orders / payment_intents / user_agreements / cs_inquiries
-- remain intact. Do not hard-delete auth.users (CASCADE would destroy CS and
-- consent; orders.user_id is NOT NULL and still references auth.users).
--
-- Does NOT:
--   - fabricate withdrawal timestamps for historical users
--   - implement 5-year / 3-year automatic destruction
--   - publish public withdrawal copy
--   - enable payment

BEGIN;

-- ---------------------------------------------------------------------------
-- Consent + CS must survive accidental Auth deletion.
-- orders / payment_intents already reference auth.users with NO ACTION.
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_agreements
  DROP CONSTRAINT IF EXISTS user_agreements_user_id_fkey;

ALTER TABLE public.user_agreements
  ADD CONSTRAINT user_agreements_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users (id)
  ON DELETE RESTRICT;

ALTER TABLE public.cs_inquiries
  DROP CONSTRAINT IF EXISTS cs_inquiries_user_id_fkey;

ALTER TABLE public.cs_inquiries
  ADD CONSTRAINT cs_inquiries_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users (id)
  ON DELETE RESTRICT;

COMMENT ON CONSTRAINT user_agreements_user_id_fkey ON public.user_agreements IS
  'NEW4-7: consent evidence must not CASCADE away if Auth is deleted.';

COMMENT ON CONSTRAINT cs_inquiries_user_id_fkey ON public.cs_inquiries IS
  'NEW4-7: CS/dispute records must not CASCADE away if Auth is deleted.';

-- ---------------------------------------------------------------------------
-- Withdrawal clock on the retained subject row (profiles.id = auth.users.id).
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz;

COMMENT ON COLUMN public.profiles.withdrawn_at IS
  'NEW4-7: set when admin-assisted (or later self-service) withdrawal completes. Null means the membership is not withdrawn. Not backfilled for historic users.';

CREATE INDEX IF NOT EXISTS profiles_withdrawn_at_idx
  ON public.profiles (withdrawn_at)
  WHERE withdrawn_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Durable withdrawal audit. No email/phone/address.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.account_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE RESTRICT,
  status text NOT NULL
    CHECK (status IN ('in_progress', 'withdrawn')),
  source text NOT NULL
    CHECK (source IN ('admin_assisted', 'self_service')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  actor_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  failure_reason_class text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_withdrawals_completed_ck CHECK (
    (status = 'withdrawn' AND completed_at IS NOT NULL)
    OR (status = 'in_progress' AND completed_at IS NULL)
  )
);

COMMENT ON TABLE public.account_withdrawals IS
  'NEW4-7 withdrawal audit. ACTIVE = no row / profiles.withdrawn_at null. IN PROGRESS / WITHDRAWN = status. No customer PII.';

ALTER TABLE public.account_withdrawals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.account_withdrawals FROM PUBLIC;
REVOKE ALL ON TABLE public.account_withdrawals FROM anon, authenticated;
GRANT ALL ON TABLE public.account_withdrawals TO service_role;

-- ---------------------------------------------------------------------------
-- Freeze withdrawn profiles for non-service_role. Preserve C1-0A privileged freeze.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profiles_guard_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.jwt() ->> 'role', '') = 'service_role'
     OR current_user IN ('postgres', 'supabase_admin', 'supabase_auth_admin')
     OR session_user IN ('postgres', 'supabase_admin', 'supabase_auth_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.is_admin := false;
    NEW.total_spent := 0;
    NEW.verified_phone_e164 := NULL;
    NEW.verified_phone_fingerprint := NULL;
    NEW.phone_verified_at := NULL;
    NEW.password_login_enabled := false;
    NEW.social_login_enabled := false;
    NEW.withdrawn_at := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.withdrawn_at IS NOT NULL THEN
      RAISE EXCEPTION 'withdrawn_profile_frozen' USING ERRCODE = '42501';
    END IF;
    NEW.is_admin := OLD.is_admin;
    NEW.total_spent := OLD.total_spent;
    IF OLD.user_custom_id IS NOT NULL THEN
      NEW.user_custom_id := OLD.user_custom_id;
    END IF;
    NEW.verified_phone_e164 := OLD.verified_phone_e164;
    NEW.verified_phone_fingerprint := OLD.verified_phone_fingerprint;
    NEW.phone_verified_at := OLD.phone_verified_at;
    NEW.password_login_enabled := OLD.password_login_enabled;
    NEW.social_login_enabled := OLD.social_login_enabled;
    NEW.withdrawn_at := OLD.withdrawn_at;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Withdrawn subjects cannot create new working-state or consent rows.
-- Admin/service_role may still update CS answers on retained dispute records.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_withdrawn_subject_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_role text;
BEGIN
  v_role := coalesce(auth.role(), '');
  IF v_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  v_uid := NEW.user_id;

  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = v_uid
      AND p.withdrawn_at IS NOT NULL
  ) THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'cs_inquiries'
     AND TG_OP = 'UPDATE'
     AND public.profiles_is_current_user_admin() THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'withdrawn_subject_frozen' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_cart_items_reject_withdrawn ON public.cart_items;
CREATE TRIGGER trg_cart_items_reject_withdrawn
  BEFORE INSERT OR UPDATE ON public.cart_items
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_withdrawn_subject_write();

DROP TRIGGER IF EXISTS trg_user_progress_reject_withdrawn ON public.user_progress;
CREATE TRIGGER trg_user_progress_reject_withdrawn
  BEFORE INSERT OR UPDATE ON public.user_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_withdrawn_subject_write();

DROP TRIGGER IF EXISTS trg_cs_inquiries_reject_withdrawn ON public.cs_inquiries;
CREATE TRIGGER trg_cs_inquiries_reject_withdrawn
  BEFORE INSERT OR UPDATE ON public.cs_inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_withdrawn_subject_write();

DROP TRIGGER IF EXISTS trg_user_agreements_reject_withdrawn ON public.user_agreements;
CREATE TRIGGER trg_user_agreements_reject_withdrawn
  BEFORE INSERT ON public.user_agreements
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_withdrawn_subject_write();

COMMIT;
