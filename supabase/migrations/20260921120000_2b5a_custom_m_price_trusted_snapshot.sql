-- NEW 2B-5A — Custom M price authority + trusted cart snapshot
-- Prepared for shared Supabase (production + metalora-cursor-test).
-- NOT applied from this ticket. Requires USER APPROVAL before production apply.
-- No deploy.
--
-- Scope:
--   - site_settings key custom_m_price (seed 49000 from current server/workshop authority)
--   - get_custom_m_price()
--   - complete v1 production predicate (images + orientation + composition + source size)
--   - BEFORE INSERT/UPDATE trigger:
--       complete Custom INSERT → trusted v1 stamp
--       incomplete Custom INSERT → legacy/non-v1 (live display price, markers stripped)
--       v1 UPDATE freezes production snapshot including created_at; quantity remains mutable
--   - add_custom_cart_item() RPC: fail closed unless complete v1 payload
--     custom_image = preview_image_url (Cart/PDP display alias)
--     custom_config.original_image_url = durable print master
--     custom_config.preview_image_url = same URL as custom_image
-- Does NOT:
--   - add cart columns
--   - create a catalog fake product
--   - mutate existing cart_items rows
--   - change storage.objects ACL
--   - apply itself to live

BEGIN;

-- ---------------------------------------------------------------------------
-- Live admin-current Custom M selling price (text KRW integer, existing schema)
-- ---------------------------------------------------------------------------
INSERT INTO public.site_settings (key, value)
VALUES ('custom_m_price', '49000')
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.site_settings IS
  'Keyed site configuration. custom_m_price is the admin-current Custom M unit price in KRW.';

-- ---------------------------------------------------------------------------
-- Read helper — used by stamp trigger, RPC (via trigger), and optional clients
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_custom_m_price()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_raw text;
  v_price integer;
BEGIN
  SELECT s.value
    INTO v_raw
  FROM public.site_settings AS s
  WHERE s.key = 'custom_m_price';

  IF v_raw IS NULL THEN
    RAISE EXCEPTION 'custom_m_price is not configured';
  END IF;

  BEGIN
    v_price := btrim(v_raw)::integer;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'custom_m_price is invalid';
  END;

  IF v_price < 1 THEN
    RAISE EXCEPTION 'custom_m_price is invalid';
  END IF;

  RETURN v_price;
END;
$$;

REVOKE ALL ON FUNCTION public.get_custom_m_price() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_custom_m_price() TO anon;
GRANT EXECUTE ON FUNCTION public.get_custom_m_price() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_custom_m_price() TO service_role;

-- ---------------------------------------------------------------------------
-- Complete Custom v1 production snapshot (not merely two image URLs)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.custom_cart_payload_is_complete_v1(
  p_orientation text,
  p_cfg jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_original text;
  v_preview text;
  v_comp jsonb;
  v_sw numeric;
  v_sh numeric;
BEGIN
  IF p_orientation IS NULL OR p_orientation NOT IN ('portrait', 'landscape') THEN
    RETURN false;
  END IF;
  IF p_cfg IS NULL OR jsonb_typeof(p_cfg) <> 'object' THEN
    RETURN false;
  END IF;

  v_original := nullif(btrim(COALESCE(p_cfg->>'original_image_url', '')), '');
  v_preview := nullif(btrim(COALESCE(p_cfg->>'preview_image_url', '')), '');
  IF v_original IS NULL OR v_preview IS NULL OR v_original = v_preview THEN
    RETURN false;
  END IF;

  v_comp := p_cfg->'composition';
  IF v_comp IS NULL OR jsonb_typeof(v_comp) <> 'object' THEN
    RETURN false;
  END IF;

  IF jsonb_typeof(v_comp->'version') <> 'number'
     OR (v_comp->>'version')::numeric <> 1 THEN
    RETURN false;
  END IF;

  IF COALESCE(v_comp->>'orientation', '') <> p_orientation THEN
    RETURN false;
  END IF;

  IF jsonb_typeof(v_comp->'zoom') <> 'number'
     OR jsonb_typeof(v_comp->'offsetX') <> 'number'
     OR jsonb_typeof(v_comp->'offsetY') <> 'number' THEN
    RETURN false;
  END IF;

  PERFORM (v_comp->>'zoom')::numeric;
  PERFORM (v_comp->>'offsetX')::numeric;
  PERFORM (v_comp->>'offsetY')::numeric;

  IF jsonb_typeof(p_cfg->'source_width') <> 'number'
     OR jsonb_typeof(p_cfg->'source_height') <> 'number' THEN
    RETURN false;
  END IF;

  v_sw := (p_cfg->>'source_width')::numeric;
  v_sh := (p_cfg->>'source_height')::numeric;
  IF v_sw IS NULL OR v_sh IS NULL OR v_sw <= 0 OR v_sh <= 0 THEN
    RETURN false;
  END IF;

  RETURN true;
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.custom_cart_payload_is_complete_v1(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.custom_cart_payload_is_complete_v1(text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.custom_cart_payload_is_complete_v1(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.custom_cart_payload_is_complete_v1(text, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- Complete Custom INSERT → v1 stamp. Incomplete → legacy/non-v1.
-- v1 UPDATE freezes production snapshot. Quantity remains client-mutable.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cart_items_stamp_custom_m_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_cfg jsonb;
  v_price integer;
  v_is_custom boolean;
  v_old_trusted boolean;
  v_complete boolean;
  v_preview text;
BEGIN
  v_old_trusted := (
    TG_OP = 'UPDATE'
    AND OLD.custom_config IS NOT NULL
    AND jsonb_typeof(OLD.custom_config) = 'object'
    AND OLD.custom_config->>'shaderType' = '커스텀 제작'
    AND OLD.custom_config->>'price_snapshot_version' = '1'
    AND OLD.custom_config->>'price_snapshot_source' = 'custom_m_price'
  );

  IF v_old_trusted THEN
    NEW.user_id := OLD.user_id;
    NEW.product_id := 'workshop-single';
    NEW.selected_option := OLD.selected_option;
    NEW.orientation := OLD.orientation;
    NEW.custom_image := OLD.custom_image;
    NEW.custom_config := OLD.custom_config;
    NEW.created_at := OLD.created_at;
    RETURN NEW;
  END IF;

  v_is_custom := (
    (NEW.product_id IS NULL OR NEW.product_id = 'workshop-single')
    AND NEW.custom_config IS NOT NULL
    AND jsonb_typeof(NEW.custom_config) = 'object'
    AND NEW.custom_config->>'shaderType' = '커스텀 제작'
  );

  IF NOT v_is_custom THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_cfg := COALESCE(
      CASE WHEN jsonb_typeof(NEW.custom_config) = 'object' THEN NEW.custom_config END,
      '{}'::jsonb
    );
    NEW.custom_config := v_cfg - 'price_snapshot_version' - 'price_snapshot_source';
    RETURN NEW;
  END IF;

  v_cfg := NEW.custom_config;
  v_cfg := v_cfg
    - 'price_snapshot_version'
    - 'price_snapshot_source'
    - 'price_snapshot';
  v_price := public.get_custom_m_price();
  v_complete := COALESCE(
    public.custom_cart_payload_is_complete_v1(NEW.orientation, v_cfg),
    false
  );

  IF v_complete THEN
    v_preview := nullif(btrim(COALESCE(v_cfg->>'preview_image_url', '')), '');
    NEW.product_id := 'workshop-single';
    NEW.selected_option := 'M';
    IF v_preview IS NOT NULL THEN
      NEW.custom_image := v_preview;
    END IF;
    NEW.custom_config := (v_cfg - 'price') || jsonb_build_object(
      'shaderType', '커스텀 제작',
      'size', 'M',
      'price', v_price,
      'price_snapshot', v_price,
      'price_snapshot_version', '1',
      'price_snapshot_source', 'custom_m_price'
    );
  ELSE
    NEW.custom_config := (v_cfg - 'price') || jsonb_build_object(
      'shaderType', '커스텀 제작',
      'price', v_price
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cart_items_stamp_custom_m_price ON public.cart_items;

CREATE TRIGGER trg_cart_items_stamp_custom_m_price
  BEFORE INSERT OR UPDATE ON public.cart_items
  FOR EACH ROW
  EXECUTE FUNCTION public.cart_items_stamp_custom_m_price();

-- ---------------------------------------------------------------------------
-- A2 callable insert — complete v1 only. Incomplete payload fails; no row.
-- custom_image = preview. original_image_url = print master.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.add_custom_cart_item(integer, text, text, jsonb);

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

COMMIT;
