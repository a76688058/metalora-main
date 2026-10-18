-- Disposable-local checks for remove_owned_review_image. Rolls back fixtures.
BEGIN;

DO $guard$
BEGIN
  IF current_database() IS DISTINCT FROM 'metalora_new27_disposable'
     OR inet_server_port() IS DISTINCT FROM 54329
     OR host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1'
     OR lower(replace(current_setting('data_directory'), E'\\', '/'))
        IS DISTINCT FROM 'c:/users/admin/desktop/metalora-new27-disposable-pg'
     OR current_setting('listen_addresses') IS DISTINCT FROM '127.0.0.1'
     OR current_setting('server_version') IS DISTINCT FROM '14.24'
     OR (SELECT count(*) FROM pg_foreign_server) <> 0
     OR to_regprocedure('public.remove_owned_review_image(uuid,uuid,uuid)') IS NULL
     OR (SELECT count(*) FROM public.orders) <> 0
     OR (SELECT count(*) FROM public.reviews) <> 0
     OR (SELECT count(*) FROM auth.users) <> 0
     OR (SELECT count(*) FROM public.site_settings) <> 1 THEN
    RAISE EXCEPTION 'disposable individual-delete target is not independently authorized';
  END IF;
END
$guard$;

DO $catalog$
DECLARE
  v_args text;
  v_owner name;
  v_definer boolean;
  v_config text[];
  v_src text;
  v_grants integer;
BEGIN
  SELECT pg_get_function_identity_arguments(proc.oid), pg_get_userbyid(proc.proowner),
         proc.prosecdef, proc.proconfig, proc.prosrc
    INTO v_args, v_owner, v_definer, v_config, v_src
  FROM pg_proc AS proc
  JOIN pg_namespace AS ns ON ns.oid = proc.pronamespace
  WHERE ns.nspname = 'public' AND proc.proname = 'remove_owned_review_image';
  IF v_args IS DISTINCT FROM 'p_review_id uuid, p_image_id uuid, p_user_id uuid'
     OR v_owner IS DISTINCT FROM 'postgres'
     OR v_definer IS NOT TRUE
     OR v_config::text NOT LIKE '%search_path=pg_catalog, pg_temp%'
     OR v_src NOT LIKE '%FOR UPDATE%'
     OR v_src LIKE '%delete_review%'
     OR v_src LIKE '%UPDATE public.reviews%' THEN
    RAISE EXCEPTION 'remove function contract drifted: % % % %', v_args, v_owner, v_definer, v_config;
  END IF;
  IF has_function_privilege('public', 'public.remove_owned_review_image(uuid,uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.remove_owned_review_image(uuid,uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.remove_owned_review_image(uuid,uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.remove_owned_review_image(uuid,uuid,uuid)', 'EXECUTE')
     OR (SELECT rolsuper FROM pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'remove function privileges drifted';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.review_image_removals'::regclass) THEN
    RAISE EXCEPTION 'removal receipt table is missing row security';
  END IF;
  SELECT count(*) INTO v_grants
  FROM pg_class AS class
  CROSS JOIN LATERAL aclexplode(class.relacl) AS acl
  JOIN pg_roles AS role ON role.oid = acl.grantee
  WHERE class.oid IN ('public.review_image_removals'::regclass, 'public.reviews'::regclass, 'public.review_images'::regclass)
    AND role.rolname IN ('anon', 'authenticated', 'service_role', 'public');
  IF v_grants <> 0 THEN
    RAISE EXCEPTION 'review table privileges were introduced';
  END IF;
END
$catalog$;

DO $roles$
BEGIN
  PERFORM set_config('request.jwt.claim.role', '', true);
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM 1 FROM public.remove_owned_review_image(
      '018c27e1-0000-4000-8000-000000000099',
      '018c27e1-0000-4000-8000-000000000098',
      '018c27e1-0000-4000-8000-000000000001'
    );
    RAISE EXCEPTION 'anon executed remove_owned_review_image';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLSTATE IS DISTINCT FROM '42501' OR SQLERRM NOT LIKE '%permission denied for function remove_owned_review_image%' THEN
      RAISE;
    END IF;
    RAISE NOTICE 'anon denial SQLSTATE % message %', SQLSTATE, SQLERRM;
  END;
  EXECUTE 'SET LOCAL ROLE NONE';

  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM 1 FROM public.remove_owned_review_image(
      '018c27e1-0000-4000-8000-000000000099',
      '018c27e1-0000-4000-8000-000000000098',
      '018c27e1-0000-4000-8000-000000000001'
    );
    RAISE EXCEPTION 'authenticated executed remove_owned_review_image';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLSTATE IS DISTINCT FROM '42501' OR SQLERRM NOT LIKE '%permission denied for function remove_owned_review_image%' THEN
      RAISE;
    END IF;
    RAISE NOTICE 'authenticated denial SQLSTATE % message %', SQLSTATE, SQLERRM;
  END;
  EXECUTE 'SET LOCAL ROLE NONE';

  EXECUTE 'SET LOCAL ROLE service_role';
  BEGIN
    PERFORM 1 FROM public.remove_owned_review_image(
      '018c27e1-0000-4000-8000-000000000099',
      '018c27e1-0000-4000-8000-000000000098',
      '018c27e1-0000-4000-8000-000000000001'
    );
    RAISE EXCEPTION 'service role without server context executed the body';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLSTATE IS DISTINCT FROM '42501' OR SQLERRM NOT LIKE '%review_image_server_only%' THEN
      RAISE;
    END IF;
    RAISE NOTICE 'service context denial SQLSTATE % message %', SQLSTATE, SQLERRM;
  END;
  EXECUTE 'SET LOCAL ROLE NONE';
END
$roles$;

DO $cases$
DECLARE
  v_user uuid := '018c27e1-0000-4000-8000-000000000001';
  v_other uuid := '018c27e1-0000-4000-8000-000000000002';
  v_admin uuid := '018c27e1-0000-4000-8000-000000000003';
  v_product uuid := '018c27e1-0000-4000-8000-000000000010';
  v_order uuid := '018c27e1-0000-4000-8000-000000000021';
  v_order_other uuid := '018c27e1-0000-4000-8000-000000000022';
  v_item uuid := '018c27e1-0000-4000-8000-000000000031';
  v_item_other uuid := '018c27e1-0000-4000-8000-000000000032';
  v_review uuid;
  v_other_review uuid;
  v_drop uuid;
  v_keep_a uuid;
  v_keep_b uuid;
  v_foreign uuid;
  v_rating integer;
  v_body text;
  v_status text;
  v_item_kept uuid;
  v_events integer;
  v_other_events integer;
  v_count integer;
  v_already boolean;
  v_path text;
  v_receipt_path text;
  v_receipt_review uuid;
  v_jobs integer;
BEGIN
  INSERT INTO auth.users (id, email, aud, role, created_at, updated_at) VALUES
    (v_user, 'synthetic-remove-a@example.invalid', 'authenticated', 'authenticated', now(), now()),
    (v_other, 'synthetic-remove-b@example.invalid', 'authenticated', 'authenticated', now(), now()),
    (v_admin, 'synthetic-remove-admin@example.invalid', 'authenticated', 'authenticated', now(), now());
  INSERT INTO public.profiles (id, is_admin) VALUES
    (v_user, false), (v_other, false), (v_admin, true);
  INSERT INTO public.products (
    id, title, subtitle, description, options, front_image,
    is_new, is_limited, is_sale, is_visible, display_order, supported_orientations
  ) VALUES (
    v_product, '[TEST] NEW27 remove image', 'SYNTHETIC', 'Synthetic removal fixture.',
    '[]'::jsonb, '/hero/spatial-room.webp', false, false, false, true, 0, '["portrait"]'::jsonb
  );
  INSERT INTO public.orders (id, user_id, order_number, status, total_price, completed_at, payment_finalized_at)
  VALUES
    (v_order, v_user, 'SYN-NEW27-REMOVE', 'COMPLETED', 100, now(), now()),
    (v_order_other, v_other, 'SYN-NEW27-REMOVE-B', 'COMPLETED', 100, now(), now());
  INSERT INTO public.order_items (id, order_id, product_id, product_title, quantity, price) VALUES
    (v_item, v_order, v_product, 'synthetic removal line', 1, 100),
    (v_item_other, v_order_other, v_product, 'synthetic other line', 1, 100);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  EXECUTE 'SET LOCAL ROLE service_role';
  PERFORM public.set_order_item_commerce_state(v_item, 'fulfilled');
  PERFORM public.set_order_item_commerce_state(v_item_other, 'fulfilled');
  EXECUTE 'SET LOCAL ROLE NONE';
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_review := public.create_review(v_item, 5, 'synthetic removal review');
  EXECUTE 'SET LOCAL ROLE NONE';
  PERFORM set_config('request.jwt.claim.sub', v_other::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_other_review := public.create_review(v_item_other, 4, 'synthetic other review');
  EXECUTE 'SET LOCAL ROLE NONE';
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  EXECUTE 'SET LOCAL ROLE service_role';
  v_drop := public.attach_review_image(v_review, 'reviews/' || v_review::text || '/018c27e1-0000-4000-8000-0000000000c1.jpg', 'image/jpeg', 128);
  v_keep_a := public.attach_review_image(v_review, 'reviews/' || v_review::text || '/018c27e1-0000-4000-8000-0000000000c2.jpg', 'image/jpeg', 128);
  v_keep_b := public.attach_review_image(v_review, 'reviews/' || v_review::text || '/018c27e1-0000-4000-8000-0000000000c3.jpg', 'image/jpeg', 128);
  v_foreign := public.attach_review_image(v_other_review, 'reviews/' || v_other_review::text || '/018c27e1-0000-4000-8000-0000000000c9.jpg', 'image/jpeg', 128);
  EXECUTE 'SET LOCAL ROLE NONE';

  SELECT review.rating, review.body, review.status, review.order_item_id
    INTO v_rating, v_body, v_status, v_item_kept
  FROM public.reviews AS review WHERE review.id = v_review;
  SELECT count(*) INTO v_events
  FROM public.review_moderation_events AS event WHERE event.review_id = v_review;

  EXECUTE 'SET LOCAL ROLE service_role';
  SELECT removed.already_removed, removed.object_path
    INTO v_already, v_path
  FROM public.remove_owned_review_image(v_review, v_drop, v_user) AS removed;
  EXECUTE 'SET LOCAL ROLE NONE';
  IF v_already IS NOT FALSE
     OR v_path IS DISTINCT FROM 'reviews/' || v_review::text || '/018c27e1-0000-4000-8000-0000000000c1.jpg' THEN
    RAISE EXCEPTION 'first removal did not return the selected image';
  END IF;
  IF EXISTS (SELECT 1 FROM public.review_images WHERE id = v_drop)
     OR NOT EXISTS (SELECT 1 FROM public.review_images WHERE id = v_keep_a)
     OR NOT EXISTS (SELECT 1 FROM public.review_images WHERE id = v_keep_b)
     OR NOT EXISTS (SELECT 1 FROM public.reviews WHERE id = v_review) THEN
    RAISE EXCEPTION 'removal changed the wrong image or the review';
  END IF;
  IF (SELECT rating FROM public.reviews WHERE id = v_review) IS DISTINCT FROM v_rating
     OR (SELECT body FROM public.reviews WHERE id = v_review) IS DISTINCT FROM v_body
     OR (SELECT status FROM public.reviews WHERE id = v_review) IS DISTINCT FROM v_status
     OR (SELECT order_item_id FROM public.reviews WHERE id = v_review) IS DISTINCT FROM v_item_kept
     OR (SELECT status FROM public.reviews WHERE id = v_review) = 'deleted'
     OR (SELECT count(*) FROM public.review_moderation_events WHERE review_id = v_review) IS DISTINCT FROM v_events
     OR EXISTS (
       SELECT 1 FROM public.review_moderation_events
       WHERE review_id = v_review AND action IS DISTINCT FROM 'created'
     ) THEN
    RAISE EXCEPTION 'removal changed review integrity';
  END IF;
  RAISE NOTICE 'individual deletion removed % and kept review %', v_drop, v_review;

  EXECUTE 'SET LOCAL ROLE NONE';
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.create_review(v_item, 5, 'second entitlement attempt');
    RAISE EXCEPTION 'entitlement was restored';
  EXCEPTION WHEN unique_violation THEN
    IF SQLSTATE IS DISTINCT FROM '23505' OR SQLERRM NOT LIKE '%review_entitlement_consumed%' THEN RAISE; END IF;
    RAISE NOTICE 'entitlement SQLSTATE % message %', SQLSTATE, SQLERRM;
  END;
  EXECUTE 'SET LOCAL ROLE NONE';
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  EXECUTE 'SET LOCAL ROLE service_role';

  BEGIN
    PERFORM 1 FROM public.remove_owned_review_image(v_review, v_keep_a, v_other);
    RAISE EXCEPTION 'cross-customer removal succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLSTATE IS DISTINCT FROM '42501' OR SQLERRM NOT LIKE '%review_not_owner%' THEN RAISE; END IF;
    RAISE NOTICE 'cross-customer SQLSTATE % message %', SQLSTATE, SQLERRM;
  END;
  EXECUTE 'SET LOCAL ROLE NONE';
  IF NOT EXISTS (SELECT 1 FROM public.review_images WHERE id = v_keep_a) THEN
    RAISE EXCEPTION 'cross-customer denial deleted an image';
  END IF;
  EXECUTE 'SET LOCAL ROLE service_role';

  BEGIN
    PERFORM 1 FROM public.remove_owned_review_image(v_review, v_foreign, v_user);
    RAISE EXCEPTION 'cross-review removal succeeded';
  EXCEPTION WHEN no_data_found THEN
    IF SQLSTATE IS DISTINCT FROM 'P0002' OR SQLERRM NOT LIKE '%review_image_not_found%' THEN RAISE; END IF;
    RAISE NOTICE 'cross-review SQLSTATE % message %', SQLSTATE, SQLERRM;
  END;
  EXECUTE 'SET LOCAL ROLE NONE';
  IF NOT EXISTS (SELECT 1 FROM public.review_images WHERE id = v_foreign) THEN
    RAISE EXCEPTION 'cross-review denial deleted the other image';
  END IF;
  EXECUTE 'SET LOCAL ROLE service_role';

  BEGIN
    PERFORM 1 FROM public.remove_owned_review_image(v_review, '018c27e1-0000-4000-8000-000000000099', v_user);
    RAISE EXCEPTION 'unknown image removal succeeded';
  EXCEPTION WHEN no_data_found THEN
    IF SQLSTATE IS DISTINCT FROM 'P0002' OR SQLERRM NOT LIKE '%review_image_not_found%' THEN RAISE; END IF;
    RAISE NOTICE 'unknown image SQLSTATE % message %', SQLSTATE, SQLERRM;
  END;

  BEGIN
    PERFORM 1 FROM public.remove_owned_review_image(v_review, v_keep_a, NULL);
    RAISE EXCEPTION 'null user removal succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLSTATE IS DISTINCT FROM '42501' OR SQLERRM NOT LIKE '%review_not_owner%' THEN RAISE; END IF;
    RAISE NOTICE 'null user SQLSTATE % message %', SQLSTATE, SQLERRM;
  END;
  BEGIN
    PERFORM 1 FROM public.remove_owned_review_image(NULL, v_keep_a, v_user);
    RAISE EXCEPTION 'null review removal succeeded';
  EXCEPTION WHEN no_data_found THEN
    IF SQLSTATE IS DISTINCT FROM 'P0002' OR SQLERRM NOT LIKE '%review_image_not_found%' THEN RAISE; END IF;
    RAISE NOTICE 'null review SQLSTATE % message %', SQLSTATE, SQLERRM;
  END;
  BEGIN
    PERFORM 1 FROM public.remove_owned_review_image(v_review, NULL, v_user);
    RAISE EXCEPTION 'null image removal succeeded';
  EXCEPTION WHEN no_data_found THEN
    IF SQLSTATE IS DISTINCT FROM 'P0002' OR SQLERRM NOT LIKE '%review_image_not_found%' THEN RAISE; END IF;
    RAISE NOTICE 'null image SQLSTATE % message %', SQLSTATE, SQLERRM;
  END;
  BEGIN
    PERFORM public.remove_owned_review_image('not-a-uuid'::uuid, v_keep_a, v_user);
    RAISE EXCEPTION 'malformed review id was accepted';
  EXCEPTION WHEN invalid_text_representation THEN
    IF SQLSTATE IS DISTINCT FROM '22P02' THEN RAISE; END IF;
    RAISE NOTICE 'malformed id SQLSTATE % message %', SQLSTATE, SQLERRM;
  END;

  SELECT removed.already_removed, removed.object_path
    INTO v_already, v_path
  FROM public.remove_owned_review_image(v_review, v_drop, v_user) AS removed;
  EXECUTE 'SET LOCAL ROLE NONE';
  IF v_already IS NOT TRUE
     OR v_path IS DISTINCT FROM 'reviews/' || v_review::text || '/018c27e1-0000-4000-8000-0000000000c1.jpg'
     OR (SELECT count(*) FROM public.review_images WHERE review_id = v_review) IS DISTINCT FROM 2
     OR (SELECT count(*) FROM public.review_image_removals) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'repeat removal was not limited to the original image';
  END IF;
  SELECT removal.review_id, removal.object_path
    INTO v_receipt_review, v_receipt_path
  FROM public.review_image_removals AS removal WHERE removal.image_id = v_drop;
  IF v_receipt_review IS DISTINCT FROM v_review OR v_receipt_path IS DISTINCT FROM v_path THEN
    RAISE EXCEPTION 'receipt does not match the removed image';
  END IF;
  RAISE NOTICE 'repeat removal already_removed path retained';

  EXECUTE 'SET LOCAL ROLE service_role';
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  BEGIN
    PERFORM 1 FROM public.remove_owned_review_image(v_review, v_keep_a, v_user);
    RAISE EXCEPTION 'changed role context executed removal';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLSTATE IS DISTINCT FROM '42501' OR SQLERRM NOT LIKE '%review_image_server_only%' THEN RAISE; END IF;
    RAISE NOTICE 'changed context SQLSTATE % message %', SQLSTATE, SQLERRM;
  END;
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  IF EXISTS (
    SELECT 1 FROM public.list_public_review_image_ids(ARRAY[v_review]) AS img WHERE img.image_id = v_drop
  ) OR EXISTS (
    SELECT 1 FROM public.list_owned_review_images(v_review, v_user) AS img WHERE img.object_path = v_path
  ) OR (
    SELECT count(*) FROM public.list_owned_review_images(v_review, v_user)
  ) IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'deleted image remained listed';
  END IF;
  IF public.review_public_image_object_path(v_drop) IS NOT NULL THEN
    RAISE EXCEPTION 'deleted path was publicly readable';
  END IF;

  PERFORM public.queue_review_image_cleanup(v_review, ARRAY[v_path]);
  PERFORM public.queue_review_image_cleanup(v_other_review, ARRAY[v_path]);
  PERFORM public.complete_review_image_cleanup(v_other_review, ARRAY[v_path]);
  EXECUTE 'SET LOCAL ROLE NONE';
  SELECT count(*) INTO v_jobs FROM public.review_image_cleanup_jobs WHERE object_path = v_path AND review_id = v_review;
  IF v_jobs IS DISTINCT FROM 1
     OR EXISTS (SELECT 1 FROM public.review_image_cleanup_jobs WHERE review_id = v_other_review) THEN
    RAISE EXCEPTION 'cleanup queue accepted a cross-review path';
  END IF;
  EXECUTE 'SET LOCAL ROLE service_role';
  SELECT removed.object_path INTO v_path
  FROM public.remove_owned_review_image(v_review, v_drop, v_user) AS removed;
  EXECUTE 'SET LOCAL ROLE NONE';
  IF v_path IS DISTINCT FROM v_receipt_path
     OR (SELECT object_path FROM public.review_image_cleanup_jobs WHERE review_id = v_review) IS DISTINCT FROM v_path THEN
    RAISE EXCEPTION 'retry path does not match the receipt';
  END IF;
  RAISE NOTICE 'cleanup retry retained %', v_path;

  EXECUTE 'SET LOCAL ROLE service_role';
  PERFORM public.attach_review_image(
    v_review,
    'reviews/' || v_review::text || '/018c27e1-0000-4000-8000-0000000000c4.jpg',
    'image/jpeg',
    128
  );
  EXECUTE 'SET LOCAL ROLE NONE';
  IF (SELECT count(*) FROM public.review_images WHERE review_id = v_review) IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'pending replacement did not restore the open slot';
  END IF;

  EXECUTE 'SET LOCAL ROLE NONE';
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.moderate_review(v_review, 'approve');
  EXECUTE 'SET LOCAL ROLE NONE';
  IF (SELECT status FROM public.reviews WHERE id = v_review) IS DISTINCT FROM 'approved'
     OR (SELECT rating FROM public.reviews WHERE id = v_review) IS DISTINCT FROM v_rating
     OR (SELECT body FROM public.reviews WHERE id = v_review) IS DISTINCT FROM v_body
     OR EXISTS (
       SELECT 1 FROM public.review_moderation_events
       WHERE review_id = v_review AND action = 'deleted'
     ) THEN
    RAISE EXCEPTION 'approval changed the saved review';
  END IF;
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  EXECUTE 'SET LOCAL ROLE service_role';
  BEGIN
    PERFORM public.attach_review_image(
      v_review,
      'reviews/' || v_review::text || '/018c27e1-0000-4000-8000-0000000000c5.jpg',
      'image/jpeg',
      128
    );
    RAISE EXCEPTION 'approved review accepted a replacement';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLSTATE IS DISTINCT FROM '42501' OR SQLERRM NOT LIKE '%review_image_not_allowed%' THEN RAISE; END IF;
    RAISE NOTICE 'approved attach SQLSTATE % message %', SQLSTATE, SQLERRM;
  END;
  EXECUTE 'SET LOCAL ROLE NONE';
  IF (SELECT count(*) FROM public.review_images WHERE review_id = v_review) IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'rejected replacement changed the image count';
  END IF;

  EXECUTE 'SET LOCAL ROLE anon';
  SELECT count(*) INTO v_count
  FROM public.list_public_review_image_ids(ARRAY[v_review, v_other_review]) AS img
  WHERE img.image_id = v_drop;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'public listing returned the deleted image';
  END IF;
  SELECT count(*) INTO v_count
  FROM public.list_public_review_image_ids(ARRAY[v_review]) AS img;
  IF v_count IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'public listing lost a remaining image';
  END IF;
  EXECUTE 'SET LOCAL ROLE service_role';
  IF public.review_public_image_object_path(v_drop) IS NOT NULL THEN
    RAISE EXCEPTION 'approved public path lookup returned the deleted image';
  END IF;
  IF public.review_public_image_object_path(v_keep_a) IS DISTINCT FROM
     'reviews/' || v_review::text || '/018c27e1-0000-4000-8000-0000000000c2.jpg' THEN
    RAISE EXCEPTION 'remaining public path was not readable';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.list_owned_review_images(v_review, v_user) AS img
    WHERE img.image_id = v_drop OR img.object_path = v_receipt_path
  ) OR (
    SELECT count(*) FROM public.list_owned_review_images(v_review, v_user)
  ) IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'owner listing did not match the remaining images';
  END IF;

  EXECUTE 'SET LOCAL ROLE NONE';
  UPDATE public.profiles SET withdrawn_at = now() WHERE id = v_user;
  SELECT count(*) INTO v_other_events
  FROM public.review_moderation_events WHERE review_id = v_review;
  EXECUTE 'SET LOCAL ROLE service_role';
  BEGIN
    PERFORM 1 FROM public.remove_owned_review_image(v_review, v_keep_a, v_user);
    RAISE EXCEPTION 'withdrawn removal succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLSTATE IS DISTINCT FROM '42501' OR SQLERRM NOT LIKE '%withdrawn_subject_frozen%' THEN RAISE; END IF;
    RAISE NOTICE 'withdrawn SQLSTATE % message %', SQLSTATE, SQLERRM;
  END;
  EXECUTE 'SET LOCAL ROLE NONE';
  IF NOT EXISTS (SELECT 1 FROM public.review_images WHERE id = v_keep_a)
     OR (SELECT count(*) FROM public.review_moderation_events WHERE review_id = v_review) IS DISTINCT FROM v_other_events
     OR (SELECT status FROM public.reviews WHERE id = v_review) IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'withdrawn denial changed the review';
  END IF;
  EXECUTE 'SET LOCAL ROLE NONE';
END
$cases$;

ROLLBACK;
