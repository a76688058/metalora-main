-- NEW 2F Slice A1 — Verified account-phone columns + privileged-field freeze
-- Durable shared migration. Does NOT create a unique fingerprint index
-- (production uniqueness remains blocked on Slice 0b).
-- Apply to payment-test (bvihpoorwriejybixmoc) from the Slice A ticket.
-- Do not apply uniqueness to production (qifloweuwyhvukabgnoa) in this ticket.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verified_phone_e164 text,
  ADD COLUMN IF NOT EXISTS verified_phone_fingerprint text,
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_verified_phone_e164_format;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_verified_phone_e164_format
  CHECK (
    verified_phone_e164 IS NULL
    OR verified_phone_e164 ~ '^\+82(10[0-9]{8}|1[16789][0-9]{7,8})$'
  );

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_verified_phone_fingerprint_format;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_verified_phone_fingerprint_format
  CHECK (
    verified_phone_fingerprint IS NULL
    OR verified_phone_fingerprint ~ '^[0-9a-f]{64}$'
  );

COMMENT ON COLUMN public.profiles.verified_phone_e164 IS
  'OTP-verified account/recovery phone, canonical KR E.164. Not contact/shipping phone_number.';

COMMENT ON COLUMN public.profiles.verified_phone_fingerprint IS
  'Stable HMAC-SHA256(PHONE_IDENTITY_KEY, e164) uniqueness fingerprint. Server-only identity key.';

COMMENT ON COLUMN public.profiles.phone_verified_at IS
  'Set only by trusted phone-bind authority after OTP proof.';

CREATE OR REPLACE FUNCTION public.profiles_guard_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.jwt() ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.is_admin := false;
    NEW.total_spent := 0;
    NEW.verified_phone_e164 := NULL;
    NEW.verified_phone_fingerprint := NULL;
    NEW.phone_verified_at := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.is_admin := OLD.is_admin;
    NEW.total_spent := OLD.total_spent;
    IF OLD.user_custom_id IS NOT NULL THEN
      NEW.user_custom_id := OLD.user_custom_id;
    END IF;
    NEW.verified_phone_e164 := OLD.verified_phone_e164;
    NEW.verified_phone_fingerprint := OLD.verified_phone_fingerprint;
    NEW.phone_verified_at := OLD.phone_verified_at;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.profiles_guard_privileged_fields() IS
  'Freeze is_admin, total_spent, user_custom_id (once set), and verified-phone authority for non-service_role.';

COMMIT;
