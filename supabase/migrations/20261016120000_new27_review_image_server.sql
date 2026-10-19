-- NEW27 supplemental review-image server contract.
-- DRAFT. Do not apply to hosted Supabase, payment-test, or production
-- until a separate write is approved. Does not alter 20261015180000.
-- Does not grant table privileges and does not bypass triggers.
-- Storage object deletion stays in the application server.

BEGIN;

CREATE TABLE public.review_image_cleanup_jobs (
  object_path text PRIMARY KEY
    CHECK (object_path ~ '^reviews/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'),
  review_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT review_image_cleanup_jobs_path_review_ck
    CHECK (object_path LIKE 'reviews/' || review_id::text || '/%')
);

COMMENT ON TABLE public.review_image_cleanup_jobs IS
  'NEW27: paths whose storage delete failed after the review tombstone. No customer identifiers.';

ALTER TABLE public.review_image_cleanup_jobs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.review_image_cleanup_jobs FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.prepare_review_image_attach(p_review_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_owner uuid;
  v_status text;
  v_count integer;
BEGIN
  PERFORM public.review_api_guard('write');
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
  IF v_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'review_image_not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::integer
    INTO v_count
  FROM public.review_images AS img
  WHERE img.review_id = p_review_id;
  IF v_count >= 3 THEN
    RAISE EXCEPTION 'review_image_limit' USING ERRCODE = '23514';
  END IF;
  RETURN v_count;
END;
$$;

ALTER FUNCTION public.prepare_review_image_attach(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.prepare_review_image_attach(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prepare_review_image_attach(uuid) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.prepare_review_image_attach(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_owned_review_image_paths(p_review_id uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_owner uuid;
  v_paths text[];
BEGIN
  PERFORM public.review_api_guard('read');
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

  SELECT review.user_id
    INTO v_owner
  FROM public.reviews AS review
  WHERE review.id = p_review_id;
  IF v_owner IS NULL OR v_owner IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'review_not_owner' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(array_agg(img.object_path), ARRAY[]::text[])
    INTO v_paths
  FROM public.review_images AS img
  WHERE img.review_id = p_review_id
    AND img.object_path ~ ('^reviews/' || p_review_id::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$');
  RETURN v_paths;
END;
$$;

ALTER FUNCTION public.list_owned_review_image_paths(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_owned_review_image_paths(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_owned_review_image_paths(uuid) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.list_owned_review_image_paths(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_public_review_image_ids(p_review_ids uuid[])
RETURNS TABLE (
  review_id uuid,
  image_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM public.review_api_guard('read');
  RETURN QUERY
  SELECT img.review_id, img.id
  FROM public.review_images AS img
  JOIN public.reviews AS review ON review.id = img.review_id
  WHERE img.review_id = ANY (coalesce(p_review_ids, ARRAY[]::uuid[]))
    AND cardinality(coalesce(p_review_ids, ARRAY[]::uuid[])) <= 20
    AND review.status = 'approved'
    AND review.product_id IS NOT NULL
    AND public.review_commerce_is_fulfilled(review.order_item_id);
END;
$$;

ALTER FUNCTION public.list_public_review_image_ids(uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_public_review_image_ids(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_review_image_ids(uuid[]) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.review_public_image_object_path(p_image_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_path text;
BEGIN
  PERFORM public.review_api_guard('read');
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'review_image_server_only' USING ERRCODE = '42501';
  END IF;

  SELECT img.object_path
    INTO v_path
  FROM public.review_images AS img
  JOIN public.reviews AS review ON review.id = img.review_id
  WHERE img.id = p_image_id
    AND review.status = 'approved'
    AND review.product_id IS NOT NULL
    AND public.review_commerce_is_fulfilled(review.order_item_id)
    AND img.object_path ~ ('^reviews/' || review.id::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$');
  RETURN v_path;
END;
$$;

ALTER FUNCTION public.review_public_image_object_path(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.review_public_image_object_path(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_public_image_object_path(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_public_image_object_path(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.queue_review_image_cleanup(
  p_review_id uuid,
  p_paths text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_path text;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'review_image_server_only' USING ERRCODE = '42501';
  END IF;
  IF p_review_id IS NULL THEN
    RAISE EXCEPTION 'review_image_not_allowed' USING ERRCODE = '23514';
  END IF;

  FOREACH v_path IN ARRAY coalesce(p_paths, ARRAY[]::text[]) LOOP
    IF v_path ~ ('^reviews/' || p_review_id::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$') THEN
      INSERT INTO public.review_image_cleanup_jobs (object_path, review_id)
      VALUES (v_path, p_review_id)
      ON CONFLICT (object_path) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

ALTER FUNCTION public.queue_review_image_cleanup(uuid, text[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.queue_review_image_cleanup(uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.queue_review_image_cleanup(uuid, text[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_review_image_cleanup(uuid, text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.list_review_image_cleanup_jobs(p_review_id uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_paths text[];
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'review_image_server_only' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(array_agg(job.object_path), ARRAY[]::text[])
    INTO v_paths
  FROM public.review_image_cleanup_jobs AS job
  WHERE job.review_id = p_review_id;
  RETURN v_paths;
END;
$$;

ALTER FUNCTION public.list_review_image_cleanup_jobs(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_review_image_cleanup_jobs(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_review_image_cleanup_jobs(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_review_image_cleanup_jobs(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_review_image_cleanup(
  p_review_id uuid,
  p_paths text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'review_image_server_only' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.review_image_cleanup_jobs AS job
  WHERE job.review_id = p_review_id
    AND job.object_path = ANY (coalesce(p_paths, ARRAY[]::text[]));
END;
$$;

ALTER FUNCTION public.complete_review_image_cleanup(uuid, text[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.complete_review_image_cleanup(uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_review_image_cleanup(uuid, text[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_review_image_cleanup(uuid, text[]) TO service_role;

COMMIT;
