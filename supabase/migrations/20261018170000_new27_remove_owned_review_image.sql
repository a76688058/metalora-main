-- NEW27 additive individual review-image removal. Server only.
-- DRAFT. Do not apply until a separate write is approved.
-- Does not alter 20261015180000, 20261016120000, or 20261016230000.
-- Does not grant table privileges, tombstone the review, or restore entitlement.

BEGIN;

CREATE TABLE public.review_image_removals (
  image_id uuid PRIMARY KEY,
  review_id uuid NOT NULL
    REFERENCES public.reviews (id) ON DELETE RESTRICT,
  object_path text NOT NULL
    CHECK (object_path ~ '^reviews/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'),
  removed_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT review_image_removals_path_review_ck
    CHECK (object_path LIKE 'reviews/' || review_id::text || '/%')
);

COMMENT ON TABLE public.review_image_removals IS
  'NEW27: one removed image stays unlistable. The path is for server storage retry only.';

ALTER TABLE public.review_image_removals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.review_image_removals FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.remove_owned_review_image(
  p_review_id uuid,
  p_image_id uuid,
  p_user_id uuid
)
RETURNS TABLE (
  already_removed boolean,
  object_path text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_owner uuid;
  v_status text;
  v_image_review uuid;
  v_path text;
BEGIN
  PERFORM public.review_api_guard('write');
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'review_image_server_only' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'review_not_owner' USING ERRCODE = '42501';
  END IF;
  IF p_review_id IS NULL OR p_image_id IS NULL THEN
    RAISE EXCEPTION 'review_image_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.profiles AS profiles
    WHERE profiles.id = p_user_id AND profiles.withdrawn_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'withdrawn_subject_frozen' USING ERRCODE = '42501';
  END IF;

  SELECT review.user_id, review.status
    INTO v_owner, v_status
  FROM public.reviews AS review
  WHERE review.id = p_review_id
  FOR UPDATE;
  IF v_owner IS NULL OR v_owner IS DISTINCT FROM p_user_id OR v_status = 'deleted' THEN
    RAISE EXCEPTION 'review_not_owner' USING ERRCODE = '42501';
  END IF;

  SELECT img.review_id, img.object_path
    INTO v_image_review, v_path
  FROM public.review_images AS img
  WHERE img.id = p_image_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_image_review IS DISTINCT FROM p_review_id
       OR v_path !~ ('^reviews/' || p_review_id::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$') THEN
      RAISE EXCEPTION 'review_image_not_found' USING ERRCODE = 'P0002';
    END IF;
    DELETE FROM public.review_images AS img
    WHERE img.id = p_image_id
      AND img.review_id = p_review_id;
    INSERT INTO public.review_image_removals (image_id, review_id, object_path)
    VALUES (p_image_id, p_review_id, v_path)
    ON CONFLICT (image_id) DO NOTHING;
    already_removed := false;
    object_path := v_path;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT removal.review_id, removal.object_path
    INTO v_image_review, v_path
  FROM public.review_image_removals AS removal
  WHERE removal.image_id = p_image_id;
  IF FOUND AND v_image_review IS NOT DISTINCT FROM p_review_id THEN
    already_removed := true;
    object_path := v_path;
    RETURN NEXT;
    RETURN;
  END IF;

  RAISE EXCEPTION 'review_image_not_found' USING ERRCODE = 'P0002';
END;
$$;

COMMENT ON FUNCTION public.remove_owned_review_image(uuid, uuid, uuid) IS
  'service_role only. Drops one image row and keeps the review, rating, status, and entitlement. '
  'Returns the private path to the server. Does not delete the storage object.';

ALTER FUNCTION public.remove_owned_review_image(uuid, uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.remove_owned_review_image(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_owned_review_image(uuid, uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_owned_review_image(uuid, uuid, uuid) TO service_role;

COMMIT;
