-- =============================================================================
-- Metalora — READ-ONLY admin access operational queries (#20K)
-- =============================================================================
-- Every statement below is SELECT / WITH only.
-- Do NOT run UPDATE / INSERT / DELETE / ALTER from this file.
-- Do NOT grant, revoke, ban, or sign-out anyone from this pack.
-- NO AUTO-REPAIR.
--
-- Source of truth: public.profiles.is_admin (boolean, NOT NULL, default false).
-- No additional role tiers exist.
--
-- Privacy: no email, phone, name, address, tokens, or secrets in SELECT lists.
-- auth.users joins (B) require a SQL role that can SELECT auth.users
-- (typical: postgres). Email is used only in predicates if needed; this pack
-- does not project email.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A. Current admin roster
--
-- Purpose: inventory of profiles currently marked admin.
-- Healthy: a small, known set of rows. Unexpected extra rows = REVIEW/HIGH.
-- Severity: INFO when reviewing an expected roster; HIGH if an unknown id appears.
-- Operator: compare to the approved operator list (internal ids / user_custom_id).
--           NULL user_custom_id is an intentional admin-provisioned exception
--           (#16C-1 / AdminLogin does not require a member username).
-- SELECT-only / NO AUTO-REPAIR.
-- -----------------------------------------------------------------------------
SELECT
  p.id AS profile_id,
  p.user_custom_id,
  p.is_admin,
  p.updated_at
FROM public.profiles AS p
WHERE p.is_admin IS TRUE
ORDER BY p.updated_at DESC NULLS LAST, p.id;

-- -----------------------------------------------------------------------------
-- B. Admin profile without auth user
--
-- Purpose: detect is_admin rows whose auth identity is missing.
-- Schema: profiles.id FK → auth.users(id) ON DELETE CASCADE, so this should be
--         structurally rare. If rows appear, treat as HIGH.
-- Requires: SELECT on auth.users.
-- Healthy: zero rows.
-- Severity: HIGH.
-- Operator: inspect profile_id only; do not INSERT a fake auth user from SQL.
-- SELECT-only / NO AUTO-REPAIR.
-- -----------------------------------------------------------------------------
SELECT
  p.id AS profile_id,
  p.user_custom_id,
  p.is_admin,
  p.updated_at
FROM public.profiles AS p
WHERE p.is_admin IS TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM auth.users AS u
    WHERE u.id = p.id
  )
ORDER BY p.id;

-- -----------------------------------------------------------------------------
-- C. Privilege-column inconsistency
--
-- Purpose: is_admin is NOT NULL boolean. NULL leftover would be an impossible
--          state vs #16C-1. Duplicate-admin-by-id is prevented by profiles PK.
-- Healthy: zero rows.
-- Severity: HIGH if any row appears.
-- Operator: inspect profile_id; do not invent a second role system.
--           Duplicate usernames are structurally prevented (#20J-5 note) and
--           are not an admin-privilege duplicate.
-- SELECT-only / NO AUTO-REPAIR.
-- -----------------------------------------------------------------------------
SELECT
  p.id AS profile_id,
  p.user_custom_id,
  p.updated_at
FROM public.profiles AS p
WHERE p.is_admin IS NULL
ORDER BY p.id;

-- -----------------------------------------------------------------------------
-- D. Unusable-admin structural check (do not flag intentional NULL username)
--
-- Purpose: AdminLogin / ProtectedRoute(requireAdmin) require a profile row with
--          is_admin IS TRUE. They do NOT require user_custom_id
--          (isUsableMemberProfile is for member checkout, not admin).
--          Therefore NULL user_custom_id admins are NOT anomalies.
--          This query only flags blank (non-null empty) usernames, which the
--          format CHECK should already reject.
-- Healthy: zero rows.
-- Severity: REVIEW.
-- Operator: do not rewrite user_custom_id here.
-- SELECT-only / NO AUTO-REPAIR.
-- -----------------------------------------------------------------------------
SELECT
  p.id AS profile_id,
  p.updated_at
FROM public.profiles AS p
WHERE p.is_admin IS TRUE
  AND p.user_custom_id IS NOT NULL
  AND btrim(p.user_custom_id) = ''
ORDER BY p.id;

-- -----------------------------------------------------------------------------
-- E. Admin count summary
--
-- Purpose: periodic review count.
-- Healthy: matches the approved operator count (usually very small).
-- Severity: INFO; unexpected increase = REVIEW immediately.
-- Operator: if count changes without an approved grant/revoke, run A + B.
-- SELECT-only / NO AUTO-REPAIR.
-- -----------------------------------------------------------------------------
SELECT
  COUNT(*) FILTER (WHERE p.is_admin IS TRUE) AS admin_count,
  COUNT(*) AS profile_count
FROM public.profiles AS p;

-- -----------------------------------------------------------------------------
-- F. Recent admin-row updated_at (NOT an audit log)
--
-- Purpose: current-row metadata only. profiles.updated_at is overwritten on
--          some profile edits and is NOT a history of is_admin changes.
--          Privilege-only UPDATEs may not even set updated_at.
--          This is NOT a durable audit trail.
-- Healthy: only expected ids in the window; no claim of completeness.
-- Severity: INFO / REVIEW.
-- Operator: treat as a hint to re-run roster A, not as proof of who changed
--           is_admin. Cloud Run logs do not record Dashboard/SQL privilege DML.
-- SELECT-only / NO AUTO-REPAIR.
-- -----------------------------------------------------------------------------
SELECT
  p.id AS profile_id,
  p.user_custom_id,
  p.is_admin,
  p.updated_at
FROM public.profiles AS p
WHERE p.is_admin IS TRUE
  AND p.updated_at IS NOT NULL
  AND p.updated_at >= now() - interval '30 days'
ORDER BY p.updated_at DESC, p.id;
