-- PAYMENT-TEST ONLY — NOT a durable production migration.
-- Unique verified-phone fingerprint for Slice A payment-test verification.
-- Production apply remains BLOCKED until Slice 0b.
-- Target ref: bvihpoorwriejybixmoc
-- Do NOT run against qifloweuwyhvukabgnoa.

CREATE UNIQUE INDEX IF NOT EXISTS profiles_verified_phone_fingerprint_uidx
  ON public.profiles (verified_phone_fingerprint)
  WHERE verified_phone_fingerprint IS NOT NULL;
