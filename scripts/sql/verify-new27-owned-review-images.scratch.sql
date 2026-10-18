-- Disposable-local checks for list_owned_review_images(uuid, uuid). Rolls back fixtures.
BEGIN;

DO $guard$
BEGIN
  IF current_database() IS DISTINCT FROM 'metalora_new27_disposable'
     OR inet_server_port() IS DISTINCT FROM 54329
     OR host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1'
     OR lower(replace(current_setting('data_directory'), E'\\', '/'))
        IS DISTINCT FROM 'c:/users/admin/desktop/metalora-new27-disposable-pg'
     OR current_setting('listen_addresses') IS DISTINCT FROM '127.0.0.1'
     OR split_part(current_setting('server_version'), '.', 1) IS DISTINCT FROM '14'
     OR (SELECT count(*) FROM pg_foreign_server) <> 0
     OR (SELECT count(*) FROM public.orders) <> 0
     OR (SELECT count(*) FROM public.reviews) <> 0
     OR (SELECT count(*) FROM auth.users) <> 0 THEN
    RAISE EXCEPTION 'disposable owner-image target is not independently authorized';
  END IF;
END
$guard$;

DO $catalog$
DECLARE
  v_args text;
  v_owner name;
  v_definer boolean;
  v_config text[];
  v_overloads integer;
  v_table_grants integer;
BEGIN
  SELECT count(*) INTO v_overloads
  FROM pg_proc AS proc
  JOIN pg_namespace AS ns ON ns.oid = proc.pronamespace
  WHERE ns.nspname = 'public' AND proc.proname = 'list_owned_review_images';
  IF v_overloads IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'owner image function overload count is %', v_overloads;
  END IF;

  SELECT pg_get_function_identity_arguments(proc.oid), pg_get_userbyid(proc.proowner), proc.prosecdef, proc.proconfig
    INTO v_args, v_owner, v_definer, v_config
  FROM pg_proc AS proc
  JOIN pg_namespace AS ns ON ns.oid = proc.pronamespace
  WHERE ns.nspname = 'public' AND proc.proname = 'list_owned_review_images';
  IF v_args IS DISTINCT FROM 'p_review_id uuid, p_user_id uuid'
     OR v_owner IS DISTINCT FROM 'postgres'
     OR v_definer IS NOT TRUE
     OR v_config::text NOT LIKE '%search_path=pg_catalog, pg_temp%' THEN
    RAISE EXCEPTION 'owner image function contract drifted: % % % %', v_args, v_owner, v_definer, v_config;
  END IF;

  IF has_function_privilege('public', 'public.list_owned_review_images(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.list_owned_review_images(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.list_owned_review_images(uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.list_owned_review_images(uuid,uuid)', 'EXECUTE')
     OR (SELECT rolsuper FROM pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'owner image execute privileges drifted';
  END IF;

  SELECT count(*) INTO v_table_grants
  FROM pg_class AS class
  CROSS JOIN LATERAL aclexplode(class.relacl) AS acl
  JOIN pg_roles AS role ON role.oid = acl.grantee
  WHERE class.oid IN ('public.reviews'::regclass, 'public.review_images'::regclass)
    AND role.rolname IN ('anon', 'authenticated', 'service_role', 'public');
  IF v_table_grants <> 0 THEN
    RAISE EXCEPTION 'review table privileges were introduced';
  END IF;
END
$catalog$;

DO $roles$
BEGIN
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM 1 FROM public.list_owned_review_images(
      '018c27d2-0000-4000-8000-000000000099',
      '018c27d2-0000-4000-8000-000000000001'
    );
    RAISE EXCEPTION 'anon executed list_owned_review_images';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLSTATE IS DISTINCT FROM '42501' THEN RAISE; END IF;
    RAISE NOTICE 'anon denial SQLSTATE % message %', SQLSTATE, SQLERRM;
  END;
  EXECUTE 'SET LOCAL ROLE NONE';

  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM 1 FROM public.list_owned_review_images(
      '018c27d2-0000-4000-8000-000000000099',
      '018c27d2-0000-4000-8000-000000000001'
    );
    RAISE EXCEPTION 'authenticated executed list_owned_review_images';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLSTATE IS DISTINCT FROM '42501' THEN RAISE; END IF;
    RAISE NOTICE 'authenticated denial SQLSTATE % message %', SQLSTATE, SQLERRM;
  END;
  EXECUTE 'SET LOCAL ROLE NONE';
END
$roles$;

DO $cases$
DECLARE
  v_user uuid := '018c27d2-0000-4000-8000-000000000001';
  v_other uuid := '018c27d2-0000-4000-8000-000000000002';
  v_product uuid := '018c27d2-0000-4000-8000-000000000010';
  v_order uuid := '018c27d2-0000-4000-8000-000000000021';
  v_order_other uuid := '018c27d2-0000-4000-8000-000000000022';
  v_item uuid := '018c27d2-0000-4000-8000-000000000031';
  v_item_empty uuid := '018c27d2-0000-4000-8000-000000000032';
  v_item_other uuid := '018c27d2-0000-4000-8000-000000000033';
  v_review uuid;
  v_review_empty uuid;
  v_review_other uuid;
  v_image uuid;
  v_path text;
  v_count bigint;
  v_missing uuid := '018c27d2-0000-4000-8000-000000000099';
BEGIN
  INSERT INTO auth.users (id, email, aud, role, created_at, updated_at) VALUES
    (v_user, 'synthetic-owned-a@example.invalid', 'authenticated', 'authenticated', now(), now()),
    (v_other, 'synthetic-owned-b@example.invalid', 'authenticated', 'authenticated', now(), now());
  INSERT INTO public.profiles (id, is_admin) VALUES (v_user, false), (v_other, false);
  INSERT INTO public.products (
    id, title, subtitle, description, options, front_image,
    is_new, is_limited, is_sale, is_visible, display_order, supported_orientations
  ) VALUES (
    v_product, '[TEST] NEW27 owned image', 'SYNTHETIC', 'Synthetic owned-image fixture.',
    '[]'::jsonb, '/hero/spatial-room.webp', false, false, false, true, 0, '["portrait"]'::jsonb
  );
  INSERT INTO public.orders (id, user_id, order_number, status, total_price, completed_at, payment_finalized_at)
  VALUES
    (v_order, v_user, 'SYN-NEW27-OWNED', 'COMPLETED', 100, now(), now()),
    (v_order_other, v_other, 'SYN-NEW27-OWNED-B', 'COMPLETED', 100, now(), now());
  INSERT INTO public.order_items (id, order_id, product_id, product_title, quantity, price) VALUES
    (v_item, v_order, v_product, 'synthetic owned line', 1, 100),
    (v_item_empty, v_order, v_product, 'synthetic empty line', 1, 100),
    (v_item_other, v_order_other, v_product, 'synthetic other line', 1, 100);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM public.set_order_item_commerce_state(v_item, 'fulfilled');
  PERFORM public.set_order_item_commerce_state(v_item_empty, 'fulfilled');
  PERFORM public.set_order_item_commerce_state(v_item_other, 'fulfilled');
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  v_review := public.create_review(v_item, 5, 'synthetic owned review');
  v_review_empty := public.create_review(v_item_empty, 4, 'synthetic empty review');
  PERFORM set_config('request.jwt.claim.sub', v_other::text, true);
  v_review_other := public.create_review(v_item_other, 3, 'synthetic other review');
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  v_image := public.attach_review_image(
    v_review,
    'reviews/' || v_review::text || '/018c27d2-0000-4000-8000-0000000000c1.jpg',
    'image/jpeg',
    128
  );
  PERFORM public.attach_review_image(
    v_review_other,
    'reviews/' || v_review_other::text || '/018c27d2-0000-4000-8000-0000000000c2.jpg',
    'image/jpeg',
    128
  );

  EXECUTE 'SET LOCAL ROLE service_role';
  SELECT img.image_id, img.object_path INTO v_image, v_path
  FROM public.list_owned_review_images(v_review, v_user) AS img;
  IF v_path IS DISTINCT FROM 'reviews/' || v_review::text || '/018c27d2-0000-4000-8000-0000000000c1.jpg' THEN
    RAISE EXCEPTION 'owner read did not return the review image';
  END IF;
  IF v_path NOT LIKE 'reviews/' || v_review::text || '/%' THEN
    RAISE EXCEPTION 'returned path is not isolated to the requested review';
  END IF;
  RAISE NOTICE 'owner read returned image %', v_image;

  SELECT count(*) INTO v_count
  FROM public.list_owned_review_images(v_review, v_user) AS img
  WHERE img.object_path LIKE 'reviews/' || v_review_other::text || '/%';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'owner read returned another review path';
  END IF;

  SELECT count(*) INTO v_count FROM public.list_owned_review_images(v_review_empty, v_user);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'empty owned review returned images';
  END IF;
  RAISE NOTICE 'empty owned review returned % rows', v_count;

  BEGIN
    PERFORM 1 FROM public.list_owned_review_images(v_review, v_other);
    RAISE EXCEPTION 'cross-customer read succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLSTATE IS DISTINCT FROM '42501' OR SQLERRM NOT LIKE '%review_not_owner%' THEN RAISE; END IF;
    RAISE NOTICE 'cross-customer SQLSTATE % message %', SQLSTATE, SQLERRM;
  END;

  BEGIN
    PERFORM 1 FROM public.list_owned_review_images(v_missing, v_user);
    RAISE EXCEPTION 'missing review read succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLSTATE IS DISTINCT FROM '42501' OR SQLERRM NOT LIKE '%review_not_owner%' THEN RAISE; END IF;
    RAISE NOTICE 'missing review SQLSTATE % message %', SQLSTATE, SQLERRM;
  END;

  BEGIN
    PERFORM 1 FROM public.list_owned_review_images(v_review, NULL);
    RAISE EXCEPTION 'null user read succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLSTATE IS DISTINCT FROM '42501' OR SQLERRM NOT LIKE '%review_not_owner%' THEN RAISE; END IF;
    RAISE NOTICE 'null user SQLSTATE % message %', SQLSTATE, SQLERRM;
  END;

  EXECUTE 'SET LOCAL ROLE NONE';
  UPDATE public.profiles SET withdrawn_at = now() WHERE id = v_user;
  EXECUTE 'SET LOCAL ROLE service_role';
  BEGIN
    PERFORM 1 FROM public.list_owned_review_images(v_review, v_user);
    RAISE EXCEPTION 'withdrawn owner read succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLSTATE IS DISTINCT FROM '42501' OR SQLERRM NOT LIKE '%withdrawn_subject_frozen%' THEN RAISE; END IF;
    RAISE NOTICE 'withdrawn owner SQLSTATE % message %', SQLSTATE, SQLERRM;
  END;
  EXECUTE 'SET LOCAL ROLE NONE';
END
$cases$;

ROLLBACK;
