-- NEW27 executable scratch verification.
-- NOT RUN by the draft task. Do not point this at production or payment-test.
-- The script aborts unless all of the following are true:
--   metalora.review_test_scratch = 1
--   metalora.review_test_database_identity = disposable-local
--   metalora.review_test_target is neither production nor payment-test
--   the server address is loopback or a local socket
-- Those session values are caller-controlled. They do not prove the database
-- contains no production data. Execution is allowed only when the server
-- itself is metalora_new27_disposable on 127.0.0.1:54329 with the approved
-- disposable data directory. Any ambiguous identity fails closed.
-- A single session cannot prove the refund/create interleaving. That design is
-- recorded below and is not a concurrency pass.

BEGIN;

DO $guard$
DECLARE
  v_data_dir text;
  v_listen text;
BEGIN
  IF pg_catalog.current_setting('metalora.review_test_scratch', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'opt-in required: metalora.review_test_scratch=1';
  END IF;
  IF pg_catalog.current_setting('metalora.review_test_database_identity', true) IS DISTINCT FROM 'disposable-local' THEN
    RAISE EXCEPTION 'refusing database identity %',
      coalesce(pg_catalog.current_setting('metalora.review_test_database_identity', true), 'unset');
  END IF;
  IF pg_catalog.current_setting('metalora.review_test_target', true) IN ('production', 'payment-test') THEN
    RAISE EXCEPTION 'refusing production or payment-test target';
  END IF;
  IF inet_server_addr() IS NULL OR host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1' THEN
    RAISE EXCEPTION 'refusing non-loopback database';
  END IF;
  IF inet_server_port() IS DISTINCT FROM 54329 THEN
    RAISE EXCEPTION 'refusing server port %', inet_server_port();
  END IF;
  IF current_database() IS DISTINCT FROM 'metalora_new27_disposable' THEN
    RAISE EXCEPTION 'refusing database %', current_database();
  END IF;
  v_data_dir := replace(lower(pg_catalog.current_setting('data_directory')), '\', '/');
  IF v_data_dir IS DISTINCT FROM 'c:/users/admin/desktop/metalora-new27-disposable-pg' THEN
    RAISE EXCEPTION 'refusing data directory';
  END IF;
  v_listen := pg_catalog.current_setting('listen_addresses');
  IF v_listen IS DISTINCT FROM '127.0.0.1' OR position('*' IN v_listen) > 0 THEN
    RAISE EXCEPTION 'refusing listen_addresses';
  END IF;
  IF split_part(pg_catalog.current_setting('server_version'), '.', 1) IS DISTINCT FROM '14' THEN
    RAISE EXCEPTION 'refusing PostgreSQL version';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_foreign_server) THEN
    RAISE EXCEPTION 'refusing database with a foreign server';
  END IF;
  IF (SELECT count(*) FROM public.orders) <> 0
     OR (SELECT count(*) FROM public.order_items) <> 0
     OR (SELECT count(*) FROM public.profiles) <> 0
     OR (SELECT count(*) FROM auth.users) <> 0
     OR (SELECT count(*) FROM auth.identities) <> 0 THEN
    RAISE EXCEPTION 'refusing database with existing customer rows';
  END IF;
END
$guard$;

DO $priv$
DECLARE
  v_role text;
  v_table text;
  v_priv text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    FOREACH v_table IN ARRAY ARRAY[
      'public.reviews',
      'public.review_images',
      'public.review_moderation_events',
      'public.order_item_commerce_state'
    ] LOOP
      FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] LOOP
        IF has_table_privilege(v_role, v_table, v_priv) THEN
          RAISE EXCEPTION 'direct table privilege remains: % % %', v_role, v_table, v_priv;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  IF has_function_privilege('authenticated', 'public.attach_review_image(uuid,text,text,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.attach_review_image(uuid,text,text,integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.attach_review_image(uuid,text,text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'image attach privilege is wrong';
  END IF;
  IF has_function_privilege('authenticated', 'public.set_order_item_commerce_state(uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.create_review(uuid,integer,text)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.moderate_review(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'function privilege is wrong';
  END IF;
END
$priv$;

DO $cases$
DECLARE
  v_user uuid := '018c27a0-0000-4000-8000-0000000000a1';
  v_other uuid := '018c27a0-0000-4000-8000-0000000000b2';
  v_admin uuid := '018c27a0-0000-4000-8000-0000000000c3';
  v_order uuid := '018c27a0-0000-4000-8000-0000000000d4';
  v_item uuid := '018c27a0-0000-4000-8000-0000000000e5';
  v_review uuid;
  v_review_b uuid;
  v_item_b uuid := '018c27a0-0000-4000-8000-0000000000f6';
  v_count bigint;
  v_product uuid := '018c27a0-0000-4000-8000-000000000111';
  v_order_pub uuid := '018c27a0-0000-4000-8000-000000000112';
  v_item_pub uuid := '018c27a0-0000-4000-8000-000000000113';
  v_review_pub uuid;
  v_user_w uuid := '018c27a0-0000-4000-8000-000000000114';
  v_order_w uuid := '018c27a0-0000-4000-8000-000000000115';
  v_item_w uuid := '018c27a0-0000-4000-8000-000000000116';
  v_item_w2 uuid := '018c27a0-0000-4000-8000-000000000119';
  v_review_w uuid;
  v_product_c uuid := '018c27a0-0000-4000-8000-000000000121';
  v_item_cancel uuid := '018c27a0-0000-4000-8000-000000000117';
  v_item_hide uuid := '018c27a0-0000-4000-8000-000000000118';
  v_review_hide uuid;
  v_public jsonb;
  v_average numeric;
  v_role text;
  v_table text;
  v_sql text;
BEGIN
  INSERT INTO auth.users (id, email, aud, role, created_at, updated_at)
  VALUES
    (v_user, 'synthetic-review-a@example.invalid', 'authenticated', 'authenticated', pg_catalog.now(), pg_catalog.now()),
    (v_other, 'synthetic-review-b@example.invalid', 'authenticated', 'authenticated', pg_catalog.now(), pg_catalog.now()),
    (v_admin, 'synthetic-review-admin@example.invalid', 'authenticated', 'authenticated', pg_catalog.now(), pg_catalog.now());

  INSERT INTO public.profiles (id, is_admin)
  VALUES (v_user, false), (v_other, false), (v_admin, true)
  ON CONFLICT (id) DO UPDATE SET is_admin = EXCLUDED.is_admin;

  INSERT INTO public.orders (id, user_id, order_number, status, total_price, completed_at, payment_finalized_at)
  VALUES (v_order, v_user, 'SYN-NEW27-0001', 'PENDING', 100, NULL, NULL);

  INSERT INTO public.order_items (id, order_id, product_id, product_title, quantity, price)
  VALUES (v_item, v_order, NULL, 'synthetic line', 1, 100);

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_user::text, true);
  PERFORM pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);

  BEGIN
    PERFORM public.create_review(v_item, 5, 'unpaid or incomplete order');
    RAISE EXCEPTION 'missing failure for unpaid or incomplete order';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLERRM NOT LIKE '%review_not_eligible%' THEN RAISE; END IF;
  END;

  UPDATE public.orders SET status = 'COMPLETED', completed_at = NULL, payment_finalized_at = pg_catalog.now() WHERE id = v_order;
  BEGIN
    PERFORM public.create_review(v_item, 5, 'missing completed_at');
    RAISE EXCEPTION 'missing failure for missing completed_at';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLERRM NOT LIKE '%review_not_eligible%' THEN RAISE; END IF;
  END;

  UPDATE public.orders SET completed_at = pg_catalog.now(), payment_finalized_at = NULL WHERE id = v_order;
  BEGIN
    PERFORM public.create_review(v_item, 5, 'missing payment_finalized_at');
    RAISE EXCEPTION 'missing failure for missing payment_finalized_at';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLERRM NOT LIKE '%review_not_eligible%' THEN RAISE; END IF;
  END;

  UPDATE public.orders
  SET status = 'COMPLETED', completed_at = pg_catalog.now(), payment_finalized_at = pg_catalog.now()
  WHERE id = v_order;
  BEGIN
    PERFORM public.create_review(v_item, 5, 'missing commerce-state row');
    RAISE EXCEPTION 'missing failure for missing commerce-state row';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLERRM NOT LIKE '%review_not_eligible%' THEN RAISE; END IF;
  END;

  PERFORM pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM public.set_order_item_commerce_state(v_item, 'fulfilled');
  PERFORM pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_user::text, true);

  v_review := public.create_review(v_item, 5, 'synthetic eligible review');
  IF v_review IS NULL THEN
    RAISE EXCEPTION 'eligible create returned null';
  END IF;

  BEGIN
    PERFORM public.create_review(v_item, 4, 'duplicate review');
    RAISE EXCEPTION 'missing failure for duplicate review';
  EXCEPTION
    WHEN unique_violation THEN
      IF SQLERRM NOT LIKE '%review_entitlement_consumed%' THEN RAISE; END IF;
  END;

  INSERT INTO public.order_items (id, order_id, product_id, product_title, quantity, price)
  VALUES (v_item_b, v_order, NULL, 'synthetic tombstone line', 1, 100);
  PERFORM pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM public.set_order_item_commerce_state(v_item_b, 'fulfilled');
  PERFORM pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_user::text, true);
  v_review_b := public.create_review(v_item_b, 4, 'synthetic tombstone review');
  PERFORM public.delete_review(v_review_b);
  BEGIN
    PERFORM public.create_review(v_item_b, 4, 'recreate after deletion');
    RAISE EXCEPTION 'missing failure for recreate after deletion';
  EXCEPTION
    WHEN unique_violation THEN
      IF SQLERRM NOT LIKE '%review_entitlement_consumed%' THEN RAISE; END IF;
  END;

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_other::text, true);
  BEGIN
    PERFORM public.edit_review(v_review, 1, 'another customer edit');
    RAISE EXCEPTION 'missing failure for non-owner edit or delete';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLERRM NOT LIKE '%review_not_owner%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.moderate_review(v_review, 'approve');
    RAISE EXCEPTION 'missing failure for non-admin moderation';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLERRM NOT LIKE '%review_moderation_forbidden%' THEN RAISE; END IF;
  END;

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM public.moderate_review(v_review, 'approve');

  SELECT approved_count INTO v_count FROM public.product_review_public_stats(NULL);
  -- Workshop line has null product_id, so the catalog aggregate stays empty.
  IF coalesce(v_count, 0) <> 0 THEN
    RAISE EXCEPTION 'null product changed a catalog aggregate';
  END IF;

  PERFORM pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM public.set_order_item_commerce_state(v_item, 'refunded');
  PERFORM public.set_order_item_commerce_state(v_item, 'refunded');

  IF EXISTS (
    SELECT 1 FROM public.reviews
    WHERE id = v_review AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'refunded review stayed approved';
  END IF;

  PERFORM pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_admin::text, true);
  BEGIN
    PERFORM public.moderate_review(v_review, 'approve');
    RAISE EXCEPTION 'refunded review became public through approve';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLERRM NOT LIKE '%review_not_eligible%' THEN RAISE; END IF;
  END;

  PERFORM pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
  BEGIN
    PERFORM public.set_order_item_commerce_state(v_item, 'fulfilled');
    RAISE EXCEPTION 'missing failure for commerce-state resurrection';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLERRM NOT LIKE '%commerce_state_resurrection_forbidden%' THEN RAISE; END IF;
  END;

  -- Table owner bypasses GRANT. Switch to service_role for this assertion only.
  -- SET LOCAL cannot survive ROLLBACK or session disconnect. SET ROLE is not used.
  BEGIN
    EXECUTE 'SET LOCAL ROLE service_role';
    IF current_user IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'direct table write did not run as service_role';
    END IF;
    BEGIN
      INSERT INTO public.reviews (order_item_id, order_id, user_id, rating, body)
      VALUES (v_item, v_order, v_user, 5, 'direct table write');
      RAISE EXCEPTION 'missing failure for direct table write';
    EXCEPTION
      WHEN insufficient_privilege THEN
        IF SQLSTATE IS DISTINCT FROM '42501' THEN
          RAISE EXCEPTION 'direct table write returned SQLSTATE %', SQLSTATE;
        END IF;
    END;
    EXECUTE 'SET LOCAL ROLE NONE';
  EXCEPTION
    WHEN OTHERS THEN
      BEGIN
        EXECUTE 'SET LOCAL ROLE NONE';
      EXCEPTION
        WHEN OTHERS THEN
          NULL;
      END;
      RAISE;
  END;

  PERFORM pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_other::text, true);
  BEGIN
    PERFORM public.delete_review(v_review);
    RAISE EXCEPTION 'missing failure for non-owner delete';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLSTATE IS DISTINCT FROM '42501' OR SQLERRM NOT LIKE '%review_not_owner%' THEN
        RAISE EXCEPTION 'non-owner delete returned % %', SQLSTATE, SQLERRM;
      END IF;
  END;
  BEGIN
    PERFORM public.create_review(v_item, 5, 'another customer create');
    RAISE EXCEPTION 'missing failure for non-owner create';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLSTATE IS DISTINCT FROM '42501' OR SQLERRM NOT LIKE '%review_order_not_owned%' THEN
        RAISE EXCEPTION 'non-owner create returned % %', SQLSTATE, SQLERRM;
      END IF;
  END;

  INSERT INTO public.products (
    id, title, subtitle, description, options, front_image,
    is_new, is_limited, is_sale, is_visible, display_order, supported_orientations
  ) VALUES
    (v_product, '[TEST] NEW27 public fixture', 'SYNTHETIC', 'Synthetic disposable review fixture. Not a catalog product.', '[]'::jsonb, '/hero/spatial-room.webp', false, false, false, true, 0, '["portrait"]'::jsonb),
    (v_product_c, '[TEST] NEW27 cancellation fixture', 'SYNTHETIC', 'Synthetic disposable cancellation fixture. Not a catalog product.', '[]'::jsonb, '/hero/spatial-room.webp', false, false, false, true, 0, '["portrait"]'::jsonb);
  INSERT INTO public.orders (id, user_id, order_number, status, total_price, completed_at, payment_finalized_at)
  VALUES (v_order_pub, v_user, 'SYN-NEW27-0002', 'COMPLETED', 100, pg_catalog.now(), pg_catalog.now());
  INSERT INTO public.order_items (id, order_id, product_id, product_title, quantity, price)
  VALUES
    (v_item_pub, v_order_pub, v_product, 'synthetic public line', 1, 100),
    (v_item_cancel, v_order_pub, v_product_c, 'synthetic cancelled line', 1, 100),
    (v_item_hide, v_order_pub, v_product_c, 'synthetic cancel-hide line', 1, 100);
  PERFORM pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM public.set_order_item_commerce_state(v_item_pub, 'fulfilled');
  PERFORM public.set_order_item_commerce_state(v_item_cancel, 'cancelled');
  PERFORM public.set_order_item_commerce_state(v_item_hide, 'fulfilled');
  PERFORM pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_user::text, true);
  v_review_pub := public.create_review(v_item_pub, 5, 'synthetic public review');

  EXECUTE 'SET LOCAL ROLE anon';
  IF current_user IS DISTINCT FROM 'anon' THEN
    RAISE EXCEPTION 'public read did not run as anon';
  END IF;
  SELECT count(*) INTO v_count FROM public.list_public_reviews(v_product, 20, 0);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'pending review was public';
  END IF;
  SELECT approved_count INTO v_count FROM public.product_review_public_stats(v_product);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'pending review affected the aggregate';
  END IF;
  EXECUTE 'SET LOCAL ROLE NONE';

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM public.moderate_review(v_review_pub, 'reject');
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT count(*) INTO v_count FROM public.list_public_reviews(v_product, 20, 0);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'rejected review was public';
  END IF;
  SELECT approved_count INTO v_count FROM public.product_review_public_stats(v_product);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'rejected review affected the aggregate';
  END IF;
  EXECUTE 'SET LOCAL ROLE NONE';

  PERFORM public.moderate_review(v_review_pub, 'approve');
  EXECUTE 'SET LOCAL ROLE anon';
  IF current_user IS DISTINCT FROM 'anon' THEN
    RAISE EXCEPTION 'approved public read did not run as anon';
  END IF;
  SELECT count(*) INTO v_count FROM public.list_public_reviews(v_product, 20, 0);
  IF v_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'approved review was not public';
  END IF;
  SELECT s.approved_count, s.average_rating INTO v_count, v_average
  FROM public.product_review_public_stats(v_product) AS s;
  SELECT row_to_json(r)::jsonb INTO v_public
  FROM public.list_public_reviews(v_product, 20, 0) AS r;
  EXECUTE 'SET LOCAL ROLE NONE';
  IF v_count IS DISTINCT FROM 1 OR v_average IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION 'approved public aggregate mismatch';
  END IF;
  IF (
    SELECT coalesce(jsonb_agg(k ORDER BY k), '[]'::jsonb)
    FROM jsonb_object_keys(v_public) AS k
  ) IS DISTINCT FROM '["body","created_at","id","rating"]'::jsonb THEN
    RAISE EXCEPTION 'public json fields mismatch';
  END IF;
  IF v_public::text LIKE '%' || v_user::text || '%'
     OR v_public::text LIKE '%' || v_order_pub::text || '%'
     OR v_public::text LIKE '%' || v_item_pub::text || '%'
     OR v_public::text LIKE '%user_id%'
     OR v_public::text LIKE '%order_id%'
     OR v_public::text LIKE '%order_item_id%' THEN
    RAISE EXCEPTION 'public json exposed a private identifier';
  END IF;

  PERFORM public.moderate_review(v_review_pub, 'hide');
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT count(*) INTO v_count FROM public.list_public_reviews(v_product, 20, 0);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'hidden review was public';
  END IF;
  SELECT approved_count INTO v_count FROM public.product_review_public_stats(v_product);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'hidden review affected the aggregate';
  END IF;
  EXECUTE 'SET LOCAL ROLE NONE';

  PERFORM pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_user::text, true);
  BEGIN
    PERFORM public.create_review(v_item_cancel, 5, 'cancelled item review');
    RAISE EXCEPTION 'missing failure for cancelled item create';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLSTATE IS DISTINCT FROM '42501' OR SQLERRM NOT LIKE '%review_not_eligible%' THEN
        RAISE EXCEPTION 'cancelled create returned % %', SQLSTATE, SQLERRM;
      END IF;
  END;

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_user::text, true);
  v_review_hide := public.create_review(v_item_hide, 4, 'synthetic cancellation review');
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM public.moderate_review(v_review_hide, 'approve');
  PERFORM pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM public.set_order_item_commerce_state(v_item_hide, 'cancelled');
  PERFORM public.set_order_item_commerce_state(v_item_hide, 'cancelled');
  IF EXISTS (
    SELECT 1 FROM public.reviews WHERE id = v_review_hide AND status IS DISTINCT FROM 'hidden'
  ) THEN
    RAISE EXCEPTION 'cancelled review was not hidden';
  END IF;
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT count(*) INTO v_count FROM public.list_public_reviews(v_product_c, 20, 0);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'cancelled review stayed public';
  END IF;
  SELECT approved_count INTO v_count FROM public.product_review_public_stats(v_product_c);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'cancelled review stayed in the aggregate';
  END IF;
  EXECUTE 'SET LOCAL ROLE NONE';
  PERFORM pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_user::text, true);
  BEGIN
    PERFORM public.create_review(v_item_hide, 4, 'repeat cancellation review');
    RAISE EXCEPTION 'repeated cancellation restored eligibility';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLSTATE IS DISTINCT FROM '42501' OR SQLERRM NOT LIKE '%review_not_eligible%' THEN
        RAISE EXCEPTION 'repeat cancellation create returned % %', SQLSTATE, SQLERRM;
      END IF;
  END;

  INSERT INTO auth.users (id, email, aud, role, created_at, updated_at)
  VALUES (v_user_w, 'synthetic-review-w@example.invalid', 'authenticated', 'authenticated', pg_catalog.now(), pg_catalog.now());
  INSERT INTO public.profiles (id, is_admin) VALUES (v_user_w, false);
  INSERT INTO public.orders (id, user_id, order_number, status, total_price, completed_at, payment_finalized_at)
  VALUES (v_order_w, v_user_w, 'SYN-NEW27-0003', 'COMPLETED', 100, pg_catalog.now(), pg_catalog.now());
  INSERT INTO public.order_items (id, order_id, product_id, product_title, quantity, price)
  VALUES
    (v_item_w, v_order_w, NULL, 'synthetic withdrawal line', 1, 100),
    (v_item_w2, v_order_w, NULL, 'synthetic withdrawal spare line', 1, 100);
  PERFORM pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM public.set_order_item_commerce_state(v_item_w, 'fulfilled');
  PERFORM public.set_order_item_commerce_state(v_item_w2, 'fulfilled');
  PERFORM pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_user_w::text, true);
  v_review_w := public.create_review(v_item_w, 5, 'synthetic withdrawal review');
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM public.moderate_review(v_review_w, 'approve');
  UPDATE public.profiles SET withdrawn_at = pg_catalog.now() WHERE id = v_user_w;

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_user_w::text, true);
  BEGIN
    PERFORM public.create_review(v_item_w2, 5, 'withdrawn customer create');
    RAISE EXCEPTION 'missing failure for withdrawn create';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLSTATE IS DISTINCT FROM '42501' OR SQLERRM NOT LIKE '%withdrawn_subject_frozen%' THEN
        RAISE EXCEPTION 'withdrawn create returned % %', SQLSTATE, SQLERRM;
      END IF;
  END;
  BEGIN
    PERFORM public.edit_review(v_review_w, 4, 'withdrawn customer edit');
    RAISE EXCEPTION 'missing failure for withdrawn edit';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLSTATE IS DISTINCT FROM '42501' OR SQLERRM NOT LIKE '%withdrawn_subject_frozen%' THEN
        RAISE EXCEPTION 'withdrawn edit returned % %', SQLSTATE, SQLERRM;
      END IF;
  END;
  BEGIN
    PERFORM public.delete_review(v_review_w);
    RAISE EXCEPTION 'missing failure for withdrawn delete';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLSTATE IS DISTINCT FROM '42501' OR SQLERRM NOT LIKE '%withdrawn_subject_frozen%' THEN
        RAISE EXCEPTION 'withdrawn delete returned % %', SQLSTATE, SQLERRM;
      END IF;
  END;
  BEGIN
    PERFORM public.report_review(v_review_w, 'spam');
    RAISE EXCEPTION 'missing failure for withdrawn report';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLSTATE IS DISTINCT FROM '42501' OR SQLERRM NOT LIKE '%withdrawn_subject_frozen%' THEN
        RAISE EXCEPTION 'withdrawn report returned % %', SQLSTATE, SQLERRM;
      END IF;
  END;
  SELECT count(*) INTO v_count FROM public.list_my_reviews();
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'withdrawn customer list was not empty';
  END IF;

  UPDATE public.profiles SET withdrawn_at = pg_catalog.now() WHERE id = v_admin;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_admin::text, true);
  BEGIN
    PERFORM public.moderate_review(v_review_w, 'hide');
    RAISE EXCEPTION 'missing failure for withdrawn moderate';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLSTATE IS DISTINCT FROM '42501' OR SQLERRM NOT LIKE '%withdrawn_subject_frozen%' THEN
        RAISE EXCEPTION 'withdrawn moderate returned % %', SQLSTATE, SQLERRM;
      END IF;
  END;
  BEGIN
    PERFORM 1 FROM public.list_admin_reviews();
    RAISE EXCEPTION 'missing failure for withdrawn admin list';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLSTATE IS DISTINCT FROM '42501' OR SQLERRM NOT LIKE '%withdrawn_subject_frozen%' THEN
        RAISE EXCEPTION 'withdrawn admin list returned % %', SQLSTATE, SQLERRM;
      END IF;
  END;
  BEGIN
    PERFORM 1 FROM public.list_admin_review_events(v_review_w);
    RAISE EXCEPTION 'missing failure for withdrawn admin events';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLSTATE IS DISTINCT FROM '42501' OR SQLERRM NOT LIKE '%withdrawn_subject_frozen%' THEN
        RAISE EXCEPTION 'withdrawn admin events returned % %', SQLSTATE, SQLERRM;
      END IF;
  END;

  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    FOREACH v_table IN ARRAY ARRAY[
      'public.reviews',
      'public.review_images',
      'public.review_moderation_events',
      'public.order_item_commerce_state'
    ] LOOP
      FOREACH v_sql IN ARRAY ARRAY[
        format('UPDATE %s SET created_at = created_at WHERE false', v_table),
        format('DELETE FROM %s WHERE false', v_table),
        format('TRUNCATE %s', v_table)
      ] LOOP
        IF v_table = 'public.order_item_commerce_state' AND v_sql LIKE 'UPDATE%' THEN
          v_sql := 'UPDATE public.order_item_commerce_state SET updated_at = updated_at WHERE false';
        END IF;
        BEGIN
          EXECUTE format('SET LOCAL ROLE %I', v_role);
          IF current_user IS DISTINCT FROM v_role THEN
            RAISE EXCEPTION 'direct denial did not run as %', v_role;
          END IF;
          BEGIN
            EXECUTE v_sql;
            RAISE EXCEPTION 'missing failure for % as %', v_sql, v_role;
          EXCEPTION
            WHEN insufficient_privilege THEN
              IF SQLSTATE IS DISTINCT FROM '42501' THEN
                RAISE EXCEPTION 'direct denial returned % for % as %', SQLSTATE, v_sql, v_role;
              END IF;
          END;
          EXECUTE 'SET LOCAL ROLE NONE';
        EXCEPTION
          WHEN OTHERS THEN
            BEGIN
              EXECUTE 'SET LOCAL ROLE NONE';
            EXCEPTION
              WHEN OTHERS THEN
                NULL;
            END;
            RAISE;
        END;
      END LOOP;
    END LOOP;
  END LOOP;
END
$cases$;

-- Concurrency design, not a pass:
-- Session A locks the order item inside create_review and has not committed.
-- Session B calls set_order_item_commerce_state(..., 'refunded') and waits on that row.
-- After A commits, B must hide the new review before either transaction returns.
-- This file has one session, so it does not execute that interleaving and does not
-- record a concurrency pass. The repeated refund assertion above is single-session only.

ROLLBACK;
