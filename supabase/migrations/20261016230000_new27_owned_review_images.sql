-- NEW27 additive owner-image read. Server only.
-- DRAFT. Do not apply until a separate write is approved.
-- Does not alter 20261015180000 or 20261016120000.
-- Does not grant table privileges.
-- There is no authenticated overload.

BEGIN;

CREATE OR REPLACE FUNCTION public.list_owned_review_images(
  p_review_id uuid,
  p_user_id uuid
)
RETURNS TABLE (
  image_id uuid,
  object_path text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'review_image_server_only' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'review_not_owner' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles AS profiles
    WHERE profiles.id = p_user_id AND profiles.withdrawn_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'withdrawn_subject_frozen' USING ERRCODE = '42501';
  END IF;

  SELECT review.user_id
    INTO v_owner
  FROM public.reviews AS review
  WHERE review.id = p_review_id;
  IF v_owner IS NULL OR v_owner IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'review_not_owner' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT img.id, img.object_path
  FROM public.review_images AS img
  WHERE img.review_id = p_review_id
    AND img.object_path ~ ('^reviews/' || p_review_id::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$')
  ORDER BY img.created_at;
END;
$$;

COMMENT ON FUNCTION public.list_owned_review_images(uuid, uuid) IS
  'service_role only. Returns image id and private path for a verified user id. '
  'The HTTP server supplies that user id from getUser and must not return the path.';

ALTER FUNCTION public.list_owned_review_images(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_owned_review_images(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_owned_review_images(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_owned_review_images(uuid, uuid) TO service_role;

COMMIT;
