-- 1. Create the public.profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  user_custom_id TEXT UNIQUE,
  full_name TEXT,
  phone_number TEXT,
  zip_code VARCHAR(10),
  address TEXT,
  address_detail TEXT,
  total_spent BIGINT DEFAULT 0,
  is_admin BOOLEAN DEFAULT false,
  agreed_to_terms_at TIMESTAMP WITH TIME ZONE,
  agreed_to_privacy_at TIMESTAMP WITH TIME ZONE,
  agreed_to_cookie_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Create the public.products table
CREATE TABLE public.products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,
  front_image TEXT,
  back_image TEXT,
  landscape_image TEXT,
  landscape_back_image TEXT,
  supported_orientations JSONB DEFAULT '["portrait"]'::jsonb,
  description TEXT,
  is_limited BOOLEAN DEFAULT false,
  is_visible BOOLEAN DEFAULT true,
  options JSONB DEFAULT '[]'::jsonb,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Create the public.cart_items table
CREATE TABLE public.cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  product_id TEXT NOT NULL,
  selected_option TEXT,
  orientation TEXT,
  quantity INTEGER DEFAULT 1,
  custom_image TEXT,
  custom_config JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 4. Create the public.orders table
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_custom_id TEXT,
  total_price NUMERIC DEFAULT 0,
  total_amount NUMERIC DEFAULT 0,
  status TEXT DEFAULT '결제대기',
  shipping_name TEXT,
  shipping_phone TEXT,
  zip_code TEXT,
  address TEXT,
  address_detail TEXT,
  ordered_items JSONB,
  shipping_info JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 5. Create the public.order_items table
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT REFERENCES public.orders(order_number) ON DELETE CASCADE,
  product_id TEXT,
  product_title TEXT,
  option TEXT,
  orientation TEXT,
  quantity INTEGER,
  price NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 6. Create the public.inquiries table
CREATE TABLE public.inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  content TEXT,
  status TEXT DEFAULT '대기중',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 7. Create the public.user_progress table (Workshop draft)
CREATE TABLE public.user_progress (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_step INTEGER DEFAULT 1,
  selected_material TEXT,
  selected_size TEXT,
  uploaded_image_url TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 8. Create the public.banners table
CREATE TABLE public.banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 9. Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;

-- 10. Create a function to handle new user signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
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
    NEW.raw_user_meta_data->>'user_custom_id',
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'phone_number',
    (NEW.raw_user_meta_data->>'agreed_to_terms_at')::timestamptz,
    (NEW.raw_user_meta_data->>'agreed_to_privacy_at')::timestamptz,
    (NEW.raw_user_meta_data->>'agreed_to_cookie_at')::timestamptz,
    NOW()
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log error or handle gracefully if needed
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Create a trigger to call the function on new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
