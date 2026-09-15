-- #18C-1 — READ-ONLY verification of metalora-payment-test schema.
-- SELECT / jsonb only. Do not run against production from the bootstrap script.
-- Do not INSERT / UPDATE / DELETE / ALTER.

SELECT jsonb_build_object(
  'tables', jsonb_build_object(
    'profiles', to_regclass('public.profiles') IS NOT NULL,
    'products', to_regclass('public.products') IS NOT NULL,
    'cart_items', to_regclass('public.cart_items') IS NOT NULL,
    'orders', to_regclass('public.orders') IS NOT NULL,
    'order_items', to_regclass('public.order_items') IS NOT NULL,
    'payment_intents', to_regclass('public.payment_intents') IS NOT NULL
  ),
  'columns', jsonb_build_object(
    'orders.payment_finalized_at', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'payment_finalized_at'
    ),
    'products.options', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'options'
    ),
    'profiles.user_custom_id', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'user_custom_id'
    )
  ),
  'indexes', jsonb_build_object(
    'profiles_user_custom_id_lower_uidx', EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = 'profiles_user_custom_id_lower_uidx'
    )
  ),
  'functions', jsonb_build_object(
    'finalize_paid_order', EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'finalize_paid_order'
    ),
    'profiles_username_exists', EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'profiles_username_exists'
    ),
    'profiles_guard_privileged_fields', EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'profiles_guard_privileged_fields'
    ),
    'handle_new_user', EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'handle_new_user'
    ),
    'profiles_is_current_user_admin', EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'profiles_is_current_user_admin'
    )
  ),
  'triggers', jsonb_build_object(
    'trg_profiles_guard_privileged_fields', EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'profiles'
        AND NOT t.tgisinternal
        AND t.tgname = 'trg_profiles_guard_privileged_fields'
    ),
    'on_auth_user_created', EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_proc p ON p.oid = t.tgfoid
      JOIN pg_namespace pn ON pn.oid = p.pronamespace
      WHERE n.nspname = 'auth' AND c.relname = 'users'
        AND NOT t.tgisinternal
        AND t.tgname = 'on_auth_user_created'
        AND pn.nspname = 'public'
        AND p.proname = 'handle_new_user'
    )
  ),
  'rls_enabled', jsonb_build_object(
    'profiles', COALESCE((
      SELECT c.relrowsecurity FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'profiles'
    ), false),
    'orders', COALESCE((
      SELECT c.relrowsecurity FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'orders'
    ), false),
    'order_items', COALESCE((
      SELECT c.relrowsecurity FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'order_items'
    ), false),
    'payment_intents', COALESCE((
      SELECT c.relrowsecurity FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'payment_intents'
    ), false)
  ),
  'profile_policies', COALESCE((
    SELECT jsonb_agg(policyname ORDER BY policyname)
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
  ), '[]'::jsonb),
  'payment_intents_grants', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('grantee', grantee, 'privilege', privilege_type) ORDER BY grantee, privilege_type)
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'payment_intents'
  ), '[]'::jsonb),
  'row_counts', jsonb_build_object(
    'profiles', CASE WHEN to_regclass('public.profiles') IS NULL THEN NULL ELSE (SELECT count(*)::int FROM public.profiles) END,
    'products', CASE WHEN to_regclass('public.products') IS NULL THEN NULL ELSE (SELECT count(*)::int FROM public.products) END,
    'cart_items', CASE WHEN to_regclass('public.cart_items') IS NULL THEN NULL ELSE (SELECT count(*)::int FROM public.cart_items) END,
    'orders', CASE WHEN to_regclass('public.orders') IS NULL THEN NULL ELSE (SELECT count(*)::int FROM public.orders) END,
    'order_items', CASE WHEN to_regclass('public.order_items') IS NULL THEN NULL ELSE (SELECT count(*)::int FROM public.order_items) END,
    'payment_intents', CASE WHEN to_regclass('public.payment_intents') IS NULL THEN NULL ELSE (SELECT count(*)::int FROM public.payment_intents) END
  )
) AS payment_test_schema;
