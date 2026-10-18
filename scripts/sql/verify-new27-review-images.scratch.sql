-- Disposable-local supplemental image RPC checks. Rolls back fixtures.
-- Does not record a concurrency pass.
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
     OR (SELECT count(*) FROM public.profiles) <> 0
     OR (SELECT count(*) FROM auth.users) <> 0 THEN
    RAISE EXCEPTION 'disposable image target is not independently authorized';
  END IF;
  IF to_regclass('public.review_image_cleanup_jobs') IS NULL THEN
    RAISE EXCEPTION 'supplemental image migration is absent';
  END IF;
END
$guard$;

DO $priv$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_class AS class
  CROSS JOIN LATERAL aclexplode(class.relacl) AS acl
  JOIN pg_roles AS role ON role.oid = acl.grantee
  WHERE class.oid = 'public.review_image_cleanup_jobs'::regclass
    AND role.rolname IN ('anon', 'authenticated', 'service_role', 'public');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'cleanup job table is granted to a client role';
  END IF;

  IF has_function_privilege('anon', 'public.prepare_review_image_attach(uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.prepare_review_image_attach(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.review_public_image_object_path(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.review_public_image_object_path(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.review_public_image_object_path(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.list_public_review_image_ids(uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'image function privileges drifted';
  END IF;
END
$priv$;

DO $cases$
DECLARE
  v_user uuid := '018c27d0-0000-4000-8000-000000000001';
  v_other uuid := '018c27d0-0000-4000-8000-000000000002';
  v_admin uuid := '018c27d0-0000-4000-8000-000000000003';
  v_product uuid := '018c27d0-0000-4000-8000-000000000010';
  v_order uuid := '018c27d0-0000-4000-8000-000000000021';
  v_item uuid := '018c27d0-0000-4000-8000-000000000031';
  v_item_shop uuid := '018c27d0-0000-4000-8000-000000000032';
  v_item_hide uuid := '018c27d0-0000-4000-8000-000000000033';
  v_review uuid;
  v_review_shop uuid;
  v_review_hide uuid;
  v_image uuid;
  v_count bigint;
  v_path text;
  v_bad text;
BEGIN
  INSERT INTO auth.users (id, email, aud, role, created_at, updated_at) VALUES
    (v_user, 'synthetic-image@example.invalid', 'authenticated', 'authenticated', now(), now()),
    (v_other, 'synthetic-image-other@example.invalid', 'authenticated', 'authenticated', now(), now()),
    (v_admin, 'synthetic-image-admin@example.invalid', 'authenticated', 'authenticated', now(), now());
  INSERT INTO public.profiles (id, is_admin) VALUES
    (v_user, false), (v_other, false), (v_admin, true);
  INSERT INTO public.products (
    id, title, subtitle, description, options, front_image,
    is_new, is_limited, is_sale, is_visible, display_order, supported_orientations
  ) VALUES (
    v_product, '[TEST] NEW27 image fixture', 'SYNTHETIC', 'Synthetic image fixture.',
    '[]'::jsonb, '/hero/spatial-room.webp', false, false, false, true, 0, '["portrait"]'::jsonb
  );
  INSERT INTO public.orders (id, user_id, order_number, status, total_price, completed_at, payment_finalized_at)
  VALUES (v_order, v_user, 'SYN-NEW27-IMAGE', 'COMPLETED', 100, now(), now());
  INSERT INTO public.order_items (id, order_id, product_id, product_title, quantity, price) VALUES
    (v_item, v_order, v_product, 'synthetic catalog line', 1, 100),
    (v_item_shop, v_order, NULL, 'synthetic workshop line', 1, 100),
    (v_item_hide, v_order, v_product, 'synthetic hide line', 1, 100);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM public.set_order_item_commerce_state(v_item, 'fulfilled');
  PERFORM public.set_order_item_commerce_state(v_item_shop, 'fulfilled');
  PERFORM public.set_order_item_commerce_state(v_item_hide, 'fulfilled');

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  v_review := public.create_review(v_item, 5, 'synthetic catalog review');
  v_review_shop := public.create_review(v_item_shop, 4, 'synthetic workshop review');
  v_review_hide := public.create_review(v_item_hide, 3, 'synthetic hide review');

  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_other::text, true);
    PERFORM public.prepare_review_image_attach(v_review);
    RAISE EXCEPTION 'non-owner prepare succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%review_not_owner%' THEN RAISE; END IF;
  END;

  UPDATE public.profiles SET withdrawn_at = now() WHERE id = v_other;
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_other::text, true);
    PERFORM public.prepare_review_image_attach(v_review);
    RAISE EXCEPTION 'withdrawn prepare succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%withdrawn_subject_frozen%' THEN RAISE; END IF;
  END;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  BEGIN
    PERFORM public.prepare_review_image_attach(v_review);
    RAISE EXCEPTION 'service role prepare succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%review_auth_required%' THEN RAISE; END IF;
  END;

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  BEGIN
    PERFORM public.attach_review_image(v_review, 'reviews/' || v_review::text || '/018c27d0-0000-4000-8000-0000000000c1.jpg', 'image/jpeg', 10);
    RAISE EXCEPTION 'authenticated attach succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%review_image_server_only%' THEN RAISE; END IF;
  END;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  BEGIN
    PERFORM public.attach_review_image(v_review, 'reviews/' || v_review::text || '/../secret.jpg', 'image/jpeg', 10);
    RAISE EXCEPTION 'traversal path was accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%review_image_not_allowed%'
       AND SQLERRM NOT LIKE '%review_images_object_path_check%' THEN
      RAISE;
    END IF;
  END;

  v_image := public.attach_review_image(
    v_review,
    'reviews/' || v_review::text || '/018c27d0-0000-4000-8000-0000000000c1.jpg',
    'image/jpeg',
    128
  );
  PERFORM public.attach_review_image(v_review_shop, 'reviews/' || v_review_shop::text || '/018c27d0-0000-4000-8000-0000000000c2.jpg', 'image/png', 128);
  PERFORM public.attach_review_image(v_review_hide, 'reviews/' || v_review_hide::text || '/018c27d0-0000-4000-8000-0000000000c3.jpg', 'image/webp', 128);

  PERFORM set_config('request.jwt.claim.role', 'anon', true);
  SELECT count(*) INTO v_count FROM public.list_public_review_image_ids(ARRAY[v_review, v_review_shop, v_review_hide]);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'pending images were public';
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM public.moderate_review(v_review, 'approve');
  PERFORM public.moderate_review(v_review_shop, 'approve');
  PERFORM public.moderate_review(v_review_hide, 'approve');

  PERFORM set_config('request.jwt.claim.role', 'anon', true);
  SELECT count(*) INTO v_count FROM public.list_public_review_image_ids(ARRAY[v_review]);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'approved catalog image was not public';
  END IF;
  SELECT count(*) INTO v_count FROM public.list_public_review_image_ids(ARRAY[v_review_shop]);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'workshop image was public';
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  v_path := public.review_public_image_object_path(v_image);
  IF v_path IS DISTINCT FROM 'reviews/' || v_review::text || '/018c27d0-0000-4000-8000-0000000000c1.jpg' THEN
    RAISE EXCEPTION 'catalog image path was not returned';
  END IF;
  IF v_path LIKE '%' || v_user::text || '%' OR v_path LIKE '%' || v_order::text || '%' THEN
    RAISE EXCEPTION 'public path exposed a customer or order id';
  END IF;
  SELECT public.review_public_image_object_path(img.id) INTO v_bad
  FROM public.review_images AS img
  WHERE img.review_id = v_review_shop;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'workshop image path was returned';
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'anon', true);
  BEGIN
    PERFORM public.review_public_image_object_path(v_image);
    RAISE EXCEPTION 'anon received a storage path';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%review_image_server_only%' THEN RAISE; END IF;
  END;

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM public.moderate_review(v_review_hide, 'hide');
  PERFORM set_config('request.jwt.claim.role', 'anon', true);
  SELECT count(*) INTO v_count FROM public.list_public_review_image_ids(ARRAY[v_review_hide]);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'hidden image remained public';
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM public.set_order_item_commerce_state(v_item, 'refunded');
  PERFORM set_config('request.jwt.claim.role', 'anon', true);
  SELECT count(*) INTO v_count FROM public.list_public_review_image_ids(ARRAY[v_review]);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'refunded image remained public';
  END IF;
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  IF public.review_public_image_object_path(v_image) IS NOT NULL THEN
    RAISE EXCEPTION 'refunded image path remained available';
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  IF coalesce(array_length(public.list_owned_review_image_paths(v_review), 1), 0) <> 1 THEN
    RAISE EXCEPTION 'owner could not list a private image path';
  END IF;
  UPDATE public.profiles SET withdrawn_at = NULL WHERE id = v_other;
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_other::text, true);
    PERFORM public.list_owned_review_image_paths(v_review);
    RAISE EXCEPTION 'non-owner listed image paths';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%review_not_owner%' THEN RAISE; END IF;
  END;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM public.queue_review_image_cleanup(v_review, ARRAY[
    'reviews/' || v_review::text || '/018c27d0-0000-4000-8000-0000000000c9.jpg',
    'reviews/' || v_review::text || '/../secret.jpg'
  ]);
  IF coalesce(array_length(public.list_review_image_cleanup_jobs(v_review), 1), 0) <> 1 THEN
    RAISE EXCEPTION 'cleanup queue accepted an unsafe path or dropped a valid path';
  END IF;
  PERFORM public.complete_review_image_cleanup(
    v_review,
    ARRAY['reviews/' || v_review::text || '/018c27d0-0000-4000-8000-0000000000c9.jpg']
  );
  IF coalesce(array_length(public.list_review_image_cleanup_jobs(v_review), 1), 0) <> 0 THEN
    RAISE EXCEPTION 'cleanup completion left a job';
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  BEGIN
    PERFORM public.queue_review_image_cleanup(v_review, ARRAY[
      'reviews/' || v_review::text || '/018c27d0-0000-4000-8000-0000000000d1.jpg'
    ]);
    RAISE EXCEPTION 'authenticated queue succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLSTATE IS DISTINCT FROM '42501' OR SQLERRM NOT LIKE '%review_image_server_only%' THEN RAISE; END IF;
    RAISE NOTICE 'cleanup unauthorized queue SQLSTATE %', SQLSTATE;
  END;
  BEGIN
    PERFORM public.list_review_image_cleanup_jobs(v_review);
    RAISE EXCEPTION 'authenticated cleanup list succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLSTATE IS DISTINCT FROM '42501' OR SQLERRM NOT LIKE '%review_image_server_only%' THEN RAISE; END IF;
    RAISE NOTICE 'cleanup unauthorized list SQLSTATE %', SQLSTATE;
  END;
  BEGIN
    PERFORM public.complete_review_image_cleanup(v_review, ARRAY[
      'reviews/' || v_review::text || '/018c27d0-0000-4000-8000-0000000000d1.jpg'
    ]);
    RAISE EXCEPTION 'authenticated cleanup completion succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLSTATE IS DISTINCT FROM '42501' OR SQLERRM NOT LIKE '%review_image_server_only%' THEN RAISE; END IF;
    RAISE NOTICE 'cleanup unauthorized complete SQLSTATE %', SQLSTATE;
  END;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  BEGIN
    PERFORM public.queue_review_image_cleanup(NULL, ARRAY[]::text[]);
    RAISE EXCEPTION 'null review queue succeeded';
  EXCEPTION WHEN check_violation THEN
    IF SQLSTATE IS DISTINCT FROM '23514' OR SQLERRM NOT LIKE '%review_image_not_allowed%' THEN RAISE; END IF;
    RAISE NOTICE 'cleanup null review SQLSTATE %', SQLSTATE;
  END;

  PERFORM public.queue_review_image_cleanup(v_review, ARRAY[
    'reviews/' || v_review_shop::text || '/018c27d0-0000-4000-8000-0000000000d2.jpg'
  ]);
  IF coalesce(array_length(public.list_review_image_cleanup_jobs(v_review), 1), 0) <> 0
     OR coalesce(array_length(public.list_review_image_cleanup_jobs(v_review_shop), 1), 0) <> 0 THEN
    RAISE EXCEPTION 'cross-review cleanup path was accepted';
  END IF;

  PERFORM public.queue_review_image_cleanup(v_review, ARRAY[
    'reviews/' || v_review::text || '/018c27d0-0000-4000-8000-0000000000d3.jpg'
  ]);
  PERFORM public.complete_review_image_cleanup(v_review_shop, ARRAY[
    'reviews/' || v_review::text || '/018c27d0-0000-4000-8000-0000000000d3.jpg'
  ]);
  IF coalesce(array_length(public.list_review_image_cleanup_jobs(v_review), 1), 0) <> 1 THEN
    RAISE EXCEPTION 'invalid completion removed another review job';
  END IF;
  PERFORM public.complete_review_image_cleanup(v_review, ARRAY[
    'reviews/' || v_review::text || '/018c27d0-0000-4000-8000-0000000000d3.jpg'
  ]);
  PERFORM public.complete_review_image_cleanup(v_review, ARRAY[
    'reviews/' || v_review::text || '/018c27d0-0000-4000-8000-0000000000d3.jpg'
  ]);
  IF coalesce(array_length(public.list_review_image_cleanup_jobs(v_review), 1), 0) <> 0 THEN
    RAISE EXCEPTION 'repeated completion left or restored a job';
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  PERFORM public.delete_review(v_review_hide);
  BEGIN
    PERFORM public.create_review(v_item_hide, 3, 'should not recreate');
    RAISE EXCEPTION 'deleted review entitlement was restored';
  EXCEPTION WHEN unique_violation THEN
    IF SQLSTATE IS DISTINCT FROM '23505' OR SQLERRM NOT LIKE '%review_entitlement_consumed%' THEN RAISE; END IF;
    RAISE NOTICE 'entitlement remains consumed SQLSTATE %', SQLSTATE;
  END;
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM public.queue_review_image_cleanup(v_review_hide, ARRAY[
    'reviews/' || v_review_hide::text || '/018c27d0-0000-4000-8000-0000000000d4.jpg'
  ]);
  IF coalesce(array_length(public.list_review_image_cleanup_jobs(v_review_hide), 1), 0) <> 1 THEN
    RAISE EXCEPTION 'tombstoned review could not queue cleanup';
  END IF;
  PERFORM public.complete_review_image_cleanup(v_review_hide, ARRAY[
    'reviews/' || v_review_hide::text || '/018c27d0-0000-4000-8000-0000000000d4.jpg'
  ]);
  IF coalesce(array_length(public.list_review_image_cleanup_jobs(v_review_hide), 1), 0) <> 0 THEN
    RAISE EXCEPTION 'tombstoned cleanup completion left a job';
  END IF;
END
$cases$;

ROLLBACK;
