-- Generated #18C-1E-R2 from metalora-live-public-ddl.csv
-- Payload: ddl_utf8_b64 decoded in stmt_no order. Do not apply to production.
-- Apply only to empty metalora-payment-test after UTF-8/hash verification.

CREATE TABLE IF NOT EXISTS public.banners (id uuid NOT NULL DEFAULT gen_random_uuid(), content text NOT NULL, is_active boolean NOT NULL DEFAULT true, display_order integer NOT NULL DEFAULT 0, created_at timestamp with time zone DEFAULT timezone('utc'::text, now()));
CREATE TABLE IF NOT EXISTS public.cart_items (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, product_id text NOT NULL, selected_option text NOT NULL, quantity integer NOT NULL DEFAULT 1, created_at timestamp with time zone DEFAULT now(), custom_image text, custom_config jsonb, orientation text);
CREATE TABLE IF NOT EXISTS public.collections (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid, product_id uuid, item_image text NOT NULL, metadata jsonb NOT NULL, created_at timestamp with time zone DEFAULT timezone('utc'::text, now()));
CREATE TABLE IF NOT EXISTS public.cs_inquiries (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, title text NOT NULL, content text NOT NULL, answer text, status text DEFAULT '답변대기'::text, created_at timestamp with time zone DEFAULT now());
CREATE TABLE IF NOT EXISTS public.order_items (id uuid NOT NULL DEFAULT gen_random_uuid(), order_id uuid NOT NULL, product_id uuid, product_title text, quantity integer NOT NULL DEFAULT 1, price integer NOT NULL DEFAULT 0, created_at timestamp with time zone DEFAULT now(), option text, orientation text);
CREATE TABLE IF NOT EXISTS public.orders (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, order_number text NOT NULL, status text DEFAULT 'PENDING'::text, total_price numeric NOT NULL DEFAULT 0, shipping_info jsonb DEFAULT '{}'::jsonb, ordered_items jsonb DEFAULT '[]'::jsonb, tracking_number text, courier text, created_at timestamp with time zone DEFAULT now(), address text, address_detail text, zip_code text, shipping_name text, shipping_phone text, user_custom_id text, "paymentKey" text, method text, shipping_address text, recipient_name text, recipient_phone text, payment_finalized_at timestamp with time zone);
CREATE TABLE IF NOT EXISTS public.payment_intents (order_number text NOT NULL, user_id uuid NOT NULL, user_custom_id text NOT NULL, total_price numeric NOT NULL, validated_snapshot jsonb NOT NULL, created_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.products (id uuid NOT NULL DEFAULT gen_random_uuid(), title text NOT NULL, subtitle text, description text, created_at timestamp with time zone DEFAULT now(), options jsonb DEFAULT '[]'::jsonb, front_image text, back_image text, is_new boolean DEFAULT false, is_limited boolean DEFAULT false, is_sale boolean, is_visible boolean, display_order integer DEFAULT 0, landscape_image text, supported_orientations jsonb DEFAULT '["portrait"]'::jsonb, landscape_back_image text);
CREATE TABLE IF NOT EXISTS public.profiles (id uuid NOT NULL, full_name text, phone_number text, zip_code text, address text, total_spent numeric NOT NULL DEFAULT 0, updated_at timestamp with time zone DEFAULT now(), user_custom_id text, address_detail text, is_admin boolean NOT NULL DEFAULT false, agreed_to_terms_at timestamp with time zone, agreed_to_privacy_at timestamp with time zone, agreed_to_cookie_at timestamp with time zone);
CREATE TABLE IF NOT EXISTS public.site_settings (key text NOT NULL, value text NOT NULL, updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()));
CREATE TABLE IF NOT EXISTS public.user_agreements (id uuid NOT NULL DEFAULT uuid_generate_v4(), user_id uuid NOT NULL, agreement_version text NOT NULL, agreed_at timestamp with time zone NOT NULL DEFAULT now(), ip_address text NOT NULL);
CREATE TABLE IF NOT EXISTS public.user_progress (user_id uuid NOT NULL, current_step integer DEFAULT 1, selected_material text DEFAULT 'Aluminum'::text, selected_size text DEFAULT 'A4'::text, uploaded_image_url text, updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()));
CREATE OR REPLACE FUNCTION public.finalize_paid_order(p_verified_user_id uuid, p_user_custom_id text, p_order_number text, p_total_price numeric, p_paid_amount numeric, p_shipping_name text, p_shipping_phone text, p_zip_code text, p_address text, p_address_detail text, p_ordered_items jsonb, p_shipping_info jsonb, p_order_items jsonb)
 RETURNS TABLE(order_id uuid, order_number text, already_finalized boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_existing public.orders%ROWTYPE;
  v_order_id uuid;
  v_item_count integer;
  v_inserted_items integer;
  v_profile_updates integer;
BEGIN
  IF p_verified_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid payment finalization request';
  END IF;

  IF p_user_custom_id IS NULL OR btrim(p_user_custom_id) = '' THEN
    RAISE EXCEPTION 'Invalid payment finalization request';
  END IF;

  IF p_order_number IS NULL OR btrim(p_order_number) = '' THEN
    RAISE EXCEPTION 'Invalid payment finalization request';
  END IF;

  IF p_total_price IS NULL OR p_paid_amount IS NULL OR p_paid_amount < 0 OR p_total_price < 0 THEN
    RAISE EXCEPTION 'Invalid payment finalization request';
  END IF;

  IF p_paid_amount IS DISTINCT FROM p_total_price THEN
    RAISE EXCEPTION 'Invalid payment finalization request';
  END IF;

  IF p_order_items IS NULL OR jsonb_typeof(p_order_items) <> 'array' THEN
    RAISE EXCEPTION 'Invalid payment finalization request';
  END IF;

  v_item_count := jsonb_array_length(p_order_items);
  IF v_item_count IS NULL OR v_item_count < 1 THEN
    RAISE EXCEPTION 'Invalid payment finalization request';
  END IF;

  -- Serialize concurrent finalization for the same order_number (works before row exists).
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('finalize_paid_order:' || p_order_number)
  );

  SELECT o.*
  INTO v_existing
  FROM public.orders AS o
  WHERE o.order_number = p_order_number
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.user_id IS DISTINCT FROM p_verified_user_id THEN
      RAISE EXCEPTION 'Order ownership mismatch';
    END IF;

    IF v_existing.payment_finalized_at IS NOT NULL THEN
      IF v_existing.total_price IS DISTINCT FROM p_total_price THEN
        RAISE EXCEPTION 'Order finalization amount mismatch';
      END IF;

      order_id := v_existing.id;
      order_number := v_existing.order_number;
      already_finalized := true;
      RETURN NEXT;
      RETURN;
    END IF;

    RAISE EXCEPTION 'Order requires recovery before finalization';
  END IF;

  INSERT INTO public.orders (
    order_number,
    user_id,
    user_custom_id,
    status,
    total_price,
    shipping_name,
    shipping_phone,
    zip_code,
    address,
    address_detail,
    ordered_items,
    shipping_info
  )
  VALUES (
    p_order_number,
    p_verified_user_id,
    p_user_custom_id,
    'PAID',
    p_total_price,
    COALESCE(p_shipping_name, '고객'),
    COALESCE(p_shipping_phone, ''),
    COALESCE(p_zip_code, ''),
    COALESCE(p_address, ''),
    COALESCE(p_address_detail, ''),
    p_ordered_items,
    p_shipping_info
  )
  RETURNING public.orders.id INTO v_order_id;

  INSERT INTO public.order_items (
    order_id,
    product_id,
    product_title,
    quantity,
    price,
    option,
    orientation,
    created_at
  )
  SELECT
    v_order_id,
    CASE
      WHEN elem->>'product_id' IS NULL OR btrim(elem->>'product_id') = '' THEN NULL
      ELSE (elem->>'product_id')::uuid
    END,
    COALESCE(NULLIF(btrim(elem->>'product_title'), ''), '제품'),
    (elem->>'quantity')::integer,
    (elem->>'price')::numeric,
    COALESCE(NULLIF(btrim(elem->>'option'), ''), '기본'),
    NULLIF(btrim(elem->>'orientation'), ''),
    pg_catalog.now()
  FROM jsonb_array_elements(p_order_items) AS elem;

  GET DIAGNOSTICS v_inserted_items = ROW_COUNT;
  IF v_inserted_items IS NULL OR v_inserted_items <> v_item_count THEN
    RAISE EXCEPTION 'Order item persistence failed';
  END IF;

  UPDATE public.profiles
  SET total_spent = COALESCE(public.profiles.total_spent, 0) + p_paid_amount
  WHERE public.profiles.id = p_verified_user_id;

  GET DIAGNOSTICS v_profile_updates = ROW_COUNT;
  IF v_profile_updates <> 1 THEN
    RAISE EXCEPTION 'Profile update failed';
  END IF;

  UPDATE public.orders
  SET payment_finalized_at = pg_catalog.now()
  WHERE public.orders.id = v_order_id;

  order_id := v_order_id;
  order_number := p_order_number;
  already_finalized := false;
  RETURN NEXT;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_user_custom_id text;
BEGIN
  v_user_custom_id := NULLIF(btrim(NEW.raw_user_meta_data->>'user_custom_id'), '');

  IF NEW.email ILIKE '%@metalora.me' THEN
    IF v_user_custom_id IS NULL THEN
      RAISE EXCEPTION
        'member signup requires non-blank user_custom_id metadata';
    END IF;

    v_user_custom_id := lower(v_user_custom_id);

    IF v_user_custom_id !~ '^[a-z0-9][a-z0-9._-]{3,31}$' THEN
      RAISE EXCEPTION
        'member signup user_custom_id must be 4–32 chars: letters, digits, . _ -';
    END IF;
  END IF;

  INSERT INTO public.profiles (
    id,
    user_custom_id,
    full_name,
    phone_number,
    agreed_to_terms_at,
    agreed_to_privacy_at,
    agreed_to_cookie_at,
    updated_at
  )
  VALUES (
    NEW.id,
    v_user_custom_id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'phone_number',
    (NEW.raw_user_meta_data->>'agreed_to_terms_at')::timestamptz,
    (NEW.raw_user_meta_data->>'agreed_to_privacy_at')::timestamptz,
    (NEW.raw_user_meta_data->>'agreed_to_cookie_at')::timestamptz,
    NOW()
  );

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.profiles_guard_privileged_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF coalesce(auth.jwt() ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.is_admin := false;
    NEW.total_spent := 0;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.is_admin := OLD.is_admin;
    NEW.total_spent := OLD.total_spent;

    IF OLD.user_custom_id IS NOT NULL THEN
      NEW.user_custom_id := OLD.user_custom_id;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.profiles_is_current_user_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
      AND p.is_admin IS TRUE
  );
$function$
;
CREATE OR REPLACE FUNCTION public.profiles_username_exists(username text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE btrim(coalesce($1, '')) <> ''
      AND p.user_custom_id IS NOT NULL
      AND lower(p.user_custom_id) = lower(btrim($1))
  );
$function$
;
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;
ALTER TABLE public.banners ADD CONSTRAINT banners_pkey PRIMARY KEY (id);
ALTER TABLE public.cart_items ADD CONSTRAINT cart_items_pkey PRIMARY KEY (id);
ALTER TABLE public.collections ADD CONSTRAINT collections_pkey PRIMARY KEY (id);
ALTER TABLE public.cs_inquiries ADD CONSTRAINT cs_inquiries_pkey PRIMARY KEY (id);
ALTER TABLE public.order_items ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);
ALTER TABLE public.orders ADD CONSTRAINT orders_pkey PRIMARY KEY (id);
ALTER TABLE public.payment_intents ADD CONSTRAINT payment_intents_pkey PRIMARY KEY (order_number);
ALTER TABLE public.products ADD CONSTRAINT products_pkey PRIMARY KEY (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.site_settings ADD CONSTRAINT site_settings_pkey PRIMARY KEY (key);
ALTER TABLE public.user_agreements ADD CONSTRAINT user_agreements_pkey PRIMARY KEY (id);
ALTER TABLE public.user_progress ADD CONSTRAINT user_progress_pkey PRIMARY KEY (user_id);
ALTER TABLE public.orders ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);
ALTER TABLE public.user_agreements ADD CONSTRAINT user_agreements_user_id_agreement_version_key UNIQUE (user_id, agreement_version);
ALTER TABLE public.cart_items ADD CONSTRAINT cart_items_quantity_positive CHECK (quantity > 0);
ALTER TABLE public.cs_inquiries ADD CONSTRAINT cs_inquiries_content_nonblank CHECK (btrim(content) <> ''::text);
ALTER TABLE public.cs_inquiries ADD CONSTRAINT cs_inquiries_title_nonblank CHECK (btrim(title) <> ''::text);
ALTER TABLE public.order_items ADD CONSTRAINT order_items_price_nonnegative CHECK (price >= 0);
ALTER TABLE public.order_items ADD CONSTRAINT order_items_quantity_positive CHECK (quantity > 0);
ALTER TABLE public.orders ADD CONSTRAINT orders_total_price_nonnegative CHECK (total_price >= 0::numeric);
ALTER TABLE public.payment_intents ADD CONSTRAINT payment_intents_total_price_positive CHECK (total_price > 0::numeric);
ALTER TABLE public.payment_intents ADD CONSTRAINT payment_intents_validated_snapshot_object CHECK (jsonb_typeof(validated_snapshot) = 'object'::text);
ALTER TABLE public.products ADD CONSTRAINT products_title_nonblank CHECK (btrim(title) <> ''::text);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_custom_id_format CHECK (user_custom_id IS NULL OR char_length(user_custom_id) >= 4 AND char_length(user_custom_id) <= 32 AND user_custom_id = btrim(user_custom_id) AND user_custom_id !~ '[[:space:]]'::text AND POSITION(('@'::text) IN (user_custom_id)) = 0);
ALTER TABLE public.cart_items ADD CONSTRAINT cart_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.collections ADD CONSTRAINT collections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.cs_inquiries ADD CONSTRAINT cs_inquiries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.payment_intents ADD CONSTRAINT payment_intents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_agreements ADD CONSTRAINT user_agreements_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_progress ADD CONSTRAINT user_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_cart_items_user_created_at ON public.cart_items USING btree (user_id, created_at DESC);
CREATE INDEX idx_cs_inquiries_user_created_at ON public.cs_inquiries USING btree (user_id, created_at DESC);
CREATE INDEX idx_order_items_order_id ON public.order_items USING btree (order_id);
CREATE INDEX idx_orders_user_created_at ON public.orders USING btree (user_id, created_at DESC);
CREATE INDEX idx_payment_intents_user_created_at ON public.payment_intents USING btree (user_id, created_at DESC);
CREATE INDEX idx_products_is_visible ON public.products USING btree (is_visible);
CREATE INDEX idx_profiles_is_admin ON public.profiles USING btree (is_admin);
CREATE UNIQUE INDEX idx_profiles_user_custom_id ON public.profiles USING btree (user_custom_id);
CREATE INDEX idx_user_agreements_user_id ON public.user_agreements USING btree (user_id);
CREATE UNIQUE INDEX profiles_user_custom_id_lower_uidx ON public.profiles USING btree (lower(user_custom_id)) WHERE (user_custom_id IS NOT NULL);
CREATE TRIGGER trg_profiles_guard_privileged_fields BEFORE INSERT OR UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION profiles_guard_privileged_fields();
CREATE TRIGGER update_user_progress_updated_at BEFORE UPDATE ON user_progress FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cs_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow admin full access to banners" ON public.banners; CREATE POLICY "Allow admin full access to banners" ON public.banners AS PERMISSIVE FOR ALL TO authenticated USING (profiles_is_current_user_admin()) WITH CHECK (profiles_is_current_user_admin());
DROP POLICY IF EXISTS "Allow admin update access" ON public.site_settings; CREATE POLICY "Allow admin update access" ON public.site_settings AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));
DROP POLICY IF EXISTS "Allow insert for auth users" ON public.profiles; CREATE POLICY "Allow insert for auth users" ON public.profiles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = id));
DROP POLICY IF EXISTS "Allow public read access" ON public.site_settings; CREATE POLICY "Allow public read access" ON public.site_settings AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Allow public read access to active banners" ON public.banners; CREATE POLICY "Allow public read access to active banners" ON public.banners AS PERMISSIVE FOR SELECT TO public USING ((is_active IS TRUE));
DROP POLICY IF EXISTS "Users can delete own collections" ON public.collections; CREATE POLICY "Users can delete own collections" ON public.collections AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can insert own agreements" ON public.user_agreements; CREATE POLICY "Users can insert own agreements" ON public.user_agreements AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can insert own collections" ON public.collections; CREATE POLICY "Users can insert own collections" ON public.collections AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can insert their own progress" ON public.user_progress; CREATE POLICY "Users can insert their own progress" ON public.user_progress AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can manage own cart items" ON public.cart_items; CREATE POLICY "Users can manage own cart items" ON public.cart_items AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can update own collections" ON public.collections; CREATE POLICY "Users can update own collections" ON public.collections AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can update their own progress" ON public.user_progress; CREATE POLICY "Users can update their own progress" ON public.user_progress AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can view own agreements" ON public.user_agreements; CREATE POLICY "Users can view own agreements" ON public.user_agreements AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can view own collections" ON public.collections; CREATE POLICY "Users can view own collections" ON public.collections AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can view their own progress" ON public.user_progress; CREATE POLICY "Users can view their own progress" ON public.user_progress AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS admin_manage_products ON public.products; CREATE POLICY admin_manage_products ON public.products AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));
DROP POLICY IF EXISTS anyone_can_view_products ON public.products; CREATE POLICY anyone_can_view_products ON public.products AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS cs_inquiries_insert_own ON public.cs_inquiries; CREATE POLICY cs_inquiries_insert_own ON public.cs_inquiries AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS cs_inquiries_select_admin ON public.cs_inquiries; CREATE POLICY cs_inquiries_select_admin ON public.cs_inquiries AS PERMISSIVE FOR SELECT TO authenticated USING (profiles_is_current_user_admin());
DROP POLICY IF EXISTS cs_inquiries_select_own ON public.cs_inquiries; CREATE POLICY cs_inquiries_select_own ON public.cs_inquiries AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS cs_inquiries_update_admin ON public.cs_inquiries; CREATE POLICY cs_inquiries_update_admin ON public.cs_inquiries AS PERMISSIVE FOR UPDATE TO authenticated USING (profiles_is_current_user_admin()) WITH CHECK (profiles_is_current_user_admin());
DROP POLICY IF EXISTS order_items_select_admin ON public.order_items; CREATE POLICY order_items_select_admin ON public.order_items AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_admin = true)))));
DROP POLICY IF EXISTS order_items_select_own ON public.order_items; CREATE POLICY order_items_select_own ON public.order_items AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_items.order_id) AND (o.user_id = auth.uid())))));
DROP POLICY IF EXISTS orders_select_admin ON public.orders; CREATE POLICY orders_select_admin ON public.orders AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_admin = true)))));
DROP POLICY IF EXISTS orders_select_own ON public.orders; CREATE POLICY orders_select_own ON public.orders AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS orders_update_admin ON public.orders; CREATE POLICY orders_update_admin ON public.orders AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_admin = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_admin = true)))));
DROP POLICY IF EXISTS products_admin_manage ON public.products; CREATE POLICY products_admin_manage ON public.products AS PERMISSIVE FOR ALL TO authenticated USING ((( SELECT profiles.is_admin
   FROM profiles
  WHERE (profiles.id = auth.uid())) = true));
DROP POLICY IF EXISTS products_read_all ON public.products; CREATE POLICY products_read_all ON public.products AS PERMISSIVE FOR SELECT TO public USING ((is_visible = true));
DROP POLICY IF EXISTS profiles_select_admin ON public.profiles; CREATE POLICY profiles_select_admin ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING (profiles_is_current_user_admin());
DROP POLICY IF EXISTS profiles_select_own ON public.profiles; CREATE POLICY profiles_select_own ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = id));
DROP POLICY IF EXISTS profiles_update_admin ON public.profiles; CREATE POLICY profiles_update_admin ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING (profiles_is_current_user_admin()) WITH CHECK (profiles_is_current_user_admin());
DROP POLICY IF EXISTS profiles_update_own ON public.profiles; CREATE POLICY profiles_update_own ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));
DROP POLICY IF EXISTS users_insert_own_profile ON public.profiles; CREATE POLICY users_insert_own_profile ON public.profiles AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = id));
DROP POLICY IF EXISTS users_read_own_profile ON public.profiles; CREATE POLICY users_read_own_profile ON public.profiles AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = id));
DROP POLICY IF EXISTS users_update_own_profile ON public.profiles; CREATE POLICY users_update_own_profile ON public.profiles AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));
DROP POLICY IF EXISTS "누구나 상품 조회 가능" ON public.products; CREATE POLICY "누구나 상품 조회 가능" ON public.products AS PERMISSIVE FOR SELECT TO public USING ((is_visible = true));
DROP POLICY IF EXISTS "상품 조회 허용" ON public.products; CREATE POLICY "상품 조회 허용" ON public.products AS PERMISSIVE FOR SELECT TO public USING (true);
REVOKE ALL ON TABLE public.banners FROM PUBLIC; REVOKE ALL ON TABLE public.banners FROM anon; REVOKE ALL ON TABLE public.banners FROM authenticated; REVOKE ALL ON TABLE public.banners FROM service_role;
REVOKE ALL ON TABLE public.cart_items FROM PUBLIC; REVOKE ALL ON TABLE public.cart_items FROM anon; REVOKE ALL ON TABLE public.cart_items FROM authenticated; REVOKE ALL ON TABLE public.cart_items FROM service_role;
REVOKE ALL ON TABLE public.collections FROM PUBLIC; REVOKE ALL ON TABLE public.collections FROM anon; REVOKE ALL ON TABLE public.collections FROM authenticated; REVOKE ALL ON TABLE public.collections FROM service_role;
REVOKE ALL ON TABLE public.cs_inquiries FROM PUBLIC; REVOKE ALL ON TABLE public.cs_inquiries FROM anon; REVOKE ALL ON TABLE public.cs_inquiries FROM authenticated; REVOKE ALL ON TABLE public.cs_inquiries FROM service_role;
REVOKE ALL ON TABLE public.order_items FROM PUBLIC; REVOKE ALL ON TABLE public.order_items FROM anon; REVOKE ALL ON TABLE public.order_items FROM authenticated; REVOKE ALL ON TABLE public.order_items FROM service_role;
REVOKE ALL ON TABLE public.orders FROM PUBLIC; REVOKE ALL ON TABLE public.orders FROM anon; REVOKE ALL ON TABLE public.orders FROM authenticated; REVOKE ALL ON TABLE public.orders FROM service_role;
REVOKE ALL ON TABLE public.payment_intents FROM PUBLIC; REVOKE ALL ON TABLE public.payment_intents FROM anon; REVOKE ALL ON TABLE public.payment_intents FROM authenticated; REVOKE ALL ON TABLE public.payment_intents FROM service_role;
REVOKE ALL ON TABLE public.products FROM PUBLIC; REVOKE ALL ON TABLE public.products FROM anon; REVOKE ALL ON TABLE public.products FROM authenticated; REVOKE ALL ON TABLE public.products FROM service_role;
REVOKE ALL ON TABLE public.profiles FROM PUBLIC; REVOKE ALL ON TABLE public.profiles FROM anon; REVOKE ALL ON TABLE public.profiles FROM authenticated; REVOKE ALL ON TABLE public.profiles FROM service_role;
REVOKE ALL ON TABLE public.site_settings FROM PUBLIC; REVOKE ALL ON TABLE public.site_settings FROM anon; REVOKE ALL ON TABLE public.site_settings FROM authenticated; REVOKE ALL ON TABLE public.site_settings FROM service_role;
REVOKE ALL ON TABLE public.user_agreements FROM PUBLIC; REVOKE ALL ON TABLE public.user_agreements FROM anon; REVOKE ALL ON TABLE public.user_agreements FROM authenticated; REVOKE ALL ON TABLE public.user_agreements FROM service_role;
REVOKE ALL ON TABLE public.user_progress FROM PUBLIC; REVOKE ALL ON TABLE public.user_progress FROM anon; REVOKE ALL ON TABLE public.user_progress FROM authenticated; REVOKE ALL ON TABLE public.user_progress FROM service_role;
GRANT DELETE ON TABLE public.banners TO anon;
GRANT INSERT ON TABLE public.banners TO anon;
GRANT REFERENCES ON TABLE public.banners TO anon;
GRANT SELECT ON TABLE public.banners TO anon;
GRANT TRIGGER ON TABLE public.banners TO anon;
GRANT TRUNCATE ON TABLE public.banners TO anon;
GRANT UPDATE ON TABLE public.banners TO anon;
GRANT DELETE ON TABLE public.banners TO authenticated;
GRANT INSERT ON TABLE public.banners TO authenticated;
GRANT REFERENCES ON TABLE public.banners TO authenticated;
GRANT SELECT ON TABLE public.banners TO authenticated;
GRANT TRIGGER ON TABLE public.banners TO authenticated;
GRANT TRUNCATE ON TABLE public.banners TO authenticated;
GRANT UPDATE ON TABLE public.banners TO authenticated;
GRANT DELETE ON TABLE public.banners TO postgres;
GRANT INSERT ON TABLE public.banners TO postgres;
GRANT REFERENCES ON TABLE public.banners TO postgres;
GRANT SELECT ON TABLE public.banners TO postgres;
GRANT TRIGGER ON TABLE public.banners TO postgres;
GRANT TRUNCATE ON TABLE public.banners TO postgres;
GRANT UPDATE ON TABLE public.banners TO postgres;
GRANT DELETE ON TABLE public.banners TO service_role;
GRANT INSERT ON TABLE public.banners TO service_role;
GRANT REFERENCES ON TABLE public.banners TO service_role;
GRANT SELECT ON TABLE public.banners TO service_role;
GRANT TRIGGER ON TABLE public.banners TO service_role;
GRANT TRUNCATE ON TABLE public.banners TO service_role;
GRANT UPDATE ON TABLE public.banners TO service_role;
GRANT DELETE ON TABLE public.cart_items TO anon;
GRANT INSERT ON TABLE public.cart_items TO anon;
GRANT REFERENCES ON TABLE public.cart_items TO anon;
GRANT SELECT ON TABLE public.cart_items TO anon;
GRANT TRIGGER ON TABLE public.cart_items TO anon;
GRANT TRUNCATE ON TABLE public.cart_items TO anon;
GRANT UPDATE ON TABLE public.cart_items TO anon;
GRANT DELETE ON TABLE public.cart_items TO authenticated;
GRANT INSERT ON TABLE public.cart_items TO authenticated;
GRANT REFERENCES ON TABLE public.cart_items TO authenticated;
GRANT SELECT ON TABLE public.cart_items TO authenticated;
GRANT TRIGGER ON TABLE public.cart_items TO authenticated;
GRANT TRUNCATE ON TABLE public.cart_items TO authenticated;
GRANT UPDATE ON TABLE public.cart_items TO authenticated;
GRANT DELETE ON TABLE public.cart_items TO postgres;
GRANT INSERT ON TABLE public.cart_items TO postgres;
GRANT REFERENCES ON TABLE public.cart_items TO postgres;
GRANT SELECT ON TABLE public.cart_items TO postgres;
GRANT TRIGGER ON TABLE public.cart_items TO postgres;
GRANT TRUNCATE ON TABLE public.cart_items TO postgres;
GRANT UPDATE ON TABLE public.cart_items TO postgres;
GRANT DELETE ON TABLE public.cart_items TO service_role;
GRANT INSERT ON TABLE public.cart_items TO service_role;
GRANT REFERENCES ON TABLE public.cart_items TO service_role;
GRANT SELECT ON TABLE public.cart_items TO service_role;
GRANT TRIGGER ON TABLE public.cart_items TO service_role;
GRANT TRUNCATE ON TABLE public.cart_items TO service_role;
GRANT UPDATE ON TABLE public.cart_items TO service_role;
GRANT DELETE ON TABLE public.collections TO anon;
GRANT INSERT ON TABLE public.collections TO anon;
GRANT REFERENCES ON TABLE public.collections TO anon;
GRANT SELECT ON TABLE public.collections TO anon;
GRANT TRIGGER ON TABLE public.collections TO anon;
GRANT TRUNCATE ON TABLE public.collections TO anon;
GRANT UPDATE ON TABLE public.collections TO anon;
GRANT DELETE ON TABLE public.collections TO authenticated;
GRANT INSERT ON TABLE public.collections TO authenticated;
GRANT REFERENCES ON TABLE public.collections TO authenticated;
GRANT SELECT ON TABLE public.collections TO authenticated;
GRANT TRIGGER ON TABLE public.collections TO authenticated;
GRANT TRUNCATE ON TABLE public.collections TO authenticated;
GRANT UPDATE ON TABLE public.collections TO authenticated;
GRANT DELETE ON TABLE public.collections TO postgres;
GRANT INSERT ON TABLE public.collections TO postgres;
GRANT REFERENCES ON TABLE public.collections TO postgres;
GRANT SELECT ON TABLE public.collections TO postgres;
GRANT TRIGGER ON TABLE public.collections TO postgres;
GRANT TRUNCATE ON TABLE public.collections TO postgres;
GRANT UPDATE ON TABLE public.collections TO postgres;
GRANT DELETE ON TABLE public.collections TO service_role;
GRANT INSERT ON TABLE public.collections TO service_role;
GRANT REFERENCES ON TABLE public.collections TO service_role;
GRANT SELECT ON TABLE public.collections TO service_role;
GRANT TRIGGER ON TABLE public.collections TO service_role;
GRANT TRUNCATE ON TABLE public.collections TO service_role;
GRANT UPDATE ON TABLE public.collections TO service_role;
GRANT DELETE ON TABLE public.cs_inquiries TO anon;
GRANT INSERT ON TABLE public.cs_inquiries TO anon;
GRANT REFERENCES ON TABLE public.cs_inquiries TO anon;
GRANT SELECT ON TABLE public.cs_inquiries TO anon;
GRANT TRIGGER ON TABLE public.cs_inquiries TO anon;
GRANT TRUNCATE ON TABLE public.cs_inquiries TO anon;
GRANT UPDATE ON TABLE public.cs_inquiries TO anon;
GRANT DELETE ON TABLE public.cs_inquiries TO authenticated;
GRANT INSERT ON TABLE public.cs_inquiries TO authenticated;
GRANT REFERENCES ON TABLE public.cs_inquiries TO authenticated;
GRANT SELECT ON TABLE public.cs_inquiries TO authenticated;
GRANT TRIGGER ON TABLE public.cs_inquiries TO authenticated;
GRANT TRUNCATE ON TABLE public.cs_inquiries TO authenticated;
GRANT UPDATE ON TABLE public.cs_inquiries TO authenticated;
GRANT DELETE ON TABLE public.cs_inquiries TO postgres;
GRANT INSERT ON TABLE public.cs_inquiries TO postgres;
GRANT REFERENCES ON TABLE public.cs_inquiries TO postgres;
GRANT SELECT ON TABLE public.cs_inquiries TO postgres;
GRANT TRIGGER ON TABLE public.cs_inquiries TO postgres;
GRANT TRUNCATE ON TABLE public.cs_inquiries TO postgres;
GRANT UPDATE ON TABLE public.cs_inquiries TO postgres;
GRANT DELETE ON TABLE public.cs_inquiries TO service_role;
GRANT INSERT ON TABLE public.cs_inquiries TO service_role;
GRANT REFERENCES ON TABLE public.cs_inquiries TO service_role;
GRANT SELECT ON TABLE public.cs_inquiries TO service_role;
GRANT TRIGGER ON TABLE public.cs_inquiries TO service_role;
GRANT TRUNCATE ON TABLE public.cs_inquiries TO service_role;
GRANT UPDATE ON TABLE public.cs_inquiries TO service_role;
GRANT DELETE ON TABLE public.order_items TO anon;
GRANT INSERT ON TABLE public.order_items TO anon;
GRANT REFERENCES ON TABLE public.order_items TO anon;
GRANT SELECT ON TABLE public.order_items TO anon;
GRANT TRIGGER ON TABLE public.order_items TO anon;
GRANT TRUNCATE ON TABLE public.order_items TO anon;
GRANT UPDATE ON TABLE public.order_items TO anon;
GRANT DELETE ON TABLE public.order_items TO authenticated;
GRANT INSERT ON TABLE public.order_items TO authenticated;
GRANT REFERENCES ON TABLE public.order_items TO authenticated;
GRANT SELECT ON TABLE public.order_items TO authenticated;
GRANT TRIGGER ON TABLE public.order_items TO authenticated;
GRANT TRUNCATE ON TABLE public.order_items TO authenticated;
GRANT UPDATE ON TABLE public.order_items TO authenticated;
GRANT DELETE ON TABLE public.order_items TO postgres;
GRANT INSERT ON TABLE public.order_items TO postgres;
GRANT REFERENCES ON TABLE public.order_items TO postgres;
GRANT SELECT ON TABLE public.order_items TO postgres;
GRANT TRIGGER ON TABLE public.order_items TO postgres;
GRANT TRUNCATE ON TABLE public.order_items TO postgres;
GRANT UPDATE ON TABLE public.order_items TO postgres;
GRANT DELETE ON TABLE public.order_items TO service_role;
GRANT INSERT ON TABLE public.order_items TO service_role;
GRANT REFERENCES ON TABLE public.order_items TO service_role;
GRANT SELECT ON TABLE public.order_items TO service_role;
GRANT TRIGGER ON TABLE public.order_items TO service_role;
GRANT TRUNCATE ON TABLE public.order_items TO service_role;
GRANT UPDATE ON TABLE public.order_items TO service_role;
GRANT DELETE ON TABLE public.orders TO anon;
GRANT INSERT ON TABLE public.orders TO anon;
GRANT REFERENCES ON TABLE public.orders TO anon;
GRANT SELECT ON TABLE public.orders TO anon;
GRANT TRIGGER ON TABLE public.orders TO anon;
GRANT TRUNCATE ON TABLE public.orders TO anon;
GRANT UPDATE ON TABLE public.orders TO anon;
GRANT DELETE ON TABLE public.orders TO authenticated;
GRANT INSERT ON TABLE public.orders TO authenticated;
GRANT REFERENCES ON TABLE public.orders TO authenticated;
GRANT SELECT ON TABLE public.orders TO authenticated;
GRANT TRIGGER ON TABLE public.orders TO authenticated;
GRANT TRUNCATE ON TABLE public.orders TO authenticated;
GRANT UPDATE ON TABLE public.orders TO authenticated;
GRANT DELETE ON TABLE public.orders TO postgres;
GRANT INSERT ON TABLE public.orders TO postgres;
GRANT REFERENCES ON TABLE public.orders TO postgres;
GRANT SELECT ON TABLE public.orders TO postgres;
GRANT TRIGGER ON TABLE public.orders TO postgres;
GRANT TRUNCATE ON TABLE public.orders TO postgres;
GRANT UPDATE ON TABLE public.orders TO postgres;
GRANT DELETE ON TABLE public.orders TO service_role;
GRANT INSERT ON TABLE public.orders TO service_role;
GRANT REFERENCES ON TABLE public.orders TO service_role;
GRANT SELECT ON TABLE public.orders TO service_role;
GRANT TRIGGER ON TABLE public.orders TO service_role;
GRANT TRUNCATE ON TABLE public.orders TO service_role;
GRANT UPDATE ON TABLE public.orders TO service_role;
GRANT DELETE ON TABLE public.payment_intents TO postgres;
GRANT INSERT ON TABLE public.payment_intents TO postgres;
GRANT REFERENCES ON TABLE public.payment_intents TO postgres;
GRANT SELECT ON TABLE public.payment_intents TO postgres;
GRANT TRIGGER ON TABLE public.payment_intents TO postgres;
GRANT TRUNCATE ON TABLE public.payment_intents TO postgres;
GRANT UPDATE ON TABLE public.payment_intents TO postgres;
GRANT INSERT ON TABLE public.payment_intents TO service_role;
GRANT SELECT ON TABLE public.payment_intents TO service_role;
GRANT DELETE ON TABLE public.products TO anon;
GRANT INSERT ON TABLE public.products TO anon;
GRANT REFERENCES ON TABLE public.products TO anon;
GRANT SELECT ON TABLE public.products TO anon;
GRANT TRIGGER ON TABLE public.products TO anon;
GRANT TRUNCATE ON TABLE public.products TO anon;
GRANT UPDATE ON TABLE public.products TO anon;
GRANT DELETE ON TABLE public.products TO authenticated;
GRANT INSERT ON TABLE public.products TO authenticated;
GRANT REFERENCES ON TABLE public.products TO authenticated;
GRANT SELECT ON TABLE public.products TO authenticated;
GRANT TRIGGER ON TABLE public.products TO authenticated;
GRANT TRUNCATE ON TABLE public.products TO authenticated;
GRANT UPDATE ON TABLE public.products TO authenticated;
GRANT DELETE ON TABLE public.products TO postgres;
GRANT INSERT ON TABLE public.products TO postgres;
GRANT REFERENCES ON TABLE public.products TO postgres;
GRANT SELECT ON TABLE public.products TO postgres;
GRANT TRIGGER ON TABLE public.products TO postgres;
GRANT TRUNCATE ON TABLE public.products TO postgres;
GRANT UPDATE ON TABLE public.products TO postgres;
GRANT DELETE ON TABLE public.products TO service_role;
GRANT INSERT ON TABLE public.products TO service_role;
GRANT REFERENCES ON TABLE public.products TO service_role;
GRANT SELECT ON TABLE public.products TO service_role;
GRANT TRIGGER ON TABLE public.products TO service_role;
GRANT TRUNCATE ON TABLE public.products TO service_role;
GRANT UPDATE ON TABLE public.products TO service_role;
GRANT DELETE ON TABLE public.profiles TO anon;
GRANT INSERT ON TABLE public.profiles TO anon;
GRANT REFERENCES ON TABLE public.profiles TO anon;
GRANT SELECT ON TABLE public.profiles TO anon;
GRANT TRIGGER ON TABLE public.profiles TO anon;
GRANT TRUNCATE ON TABLE public.profiles TO anon;
GRANT UPDATE ON TABLE public.profiles TO anon;
GRANT DELETE ON TABLE public.profiles TO authenticated;
GRANT INSERT ON TABLE public.profiles TO authenticated;
GRANT REFERENCES ON TABLE public.profiles TO authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT TRIGGER ON TABLE public.profiles TO authenticated;
GRANT TRUNCATE ON TABLE public.profiles TO authenticated;
GRANT UPDATE ON TABLE public.profiles TO authenticated;
GRANT DELETE ON TABLE public.profiles TO postgres;
GRANT INSERT ON TABLE public.profiles TO postgres;
GRANT REFERENCES ON TABLE public.profiles TO postgres;
GRANT SELECT ON TABLE public.profiles TO postgres;
GRANT TRIGGER ON TABLE public.profiles TO postgres;
GRANT TRUNCATE ON TABLE public.profiles TO postgres;
GRANT UPDATE ON TABLE public.profiles TO postgres;
GRANT DELETE ON TABLE public.profiles TO service_role;
GRANT INSERT ON TABLE public.profiles TO service_role;
GRANT REFERENCES ON TABLE public.profiles TO service_role;
GRANT SELECT ON TABLE public.profiles TO service_role;
GRANT TRIGGER ON TABLE public.profiles TO service_role;
GRANT TRUNCATE ON TABLE public.profiles TO service_role;
GRANT UPDATE ON TABLE public.profiles TO service_role;
GRANT DELETE ON TABLE public.site_settings TO anon;
GRANT INSERT ON TABLE public.site_settings TO anon;
GRANT REFERENCES ON TABLE public.site_settings TO anon;
GRANT SELECT ON TABLE public.site_settings TO anon;
GRANT TRIGGER ON TABLE public.site_settings TO anon;
GRANT TRUNCATE ON TABLE public.site_settings TO anon;
GRANT UPDATE ON TABLE public.site_settings TO anon;
GRANT DELETE ON TABLE public.site_settings TO authenticated;
GRANT INSERT ON TABLE public.site_settings TO authenticated;
GRANT REFERENCES ON TABLE public.site_settings TO authenticated;
GRANT SELECT ON TABLE public.site_settings TO authenticated;
GRANT TRIGGER ON TABLE public.site_settings TO authenticated;
GRANT TRUNCATE ON TABLE public.site_settings TO authenticated;
GRANT UPDATE ON TABLE public.site_settings TO authenticated;
GRANT DELETE ON TABLE public.site_settings TO postgres;
GRANT INSERT ON TABLE public.site_settings TO postgres;
GRANT REFERENCES ON TABLE public.site_settings TO postgres;
GRANT SELECT ON TABLE public.site_settings TO postgres;
GRANT TRIGGER ON TABLE public.site_settings TO postgres;
GRANT TRUNCATE ON TABLE public.site_settings TO postgres;
GRANT UPDATE ON TABLE public.site_settings TO postgres;
GRANT DELETE ON TABLE public.site_settings TO service_role;
GRANT INSERT ON TABLE public.site_settings TO service_role;
GRANT REFERENCES ON TABLE public.site_settings TO service_role;
GRANT SELECT ON TABLE public.site_settings TO service_role;
GRANT TRIGGER ON TABLE public.site_settings TO service_role;
GRANT TRUNCATE ON TABLE public.site_settings TO service_role;
GRANT UPDATE ON TABLE public.site_settings TO service_role;
GRANT DELETE ON TABLE public.user_agreements TO anon;
GRANT INSERT ON TABLE public.user_agreements TO anon;
GRANT REFERENCES ON TABLE public.user_agreements TO anon;
GRANT SELECT ON TABLE public.user_agreements TO anon;
GRANT TRIGGER ON TABLE public.user_agreements TO anon;
GRANT TRUNCATE ON TABLE public.user_agreements TO anon;
GRANT UPDATE ON TABLE public.user_agreements TO anon;
GRANT DELETE ON TABLE public.user_agreements TO authenticated;
GRANT INSERT ON TABLE public.user_agreements TO authenticated;
GRANT REFERENCES ON TABLE public.user_agreements TO authenticated;
GRANT SELECT ON TABLE public.user_agreements TO authenticated;
GRANT TRIGGER ON TABLE public.user_agreements TO authenticated;
GRANT TRUNCATE ON TABLE public.user_agreements TO authenticated;
GRANT UPDATE ON TABLE public.user_agreements TO authenticated;
GRANT DELETE ON TABLE public.user_agreements TO postgres;
GRANT INSERT ON TABLE public.user_agreements TO postgres;
GRANT REFERENCES ON TABLE public.user_agreements TO postgres;
GRANT SELECT ON TABLE public.user_agreements TO postgres;
GRANT TRIGGER ON TABLE public.user_agreements TO postgres;
GRANT TRUNCATE ON TABLE public.user_agreements TO postgres;
GRANT UPDATE ON TABLE public.user_agreements TO postgres;
GRANT DELETE ON TABLE public.user_agreements TO service_role;
GRANT INSERT ON TABLE public.user_agreements TO service_role;
GRANT REFERENCES ON TABLE public.user_agreements TO service_role;
GRANT SELECT ON TABLE public.user_agreements TO service_role;
GRANT TRIGGER ON TABLE public.user_agreements TO service_role;
GRANT TRUNCATE ON TABLE public.user_agreements TO service_role;
GRANT UPDATE ON TABLE public.user_agreements TO service_role;
GRANT DELETE ON TABLE public.user_progress TO anon;
GRANT INSERT ON TABLE public.user_progress TO anon;
GRANT REFERENCES ON TABLE public.user_progress TO anon;
GRANT SELECT ON TABLE public.user_progress TO anon;
GRANT TRIGGER ON TABLE public.user_progress TO anon;
GRANT TRUNCATE ON TABLE public.user_progress TO anon;
GRANT UPDATE ON TABLE public.user_progress TO anon;
GRANT DELETE ON TABLE public.user_progress TO authenticated;
GRANT INSERT ON TABLE public.user_progress TO authenticated;
GRANT REFERENCES ON TABLE public.user_progress TO authenticated;
GRANT SELECT ON TABLE public.user_progress TO authenticated;
GRANT TRIGGER ON TABLE public.user_progress TO authenticated;
GRANT TRUNCATE ON TABLE public.user_progress TO authenticated;
GRANT UPDATE ON TABLE public.user_progress TO authenticated;
GRANT DELETE ON TABLE public.user_progress TO postgres;
GRANT INSERT ON TABLE public.user_progress TO postgres;
GRANT REFERENCES ON TABLE public.user_progress TO postgres;
GRANT SELECT ON TABLE public.user_progress TO postgres;
GRANT TRIGGER ON TABLE public.user_progress TO postgres;
GRANT TRUNCATE ON TABLE public.user_progress TO postgres;
GRANT UPDATE ON TABLE public.user_progress TO postgres;
GRANT DELETE ON TABLE public.user_progress TO service_role;
GRANT INSERT ON TABLE public.user_progress TO service_role;
GRANT REFERENCES ON TABLE public.user_progress TO service_role;
GRANT SELECT ON TABLE public.user_progress TO service_role;
GRANT TRIGGER ON TABLE public.user_progress TO service_role;
GRANT TRUNCATE ON TABLE public.user_progress TO service_role;
GRANT UPDATE ON TABLE public.user_progress TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_paid_order(p_verified_user_id uuid, p_user_custom_id text, p_order_number text, p_total_price numeric, p_paid_amount numeric, p_shipping_name text, p_shipping_phone text, p_zip_code text, p_address text, p_address_detail text, p_ordered_items jsonb, p_shipping_info jsonb, p_order_items jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION public.finalize_paid_order(p_verified_user_id uuid, p_user_custom_id text, p_order_number text, p_total_price numeric, p_paid_amount numeric, p_shipping_name text, p_shipping_phone text, p_zip_code text, p_address text, p_address_detail text, p_ordered_items jsonb, p_shipping_info jsonb, p_order_items jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.profiles_guard_privileged_fields() TO anon;
GRANT EXECUTE ON FUNCTION public.profiles_guard_privileged_fields() TO authenticated;
GRANT EXECUTE ON FUNCTION public.profiles_guard_privileged_fields() TO postgres;
GRANT EXECUTE ON FUNCTION public.profiles_guard_privileged_fields() TO service_role;
GRANT EXECUTE ON FUNCTION public.profiles_is_current_user_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.profiles_is_current_user_admin() TO postgres;
GRANT EXECUTE ON FUNCTION public.profiles_is_current_user_admin() TO service_role;
GRANT EXECUTE ON FUNCTION public.profiles_username_exists(username text) TO anon;
GRANT EXECUTE ON FUNCTION public.profiles_username_exists(username text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.profiles_username_exists(username text) TO postgres;
GRANT EXECUTE ON FUNCTION public.profiles_username_exists(username text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO anon;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO postgres;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;
