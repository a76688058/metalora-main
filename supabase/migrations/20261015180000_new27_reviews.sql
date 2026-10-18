-- NEW27 — Review system schema, RLS, and security-definer RPCs.
-- DRAFT. Do not apply to payment-test or production until a separate write is approved.
-- Does not open NEW7, does not change payment freeze, and does not change the payment server.
--
-- Caller identity:
--   Customer RPCs require auth.role() = 'authenticated' AND auth.uid() IS NOT NULL.
--   A service_role JWT is rejected even when a user id is present. auth.uid() is not
--   treated as the customer for service-role calls.
--   Admin moderation requires that same authenticated JWT plus public.profiles.is_admin
--   for auth.uid(), checked inside the function.
--   Commerce state is written only by public.set_order_item_commerce_state, which
--   requires auth.role() = 'service_role'. The source column is set inside that
--   function. A client-supplied source value is not accepted and is not proof.
--   PUBLIC, anon, authenticated, and service_role have no INSERT, UPDATE, DELETE,
--   TRUNCATE, or SELECT on the four tables. Writers are postgres-owned definer
--   functions. A session GUC is not an authorization boundary.
--   This migration does not call the commerce writer from finalize_paid_order.
--   Until the payment server is separately approved to call it, no order item is
--   review-eligible. Absence of a commerce row stays ineligible.

BEGIN;

-- Composite keys so review rows cannot point at a different order or customer.
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_id_order_id_key UNIQUE (id, order_id);

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_id_product_id_key UNIQUE (id, product_id);

ALTER TABLE public.orders
  ADD CONSTRAINT orders_id_user_id_key UNIQUE (id, user_id);

-- ---------------------------------------------------------------------------
-- Commerce state. No client policies. Fail closed without a row.
-- ---------------------------------------------------------------------------
CREATE TABLE public.order_item_commerce_state (
  order_item_id uuid PRIMARY KEY
    REFERENCES public.order_items (id) ON DELETE RESTRICT,
  order_id uuid NOT NULL,
  state text NOT NULL
    CHECK (state IN ('fulfilled', 'cancelled', 'refunded')),
  source text NOT NULL
    CHECK (source = 'payment_server'),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT order_item_commerce_state_item_order_fkey
    FOREIGN KEY (order_item_id, order_id)
    REFERENCES public.order_items (id, order_id)
    ON DELETE RESTRICT
);

COMMENT ON TABLE public.order_item_commerce_state IS
  'NEW27: server-written per-line commerce state. No row means not review-eligible. '
  'source is recorded by set_order_item_commerce_state and is not client input.';

CREATE INDEX order_item_commerce_state_order_id_idx
  ON public.order_item_commerce_state (order_id);

ALTER TABLE public.order_item_commerce_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.order_item_commerce_state FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL UNIQUE
    REFERENCES public.order_items (id) ON DELETE RESTRICT,
  order_id uuid NOT NULL,
  user_id uuid NOT NULL,
  product_id uuid,
  rating integer,
  body text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'hidden', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT reviews_item_order_fkey
    FOREIGN KEY (order_item_id, order_id)
    REFERENCES public.order_items (id, order_id)
    ON DELETE RESTRICT,
  CONSTRAINT reviews_order_user_fkey
    FOREIGN KEY (order_id, user_id)
    REFERENCES public.orders (id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT reviews_content_ck CHECK (
    (
      status <> 'deleted'
      AND rating BETWEEN 1 AND 5
      AND body IS NOT NULL
      AND char_length(btrim(body)) BETWEEN 1 AND 4000
    )
    OR (
      status = 'deleted'
      AND rating IS NULL
      AND body IS NULL
    )
  )
);

COMMENT ON TABLE public.reviews IS
  'NEW27: one entitlement per order_items.id. Delete tombstones the row '
  '(status deleted, body and rating cleared) so the unique key still blocks recreation. '
  'user_id remains the technical subject, matching NEW4-7. Body max 4000 is a draft safety cap.';

CREATE INDEX reviews_owner_idx ON public.reviews (user_id, created_at DESC);
CREATE INDEX reviews_public_product_idx
  ON public.reviews (product_id, created_at DESC)
  WHERE status = 'approved' AND product_id IS NOT NULL;

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.reviews FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.review_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL
    REFERENCES public.reviews (id) ON DELETE RESTRICT,
  object_path text NOT NULL UNIQUE
    CHECK (object_path ~ '^reviews/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'),
  content_type text NOT NULL
    CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer NOT NULL
    CHECK (byte_size > 0 AND byte_size <= 5242880),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

COMMENT ON TABLE public.review_images IS
  'NEW27: private object path only. At most 3 rows per review. No public URL.';

CREATE INDEX review_images_review_id_idx ON public.review_images (review_id);

ALTER TABLE public.review_images ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.review_images FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.review_moderation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL
    REFERENCES public.reviews (id) ON DELETE RESTRICT,
  actor_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  action text NOT NULL
    CHECK (action IN (
      'created', 'edited', 'deleted', 'approved', 'rejected', 'hidden',
      'reported', 'commerce_cancelled', 'commerce_refunded', 'redacted'
    )),
  reason_code text,
  from_status text,
  to_status text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT review_moderation_events_reason_ck CHECK (
    (action = 'reported' AND reason_code IN ('spam', 'abuse', 'other'))
    OR (action <> 'reported' AND reason_code IS NULL)
  )
);

COMMENT ON TABLE public.review_moderation_events IS
  'NEW27 append-only moderation history. No review body and no image bytes.';

CREATE INDEX review_moderation_events_review_idx
  ON public.review_moderation_events (review_id, created_at);

ALTER TABLE public.review_moderation_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.review_moderation_events FROM PUBLIC, anon, authenticated, service_role;

-- Direct DML is revoked above, including service_role. SECURITY DEFINER
-- functions owned by postgres are the only writers. A session GUC is not used.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reviews_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'review_append_only' USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION public.review_images_limit_three()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*)::integer
    INTO v_count
  FROM public.review_images AS img
  WHERE img.review_id = NEW.review_id;
  IF v_count >= 3 THEN
    RAISE EXCEPTION 'review_image_limit' USING ERRCODE = '23514';
  END IF;
  IF NEW.object_path NOT LIKE 'reviews/' || NEW.review_id::text || '/%' THEN
    RAISE EXCEPTION 'review_image_path_mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_review_images_limit ON public.review_images;
CREATE TRIGGER trg_review_images_limit
  BEFORE INSERT ON public.review_images
  FOR EACH ROW
  EXECUTE FUNCTION public.review_images_limit_three();

DROP TRIGGER IF EXISTS trg_review_events_append_only ON public.review_moderation_events;
CREATE TRIGGER trg_review_events_append_only
  BEFORE UPDATE OR DELETE ON public.review_moderation_events
  FOR EACH ROW
  EXECUTE FUNCTION public.reviews_reject_mutation();

CREATE OR REPLACE FUNCTION public.reviews_product_matches_item()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_product_id uuid;
BEGIN
  SELECT item.product_id
    INTO v_product_id
  FROM public.order_items AS item
  WHERE item.id = NEW.order_item_id;
  IF NEW.product_id IS DISTINCT FROM v_product_id THEN
    RAISE EXCEPTION 'review_product_mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reviews_product_matches_item ON public.reviews;
CREATE TRIGGER trg_reviews_product_matches_item
  BEFORE INSERT OR UPDATE OF product_id, order_item_id ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.reviews_product_matches_item();

-- ---------------------------------------------------------------------------
-- Visibility helper. Boolean only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_commerce_is_fulfilled(p_order_item_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.order_item_commerce_state AS commerce
    WHERE commerce.order_item_id = p_order_item_id
      AND commerce.state = 'fulfilled'
  );
$$;

ALTER FUNCTION public.review_commerce_is_fulfilled(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.review_commerce_is_fulfilled(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- RLS is enabled and no client policies are created. Table SELECT is revoked,
-- so user_id and order_id are not readable through the tables. Authorized
-- fields are returned only by the read functions below.

-- ---------------------------------------------------------------------------
-- Commerce writer. Not called by finalize_paid_order.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_order_item_commerce_state(
  p_order_item_id uuid,
  p_state text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_order_id uuid;
  v_status text;
  v_completed_at timestamptz;
  v_finalized_at timestamptz;
  v_prev text;
  v_review_id uuid;
  v_review_status text;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'commerce_state_server_only' USING ERRCODE = '42501';
  END IF;
  IF p_state NOT IN ('fulfilled', 'cancelled', 'refunded') THEN
    RAISE EXCEPTION 'commerce_state_invalid' USING ERRCODE = '23514';
  END IF;

  SELECT item.order_id
    INTO v_order_id
  FROM public.order_items AS item
  WHERE item.id = p_order_item_id
  FOR UPDATE;
  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'commerce_state_item_missing' USING ERRCODE = '23514';
  END IF;

  SELECT orders.status, orders.completed_at, orders.payment_finalized_at
    INTO v_status, v_completed_at, v_finalized_at
  FROM public.orders AS orders
  WHERE orders.id = v_order_id
  FOR UPDATE;

  -- Same lock order as create_review: item, order, commerce, review.
  SELECT commerce.state
    INTO v_prev
  FROM public.order_item_commerce_state AS commerce
  WHERE commerce.order_item_id = p_order_item_id
  FOR UPDATE;

  SELECT review.id, review.status
    INTO v_review_id, v_review_status
  FROM public.reviews AS review
  WHERE review.order_item_id = p_order_item_id
  FOR UPDATE;

  IF v_prev IN ('cancelled', 'refunded') AND p_state = 'fulfilled' THEN
    RAISE EXCEPTION 'commerce_state_resurrection_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_state = 'fulfilled' AND NOT (
    v_status = 'COMPLETED'
    AND v_completed_at IS NOT NULL
    AND v_finalized_at IS NOT NULL
    AND v_order_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'commerce_state_not_completed' USING ERRCODE = '42501';
  END IF;

  IF v_prev IS DISTINCT FROM p_state THEN
    IF v_prev IS NULL THEN
      INSERT INTO public.order_item_commerce_state (
        order_item_id, order_id, state, source, updated_at
      ) VALUES (
        p_order_item_id, v_order_id, p_state, 'payment_server', pg_catalog.now()
      );
    ELSE
      UPDATE public.order_item_commerce_state
      SET state = p_state,
          source = 'payment_server',
          updated_at = pg_catalog.now()
      WHERE order_item_id = p_order_item_id;
    END IF;
  END IF;

  -- A repeated cancel or refund still hides a review created or re-approved earlier.
  IF p_state IN ('cancelled', 'refunded')
     AND v_review_id IS NOT NULL
     AND v_review_status IS DISTINCT FROM 'deleted'
     AND v_review_status IS DISTINCT FROM 'hidden' THEN
    UPDATE public.reviews
    SET status = 'hidden',
        updated_at = pg_catalog.now()
    WHERE id = v_review_id;
    INSERT INTO public.review_moderation_events (
      review_id, actor_id, action, from_status, to_status
    ) VALUES (
      v_review_id,
      NULL,
      CASE WHEN p_state = 'cancelled' THEN 'commerce_cancelled' ELSE 'commerce_refunded' END,
      v_review_status,
      'hidden'
    );
  END IF;
END;
$$;

ALTER FUNCTION public.set_order_item_commerce_state(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_order_item_commerce_state(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_order_item_commerce_state(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_order_item_commerce_state(uuid, text) TO service_role;

COMMENT ON FUNCTION public.set_order_item_commerce_state(uuid, text) IS
  'NEW27 service_role boundary. Does not prove a Toss event by itself. '
  'The payment server may call it only after its own confirmation. Not wired here.';

-- ---------------------------------------------------------------------------
-- Customer RPCs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_review(
  p_order_item_id uuid,
  p_rating integer,
  p_body text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_order_id uuid;
  v_product_id uuid;
  v_owner uuid;
  v_status text;
  v_completed_at timestamptz;
  v_finalized_at timestamptz;
  v_commerce text;
  v_review_id uuid;
  v_withdrawn timestamptz;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'review_auth_required' USING ERRCODE = '42501';
  END IF;
  v_uid := auth.uid();
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'review_rating_invalid' USING ERRCODE = '23514';
  END IF;
  IF p_body IS NULL OR char_length(btrim(p_body)) < 1 OR char_length(btrim(p_body)) > 4000 THEN
    RAISE EXCEPTION 'review_body_required' USING ERRCODE = '23514';
  END IF;

  SELECT profiles.withdrawn_at
    INTO v_withdrawn
  FROM public.profiles AS profiles
  WHERE profiles.id = v_uid;
  IF v_withdrawn IS NOT NULL THEN
    RAISE EXCEPTION 'withdrawn_subject_frozen' USING ERRCODE = '42501';
  END IF;

  -- Same lock order as set_order_item_commerce_state: item, order, commerce, review.
  SELECT item.order_id, item.product_id
    INTO v_order_id, v_product_id
  FROM public.order_items AS item
  WHERE item.id = p_order_item_id
  FOR UPDATE;
  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'review_not_eligible' USING ERRCODE = '42501';
  END IF;

  SELECT orders.user_id, orders.status, orders.completed_at, orders.payment_finalized_at
    INTO v_owner, v_status, v_completed_at, v_finalized_at
  FROM public.orders AS orders
  WHERE orders.id = v_order_id
  FOR UPDATE;
  IF v_owner IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'review_order_not_owned' USING ERRCODE = '42501';
  END IF;
  IF v_status IS DISTINCT FROM 'COMPLETED'
     OR v_completed_at IS NULL
     OR v_finalized_at IS NULL THEN
    RAISE EXCEPTION 'review_not_eligible' USING ERRCODE = '42501';
  END IF;

  SELECT commerce.state
    INTO v_commerce
  FROM public.order_item_commerce_state AS commerce
  WHERE commerce.order_item_id = p_order_item_id
  FOR UPDATE;
  IF v_commerce IS DISTINCT FROM 'fulfilled' THEN
    RAISE EXCEPTION 'review_not_eligible' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.reviews AS review
  WHERE review.order_item_id = p_order_item_id
  FOR UPDATE;
  IF FOUND THEN
    RAISE EXCEPTION 'review_entitlement_consumed' USING ERRCODE = '23505';
  END IF;

  BEGIN
    INSERT INTO public.reviews (
      order_item_id, order_id, user_id, product_id, rating, body, status
    ) VALUES (
      p_order_item_id, v_order_id, v_uid, v_product_id, p_rating, btrim(p_body), 'pending'
    )
    RETURNING id INTO v_review_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'review_entitlement_consumed' USING ERRCODE = '23505';
  END;

  INSERT INTO public.review_moderation_events (
    review_id, actor_id, action, from_status, to_status
  ) VALUES (
    v_review_id, v_uid, 'created', NULL, 'pending'
  );
  RETURN v_review_id;
END;
$$;

ALTER FUNCTION public.create_review(uuid, integer, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_review(uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_review(uuid, integer, text) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_review(uuid, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.edit_review(
  p_review_id uuid,
  p_rating integer,
  p_body text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_owner uuid;
  v_status text;
  v_item uuid;
  v_commerce text;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'review_auth_required' USING ERRCODE = '42501';
  END IF;
  v_uid := auth.uid();
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'review_rating_invalid' USING ERRCODE = '23514';
  END IF;
  IF p_body IS NULL OR char_length(btrim(p_body)) < 1 OR char_length(btrim(p_body)) > 4000 THEN
    RAISE EXCEPTION 'review_body_required' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.profiles AS profiles
    WHERE profiles.id = v_uid AND profiles.withdrawn_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'withdrawn_subject_frozen' USING ERRCODE = '42501';
  END IF;

  SELECT review.order_item_id
    INTO v_item
  FROM public.reviews AS review
  WHERE review.id = p_review_id;
  IF v_item IS NULL THEN
    RAISE EXCEPTION 'review_not_owner' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.order_items AS item WHERE item.id = v_item FOR UPDATE;
  SELECT commerce.state
    INTO v_commerce
  FROM public.order_item_commerce_state AS commerce
  WHERE commerce.order_item_id = v_item
  FOR UPDATE;
  SELECT review.user_id, review.status
    INTO v_owner, v_status
  FROM public.reviews AS review
  WHERE review.id = p_review_id
  FOR UPDATE;
  IF v_owner IS NULL OR v_owner IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'review_not_owner' USING ERRCODE = '42501';
  END IF;
  IF v_status = 'deleted' THEN
    RAISE EXCEPTION 'review_entitlement_consumed' USING ERRCODE = '42501';
  END IF;
  IF v_commerce IS DISTINCT FROM 'fulfilled' THEN
    RAISE EXCEPTION 'review_not_eligible' USING ERRCODE = '42501';
  END IF;

  UPDATE public.reviews
  SET rating = p_rating,
      body = btrim(p_body),
      status = 'pending',
      updated_at = pg_catalog.now()
  WHERE id = p_review_id;

  INSERT INTO public.review_moderation_events (
    review_id, actor_id, action, from_status, to_status
  ) VALUES (
    p_review_id, v_uid, 'edited', v_status, 'pending'
  );
END;
$$;

ALTER FUNCTION public.edit_review(uuid, integer, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.edit_review(uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.edit_review(uuid, integer, text) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.edit_review(uuid, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_review(p_review_id uuid)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_owner uuid;
  v_status text;
  v_paths text[];
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'review_auth_required' USING ERRCODE = '42501';
  END IF;
  v_uid := auth.uid();
  IF EXISTS (
    SELECT 1 FROM public.profiles AS profiles
    WHERE profiles.id = v_uid AND profiles.withdrawn_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'withdrawn_subject_frozen' USING ERRCODE = '42501';
  END IF;

  SELECT review.user_id, review.status
    INTO v_owner, v_status
  FROM public.reviews AS review
  WHERE review.id = p_review_id
  FOR UPDATE;
  IF v_owner IS NULL OR v_owner IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'review_not_owner' USING ERRCODE = '42501';
  END IF;
  IF v_status = 'deleted' THEN
    RETURN ARRAY[]::text[];
  END IF;

  SELECT coalesce(array_agg(img.object_path), ARRAY[]::text[])
    INTO v_paths
  FROM public.review_images AS img
  WHERE img.review_id = p_review_id;

  DELETE FROM public.review_images WHERE review_id = p_review_id;
  UPDATE public.reviews
  SET status = 'deleted',
      rating = NULL,
      body = NULL,
      updated_at = pg_catalog.now()
  WHERE id = p_review_id;
  INSERT INTO public.review_moderation_events (
    review_id, actor_id, action, from_status, to_status
  ) VALUES (
    p_review_id, v_uid, 'deleted', v_status, 'deleted'
  );
  RETURN v_paths;
END;
$$;

COMMENT ON FUNCTION public.delete_review(uuid) IS
  'Tombstones the review and returns object paths. SQL does not delete storage objects. '
  'The future server must delete every returned path. The unique order_item_id remains.';

ALTER FUNCTION public.delete_review(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.delete_review(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_review(uuid) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.delete_review(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.attach_review_image(
  p_review_id uuid,
  p_object_path text,
  p_content_type text,
  p_byte_size integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_status text;
  v_image_id uuid;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'review_image_server_only' USING ERRCODE = '42501';
  END IF;

  SELECT review.status
    INTO v_status
  FROM public.reviews AS review
  WHERE review.id = p_review_id
  FOR UPDATE;
  IF v_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'review_image_not_allowed' USING ERRCODE = '42501';
  END IF;
  IF p_content_type NOT IN ('image/jpeg', 'image/png', 'image/webp')
     OR p_byte_size IS NULL
     OR p_byte_size <= 0
     OR p_byte_size > 5242880
     OR p_object_path IS NULL
     OR p_object_path NOT LIKE 'reviews/' || p_review_id::text || '/%' THEN
    RAISE EXCEPTION 'review_image_not_allowed' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.review_images (review_id, object_path, content_type, byte_size)
  VALUES (p_review_id, p_object_path, p_content_type, p_byte_size)
  RETURNING id INTO v_image_id;
  RETURN v_image_id;
END;
$$;

COMMENT ON FUNCTION public.attach_review_image(uuid, text, text, integer) IS
  'service_role only. Records metadata after the storage validator accepts the object. '
  'This function does not read object bytes, magic bytes, or EXIF.';

ALTER FUNCTION public.attach_review_image(uuid, text, text, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.attach_review_image(uuid, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attach_review_image(uuid, text, text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_review_image(uuid, text, text, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.moderate_review(
  p_review_id uuid,
  p_action text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_status text;
  v_next text;
  v_item uuid;
  v_commerce text;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'review_auth_required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.profiles_is_current_user_admin() THEN
    RAISE EXCEPTION 'review_moderation_forbidden' USING ERRCODE = '42501';
  END IF;
  v_uid := auth.uid();
  IF EXISTS (
    SELECT 1 FROM public.profiles AS profiles
    WHERE profiles.id = v_uid AND profiles.withdrawn_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'withdrawn_subject_frozen' USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('approve', 'reject', 'hide') THEN
    RAISE EXCEPTION 'review_moderation_invalid' USING ERRCODE = '23514';
  END IF;

  SELECT review.order_item_id
    INTO v_item
  FROM public.reviews AS review
  WHERE review.id = p_review_id;
  IF v_item IS NULL THEN
    RAISE EXCEPTION 'review_moderation_forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.order_items AS item WHERE item.id = v_item FOR UPDATE;
  SELECT commerce.state
    INTO v_commerce
  FROM public.order_item_commerce_state AS commerce
  WHERE commerce.order_item_id = v_item
  FOR UPDATE;
  SELECT review.status
    INTO v_status
  FROM public.reviews AS review
  WHERE review.id = p_review_id
  FOR UPDATE;
  IF v_status IS NULL OR v_status = 'deleted' THEN
    RAISE EXCEPTION 'review_moderation_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_action = 'approve' AND v_commerce IS DISTINCT FROM 'fulfilled' THEN
    RAISE EXCEPTION 'review_not_eligible' USING ERRCODE = '42501';
  END IF;

  v_next := CASE p_action
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN 'rejected'
    WHEN 'hide' THEN 'hidden'
  END;

  UPDATE public.reviews
  SET status = v_next,
      updated_at = pg_catalog.now()
  WHERE id = p_review_id;
  INSERT INTO public.review_moderation_events (
    review_id, actor_id, action, from_status, to_status
  ) VALUES (
    p_review_id,
    v_uid,
    CASE p_action
      WHEN 'approve' THEN 'approved'
      WHEN 'reject' THEN 'rejected'
      ELSE 'hidden'
    END,
    v_status,
    v_next
  );
END;
$$;

ALTER FUNCTION public.moderate_review(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.moderate_review(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.moderate_review(uuid, text) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.moderate_review(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_review(
  p_review_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_status text;
  v_item uuid;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'review_auth_required' USING ERRCODE = '42501';
  END IF;
  v_uid := auth.uid();
  IF p_reason NOT IN ('spam', 'abuse', 'other') THEN
    RAISE EXCEPTION 'review_report_invalid' USING ERRCODE = '23514';
  END IF;

  SELECT review.status, review.order_item_id
    INTO v_status, v_item
  FROM public.reviews AS review
  WHERE review.id = p_review_id;
  IF v_status IS DISTINCT FROM 'approved' OR NOT public.review_commerce_is_fulfilled(v_item) THEN
    RAISE EXCEPTION 'review_report_not_public' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.profiles AS profiles
    WHERE profiles.id = v_uid AND profiles.withdrawn_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'withdrawn_subject_frozen' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.review_moderation_events (
    review_id, actor_id, action, reason_code, from_status, to_status
  ) VALUES (
    p_review_id, v_uid, 'reported', p_reason, v_status, v_status
  );
END;
$$;

COMMENT ON FUNCTION public.report_review(uuid, text) IS
  'Records a reason code only. The code is not the review body. No free-text report is stored.';

ALTER FUNCTION public.report_review(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.report_review(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_review(uuid, text) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.report_review(uuid, text) TO authenticated;

-- Withdrawal redaction. Not wired into NEW4-7. Service role only.
CREATE OR REPLACE FUNCTION public.redact_reviews_for_withdrawal(p_user_id uuid)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_paths text[];
  v_review record;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'review_redaction_server_only' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(array_agg(img.object_path), ARRAY[]::text[])
    INTO v_paths
  FROM public.review_images AS img
  JOIN public.reviews AS review ON review.id = img.review_id
  WHERE review.user_id = p_user_id;

  DELETE FROM public.review_images AS img
  USING public.reviews AS review
  WHERE img.review_id = review.id
    AND review.user_id = p_user_id;

  FOR v_review IN
    SELECT review.id, review.status
    FROM public.reviews AS review
    WHERE review.user_id = p_user_id
      AND review.status IS DISTINCT FROM 'deleted'
    FOR UPDATE
  LOOP
    UPDATE public.reviews
    SET status = 'deleted',
        rating = NULL,
        body = NULL,
        updated_at = pg_catalog.now()
    WHERE id = v_review.id;
    INSERT INTO public.review_moderation_events (
      review_id, actor_id, action, from_status, to_status
    ) VALUES (
      v_review.id, NULL, 'redacted', v_review.status, 'deleted'
    );
  END LOOP;
  RETURN v_paths;
END;
$$;

COMMENT ON FUNCTION public.redact_reviews_for_withdrawal(uuid) IS
  'NEW27: clears review text and image rows for a withdrawn subject. '
  'Keeps the order_item entitlement and the auth UUID. Does not delete storage objects. '
  'Not called by the existing withdrawal migration.';

ALTER FUNCTION public.redact_reviews_for_withdrawal(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.redact_reviews_for_withdrawal(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redact_reviews_for_withdrawal(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redact_reviews_for_withdrawal(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Reads. Explicit filters. Definer bypasses RLS, so predicates are repeated.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_public_reviews(
  p_product_id uuid,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  rating integer,
  body text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT review.id, review.rating, review.body, review.created_at
  FROM public.reviews AS review
  WHERE review.product_id = p_product_id
    AND review.product_id IS NOT NULL
    AND review.status = 'approved'
    AND public.review_commerce_is_fulfilled(review.order_item_id)
  ORDER BY review.created_at DESC
  LIMIT least(greatest(coalesce(p_limit, 20), 1), 20)
  OFFSET greatest(coalesce(p_offset, 0), 0);
$$;

ALTER FUNCTION public.list_public_reviews(uuid, integer, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_public_reviews(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_reviews(uuid, integer, integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.product_review_public_stats(p_product_id uuid)
RETURNS TABLE (
  approved_count bigint,
  average_rating numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT
    count(*)::bigint,
    round(avg(review.rating)::numeric, 2)
  FROM public.reviews AS review
  WHERE review.product_id = p_product_id
    AND review.product_id IS NOT NULL
    AND review.status = 'approved'
    AND review.rating IS NOT NULL
    AND public.review_commerce_is_fulfilled(review.order_item_id);
$$;

ALTER FUNCTION public.product_review_public_stats(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.product_review_public_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_review_public_stats(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_my_reviews()
RETURNS TABLE (
  id uuid,
  order_item_id uuid,
  product_id uuid,
  rating integer,
  body text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT
    review.id,
    review.order_item_id,
    review.product_id,
    review.rating,
    review.body,
    review.status,
    review.created_at,
    review.updated_at
  FROM public.reviews AS review
  WHERE coalesce(auth.role(), '') = 'authenticated'
    AND review.user_id = auth.uid()
    AND review.status IS DISTINCT FROM 'deleted'
    AND NOT EXISTS (
      SELECT 1
      FROM public.profiles AS profiles
      WHERE profiles.id = auth.uid()
        AND profiles.withdrawn_at IS NOT NULL
    )
  ORDER BY review.created_at DESC;
$$;

ALTER FUNCTION public.list_my_reviews() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_my_reviews() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_my_reviews() FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.list_my_reviews() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_admin_reviews()
RETURNS TABLE (
  id uuid,
  order_item_id uuid,
  product_id uuid,
  rating integer,
  body text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'authenticated'
     OR auth.uid() IS NULL
     OR NOT public.profiles_is_current_user_admin() THEN
    RAISE EXCEPTION 'review_moderation_forbidden' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.profiles AS profiles
    WHERE profiles.id = auth.uid() AND profiles.withdrawn_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'withdrawn_subject_frozen' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    review.id,
    review.order_item_id,
    review.product_id,
    review.rating,
    review.body,
    review.status,
    review.created_at,
    review.updated_at
  FROM public.reviews AS review
  WHERE review.status IS DISTINCT FROM 'deleted'
  ORDER BY review.created_at DESC;
END;
$$;

ALTER FUNCTION public.list_admin_reviews() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_admin_reviews() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.list_admin_reviews() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_admin_review_events(p_review_id uuid)
RETURNS TABLE (
  id uuid,
  action text,
  reason_code text,
  from_status text,
  to_status text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'authenticated'
     OR auth.uid() IS NULL
     OR NOT public.profiles_is_current_user_admin() THEN
    RAISE EXCEPTION 'review_moderation_forbidden' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.profiles AS profiles
    WHERE profiles.id = auth.uid() AND profiles.withdrawn_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'withdrawn_subject_frozen' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    event.id,
    event.action,
    event.reason_code,
    event.from_status,
    event.to_status,
    event.created_at
  FROM public.review_moderation_events AS event
  WHERE event.review_id = p_review_id
  ORDER BY event.created_at;
END;
$$;

ALTER FUNCTION public.list_admin_review_events(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_admin_review_events(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.list_admin_review_events(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.reviews_reject_mutation() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.review_images_limit_three() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reviews_product_matches_item() FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
