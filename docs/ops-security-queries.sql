-- =============================================================================
-- Metalora — READ-ONLY security maintenance queries (#20L)
-- =============================================================================
-- Catalog / information_schema reads only.
-- Do NOT INSERT / UPDATE / DELETE / GRANT / REVOKE / ALTER / DROP / CREATE.
-- Do NOT mutate RLS, secrets, sessions, or users.
-- NO AUTO-REPAIR. Findings are inventory for a separately approved ticket.
--
-- Does not project secrets, tokens, PII, or function source.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A. Public base tables with RLS disabled
--
-- PURPOSE: application tables in public should have RLS enabled (#16).
-- Expected app tables (live extract): banners, cart_items, collections,
--   cs_inquiries, order_items, orders, payment_intents, products, profiles,
--   site_settings, user_agreements, user_progress.
-- HEALTHY: zero rows for those tables. Any new public table without RLS = REVIEW.
-- SEVERITY: HIGH if a commerce/auth table appears; REVIEW otherwise.
-- OPERATOR: compare to last month's inventory; do not ENABLE RLS from this pack.
-- SELECT-only / NO AUTO-REPAIR.
-- -----------------------------------------------------------------------------
SELECT
  n.nspname AS table_schema,
  c.relname AS table_name
FROM pg_catalog.pg_class AS c
INNER JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND NOT c.relrowsecurity
ORDER BY c.relname;

-- -----------------------------------------------------------------------------
-- B. Public-schema RLS policy inventory
--
-- PURPOSE: snapshot of policy name / command / roles / permissive flag.
-- HEALTHY: matches the last accepted inventory (see generated live extract).
--          Duplicate overlapping product SELECT policies are a known historic
--          pattern — REVIEW if NEW unexpected names appear.
-- SEVERITY: INFO for scheduled compare; REVIEW on unexpected add/drop.
-- OPERATOR: save the result set; do not DROP/CREATE policies here.
-- SELECT-only / NO AUTO-REPAIR.
-- -----------------------------------------------------------------------------
SELECT
  n.nspname AS table_schema,
  c.relname AS table_name,
  pol.polname AS policy_name,
  CASE pol.polcmd
    WHEN 'r' THEN 'SELECT'
    WHEN 'a' THEN 'INSERT'
    WHEN 'w' THEN 'UPDATE'
    WHEN 'd' THEN 'DELETE'
    WHEN '*' THEN 'ALL'
    ELSE pol.polcmd::text
  END AS command,
  CASE WHEN pol.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END AS policy_type,
  COALESCE(
    NULLIF(
      ARRAY(
        SELECT r.rolname
        FROM pg_catalog.pg_roles AS r
        WHERE r.oid = ANY (pol.polroles)
        ORDER BY r.rolname
      )::text,
      '{}'
    ),
    '{public}'
  ) AS roles
FROM pg_catalog.pg_policy AS pol
INNER JOIN pg_catalog.pg_class AS c ON c.oid = pol.polrelid
INNER JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
ORDER BY c.relname, pol.polname;

-- -----------------------------------------------------------------------------
-- C. Broad-role (anon / PUBLIC) policy review
--
-- PURPOSE: list policies that apply to PUBLIC (empty polroles) or role anon.
--          Not automatically wrong: catalog SELECT on products / active banners /
--          site_settings, and some own-row policies TO public USING auth.uid(),
--          exist in the current closed model.
-- HEALTHY: only expected names vs last snapshot. NEW broad-role policies = REVIEW.
-- SEVERITY: REVIEW (do not page solely because a public SELECT exists).
-- OPERATOR: compare to #16 closed contracts; do not weaken or drop policies here.
-- SELECT-only / NO AUTO-REPAIR.
-- -----------------------------------------------------------------------------
SELECT
  n.nspname AS table_schema,
  c.relname AS table_name,
  pol.polname AS policy_name,
  CASE pol.polcmd
    WHEN 'r' THEN 'SELECT'
    WHEN 'a' THEN 'INSERT'
    WHEN 'w' THEN 'UPDATE'
    WHEN 'd' THEN 'DELETE'
    WHEN '*' THEN 'ALL'
    ELSE pol.polcmd::text
  END AS command,
  CASE WHEN pol.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END AS policy_type
FROM pg_catalog.pg_policy AS pol
INNER JOIN pg_catalog.pg_class AS c ON c.oid = pol.polrelid
INNER JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND (
    pol.polroles = '{}'::oid[]
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles AS r
      WHERE r.oid = ANY (pol.polroles)
        AND r.rolname IN ('anon', 'public')
    )
  )
ORDER BY c.relname, pol.polname;

-- -----------------------------------------------------------------------------
-- D. Privileged profile-field guard
--
-- PURPOSE: confirm trg_profiles_guard_privileged_fields exists and is enabled
--          on public.profiles (#16A-0 / #16C-1). Function is SECURITY INVOKER;
--          service_role JWT is the only actor that may change is_admin.
-- HEALTHY: exactly one non-internal trigger, tgenabled in ('O', 'A'),
--          function public.profiles_guard_privileged_fields present.
-- SEVERITY: HIGH if missing or disabled.
-- OPERATOR: do not DROP/disable the trigger from this pack.
-- SELECT-only / NO AUTO-REPAIR.
-- -----------------------------------------------------------------------------
SELECT
  n.nspname AS table_schema,
  c.relname AS table_name,
  t.tgname AS trigger_name,
  t.tgenabled AS trigger_enabled,
  p.proname AS function_name,
  p.prosecdef AS function_security_definer
FROM pg_catalog.pg_trigger AS t
INNER JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid
INNER JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
INNER JOIN pg_catalog.pg_proc AS p ON p.oid = t.tgfoid
WHERE n.nspname = 'public'
  AND c.relname = 'profiles'
  AND t.tgname = 'trg_profiles_guard_privileged_fields'
  AND NOT t.tgisinternal;

-- -----------------------------------------------------------------------------
-- E. SECURITY DEFINER function inventory (public)
--
-- PURPOSE: list public functions that run as definer. Known from migrations:
--          finalize_paid_order, handle_new_user, profiles_username_exists,
--          profiles_is_current_user_admin (and 16C-1 replacements).
-- HEALTHY: only expected names; no surprise definer functions.
-- SEVERITY: REVIEW inventory (not automatic vulnerability).
-- OPERATOR: new names need a ticket; do not ALTER functions here.
--          Function source is intentionally not selected.
-- SELECT-only / NO AUTO-REPAIR.
-- -----------------------------------------------------------------------------
SELECT
  n.nspname AS function_schema,
  p.proname AS function_name,
  pg_catalog.pg_get_userbyid(p.proowner) AS owner,
  p.prosecdef AS security_definer
FROM pg_catalog.pg_proc AS p
INNER JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef IS TRUE
ORDER BY p.proname;

-- -----------------------------------------------------------------------------
-- F. SECURITY DEFINER search_path / proconfig review
--
-- PURPOSE: definer functions should set a tight search_path (migrations use
--          pg_catalog, pg_temp or empty). NULL proconfig = REVIEW.
-- HEALTHY: expected functions have a configured search_path.
-- SEVERITY: REVIEW (do not invent CVEs from a missing setting alone).
-- OPERATOR: compare to migration SET search_path; no ALTER here.
-- SELECT-only / NO AUTO-REPAIR.
-- -----------------------------------------------------------------------------
SELECT
  n.nspname AS function_schema,
  p.proname AS function_name,
  p.proconfig AS proconfig
FROM pg_catalog.pg_proc AS p
INNER JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef IS TRUE
ORDER BY p.proname;

-- -----------------------------------------------------------------------------
-- G. Storage policy inventory (if storage schema is visible)
--
-- PURPOSE: list storage.objects (and other storage) RLS policies when the
--          operator role can see schema storage. Empty result may mean no
--          policies OR no catalog visibility — do not conclude "secure" or
--          "insecure" from count alone. Storage object backup is still #20E/#20F.
-- HEALTHY: unchanged vs last snapshot.
-- SEVERITY: REVIEW.
-- OPERATOR: compare names only; no policy mutation.
-- SELECT-only / NO AUTO-REPAIR.
-- -----------------------------------------------------------------------------
SELECT
  n.nspname AS table_schema,
  c.relname AS table_name,
  pol.polname AS policy_name,
  CASE pol.polcmd
    WHEN 'r' THEN 'SELECT'
    WHEN 'a' THEN 'INSERT'
    WHEN 'w' THEN 'UPDATE'
    WHEN 'd' THEN 'DELETE'
    WHEN '*' THEN 'ALL'
    ELSE pol.polcmd::text
  END AS command,
  CASE WHEN pol.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END AS policy_type
FROM pg_catalog.pg_policy AS pol
INNER JOIN pg_catalog.pg_class AS c ON c.oid = pol.polrelid
INNER JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'storage'
ORDER BY c.relname, pol.polname;

-- -----------------------------------------------------------------------------
-- H. Expected critical objects (closed #16 / #18 contracts)
--
-- PURPOSE: boolean presence of privileged-guard function, finalize RPC, and
--          payment_intents relation. Signature matches 18A-1.
-- HEALTHY: all three true.
-- SEVERITY: HIGH if any is false.
-- OPERATOR: do not CREATE from this pack; open a schema ticket if missing.
-- SELECT-only / NO AUTO-REPAIR.
-- -----------------------------------------------------------------------------
SELECT
  to_regprocedure(
    'public.profiles_guard_privileged_fields()'
  ) IS NOT NULL AS privileged_guard_function_present,
  to_regprocedure(
    'public.finalize_paid_order(uuid, text, text, numeric, numeric, text, text, text, text, text, jsonb, jsonb, jsonb)'
  ) IS NOT NULL AS finalize_paid_order_present,
  to_regclass('public.payment_intents') IS NOT NULL AS payment_intents_present;
