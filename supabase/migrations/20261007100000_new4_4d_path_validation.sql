-- NEW4-4D-3 — Workshop reference path validation (transition / dual-format)
-- Prepared only. NOT applied by NEW4-4D-3. Requires owner approval + A6 apply ticket.
--
-- Apply ordering (see docs/decisions/NEW4-4D_workshop-private-gcs.md):
--   1. server adapter + /api/workshop-media/* deployed (NEW4-4D-3 code)
--   2. THIS migration (accepts canonical own path OR exact own legacy Supabase public URL)
--   3. client consumers switch to canonical paths (A0/A2/A3 tickets)
--   4. later tightening migration: canonical own path only (after legacy TTL)
-- Applying this before step 3 keeps the current client working: it already writes
-- `https://qifloweuwyhvukabgnoa.supabase.co/storage/v1/object/public/workshop/<own canonical>`.
--
-- Scope:
--   - workshop_ref_is_own_canonical(ref, kind): canonical `originals/{auth.uid()}/{uuid}.{jpg|jpeg|png|webp}`
--     or `previews/{auth.uid()}/{uuid}.jpg`; no scheme, query, %, traversal, backslash, double slash
--   - workshop_ref_is_own_legacy_supabase(ref, kind): exact production public-bucket URL of the same path
--   - workshop_ref_is_accepted(ref, kind): transition union of the two
--   - add_custom_cart_item(): closes the "any non-empty string" image gap
--   - cart_items / user_progress BEFORE INSERT/UPDATE guard for authenticated writers:
--       INSERT validates every non-blank Workshop image field
--       UPDATE validates only fields whose value changed (pre-existing rows stay editable)
--       service_role (server retention/withdrawal cleanup) is not restricted
-- custom_cart_payload_is_complete_v1() is intentionally unchanged: it is IMMUTABLE structural
-- validation also evaluated for service-role writes; reference ownership is enforced by the guard.
-- Does NOT: mutate existing rows, touch storage.objects / buckets, change prices or the v1 stamp.

BEGIN;

CREATE OR REPLACE FUNCTION public.workshop_ref_is_own_canonical(
  p_ref text,
  p_expected_kind text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid text;
  v_uuid constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  v_pattern text;
BEGIN
  v_uid := (SELECT auth.uid())::text;
  IF v_uid IS NULL OR p_ref IS NULL THEN
    RETURN false;
  END IF;
  IF length(p_ref) > 256
     OR position('%' IN p_ref) > 0
     OR position('\' IN p_ref) > 0
     OR position('..' IN p_ref) > 0
     OR position('//' IN p_ref) > 0
     OR position('?' IN p_ref) > 0
     OR position('#' IN p_ref) > 0
     OR position(':' IN p_ref) > 0
     OR p_ref ~ '\s' THEN
    RETURN false;
  END IF;

  IF p_expected_kind = 'original' THEN
    v_pattern := '^originals/' || v_uid || '/' || v_uuid || '\.(jpg|jpeg|png|webp)$';
  ELSIF p_expected_kind = 'preview' THEN
    v_pattern := '^previews/' || v_uid || '/' || v_uuid || '\.jpg$';
  ELSE
    RETURN false;
  END IF;

  RETURN p_ref ~ v_pattern;
END;
$$;

CREATE OR REPLACE FUNCTION public.workshop_ref_is_own_legacy_supabase(
  p_ref text,
  p_expected_kind text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_prefix constant text := 'https://qifloweuwyhvukabgnoa.supabase.co/storage/v1/object/public/workshop/';
BEGIN
  IF p_ref IS NULL OR left(p_ref, length(v_prefix)) <> v_prefix THEN
    RETURN false;
  END IF;
  RETURN public.workshop_ref_is_own_canonical(substr(p_ref, length(v_prefix) + 1), p_expected_kind);
END;
$$;

CREATE OR REPLACE FUNCTION public.workshop_ref_is_accepted(
  p_ref text,
  p_expected_kind text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT COALESCE(
    public.workshop_ref_is_own_canonical(p_ref, p_expected_kind)
      OR public.workshop_ref_is_own_legacy_supabase(p_ref, p_expected_kind),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.workshop_ref_is_own_canonical(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.workshop_ref_is_own_canonical(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.workshop_ref_is_own_canonical(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workshop_ref_is_own_canonical(text, text) TO service_role;

REVOKE ALL ON FUNCTION public.workshop_ref_is_own_legacy_supabase(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.workshop_ref_is_own_legacy_supabase(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.workshop_ref_is_own_legacy_supabase(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workshop_ref_is_own_legacy_supabase(text, text) TO service_role;

REVOKE ALL ON FUNCTION public.workshop_ref_is_accepted(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.workshop_ref_is_accepted(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.workshop_ref_is_accepted(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workshop_ref_is_accepted(text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- add_custom_cart_item — same contract as 2B-5A plus own-reference validation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_custom_cart_item(
  p_quantity integer,
  p_orientation text,
  p_original_image_url text,
  p_preview_image_url text,
  p_custom_config jsonb DEFAULT '{}'::jsonb
)
RETURNS public.cart_items
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_row public.cart_items;
  v_cfg jsonb;
  v_original text;
  v_preview text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF p_quantity IS NULL OR p_quantity < 1 THEN
    RAISE EXCEPTION 'invalid quantity';
  END IF;

  v_original := btrim(COALESCE(p_original_image_url, ''));
  v_preview := btrim(COALESCE(p_preview_image_url, ''));
  IF v_original = '' THEN
    RAISE EXCEPTION 'original image required';
  END IF;
  IF v_preview = '' THEN
    RAISE EXCEPTION 'preview image required';
  END IF;
  IF v_original = v_preview THEN
    RAISE EXCEPTION 'preview image must be distinct from original';
  END IF;
  IF NOT public.workshop_ref_is_accepted(v_original, 'original') THEN
    RAISE EXCEPTION 'invalid original image reference';
  END IF;
  IF NOT public.workshop_ref_is_accepted(v_preview, 'preview') THEN
    RAISE EXCEPTION 'invalid preview image reference';
  END IF;

  IF p_orientation IS NULL OR p_orientation NOT IN ('portrait', 'landscape') THEN
    RAISE EXCEPTION 'invalid orientation';
  END IF;

  v_cfg := COALESCE(p_custom_config, '{}'::jsonb);
  IF jsonb_typeof(v_cfg) <> 'object' THEN
    RAISE EXCEPTION 'invalid custom_config';
  END IF;

  v_cfg := v_cfg
    - 'price'
    - 'price_snapshot'
    - 'price_snapshot_version'
    - 'price_snapshot_source'
    - 'shaderType'
    - 'size'
    - 'original_image_url'
    - 'preview_image_url';

  v_cfg := v_cfg || jsonb_build_object(
    'shaderType', '커스텀 제작',
    'size', 'M',
    'orientation', p_orientation,
    'original_image_url', v_original,
    'preview_image_url', v_preview
  );

  IF NOT COALESCE(
    public.custom_cart_payload_is_complete_v1(p_orientation, v_cfg),
    false
  ) THEN
    RAISE EXCEPTION 'incomplete custom snapshot';
  END IF;

  INSERT INTO public.cart_items (
    user_id,
    product_id,
    selected_option,
    quantity,
    orientation,
    custom_image,
    custom_config
  ) VALUES (
    v_uid,
    'workshop-single',
    'M',
    p_quantity,
    p_orientation,
    v_preview,
    v_cfg
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.add_custom_cart_item(integer, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_custom_cart_item(integer, text, text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.add_custom_cart_item(integer, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_custom_cart_item(integer, text, text, text, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- Direct authenticated writes. Trigger name sorts after trg_cart_items_stamp_custom_m_price,
-- so it validates the post-stamp row (v1 UPDATE resets image fields to OLD → unchanged).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.workshop_ref_guard_changed(
  p_new text,
  p_old text,
  p_is_insert boolean,
  p_kind text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT CASE
    WHEN nullif(btrim(COALESCE(p_new, '')), '') IS NULL THEN true
    WHEN NOT p_is_insert AND p_new IS NOT DISTINCT FROM p_old THEN true
    ELSE public.workshop_ref_is_accepted(btrim(p_new), p_kind)
  END;
$$;

REVOKE ALL ON FUNCTION public.workshop_ref_guard_changed(text, text, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.workshop_ref_guard_changed(text, text, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.workshop_ref_guard_changed(text, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workshop_ref_guard_changed(text, text, boolean, text) TO service_role;

CREATE OR REPLACE FUNCTION public.cart_items_workshop_ref_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_insert boolean := (TG_OP = 'INSERT');
  v_new_cfg jsonb;
  v_old_cfg jsonb;
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  v_new_cfg := CASE WHEN jsonb_typeof(NEW.custom_config) = 'object' THEN NEW.custom_config END;
  v_old_cfg := CASE
    WHEN NOT v_insert AND jsonb_typeof(OLD.custom_config) = 'object' THEN OLD.custom_config
  END;

  IF NOT public.workshop_ref_guard_changed(
       NEW.custom_image,
       CASE WHEN v_insert THEN NULL ELSE OLD.custom_image END,
       v_insert,
       'preview')
     OR NOT public.workshop_ref_guard_changed(
       v_new_cfg->>'preview_image_url', v_old_cfg->>'preview_image_url', v_insert, 'preview')
     OR NOT public.workshop_ref_guard_changed(
       v_new_cfg->>'original_image_url', v_old_cfg->>'original_image_url', v_insert, 'original') THEN
    RAISE EXCEPTION 'invalid workshop image reference' USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cart_items_workshop_ref_guard ON public.cart_items;
CREATE TRIGGER trg_cart_items_workshop_ref_guard
  BEFORE INSERT OR UPDATE ON public.cart_items
  FOR EACH ROW
  EXECUTE FUNCTION public.cart_items_workshop_ref_guard();

CREATE OR REPLACE FUNCTION public.user_progress_workshop_ref_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NOT public.workshop_ref_guard_changed(
       NEW.uploaded_image_url,
       CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.uploaded_image_url END,
       TG_OP = 'INSERT',
       'original') THEN
    RAISE EXCEPTION 'invalid workshop image reference' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_progress_workshop_ref_guard ON public.user_progress;
CREATE TRIGGER trg_user_progress_workshop_ref_guard
  BEFORE INSERT OR UPDATE ON public.user_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.user_progress_workshop_ref_guard();

COMMIT;
