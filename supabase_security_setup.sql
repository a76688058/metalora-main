-- METALORA Supabase Security Setup (RLS Policies)
-- Copy and run these commands in your Supabase SQL Editor

-- 1. Enable RLS on tables
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;

-- 2. Products Table Policies
-- Everyone can view products
CREATE POLICY "Allow public read access to products"
ON products FOR SELECT
USING (true);

-- Only admins can insert/update/delete products
CREATE POLICY "Allow admin full access to products"
ON products FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.is_admin = true
  )
);

-- 3. Profiles Table Policies
-- Users can view and update their own profile
CREATE POLICY "Users can view own profile"
ON profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
ON profiles FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.is_admin = true
  )
);

-- 4. Orders Table Policies
-- Users can view their own orders
CREATE POLICY "Users can view own orders"
ON orders FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can create their own orders
CREATE POLICY "Users can create own orders"
ON orders FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Admins can view and manage all orders
CREATE POLICY "Admins can manage all orders"
ON orders FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.is_admin = true
  )
);

-- 5. Inquiries Table Policies
-- Users can view and create their own inquiries
CREATE POLICY "Users can manage own inquiries"
ON inquiries FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Admins can view and reply to all inquiries
CREATE POLICY "Admins can manage all inquiries"
ON inquiries FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.is_admin = true
  )
);

-- 6. Order Items Table Policies
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Users can view their own order items
CREATE POLICY "Users can view own order items"
ON order_items FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM orders
    WHERE orders.order_number = order_items.order_number AND orders.user_id = auth.uid()
  )
);

-- Users can create their own order items
CREATE POLICY "Users can create own order items"
ON order_items FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM orders
    WHERE orders.order_number = order_items.order_number AND orders.user_id = auth.uid()
  )
);

-- Admins can view and manage all order items
CREATE POLICY "Admins can manage all order items"
ON order_items FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.is_admin = true
  )
);

-- 7. Cart Items Table Policies
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own cart items"
ON cart_items FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 8. User Progress Table Policies
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own progress"
ON user_progress FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 9. Storage Policies (Run this in the Storage settings or SQL)
-- Note: Replace 'products' with your actual bucket name
-- Allow public read access to product images
-- CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING ( bucket_id = 'products' );

-- Only admins can upload/delete from products bucket
-- CREATE POLICY "Admin Write Access" ON storage.objects FOR ALL TO authenticated
-- USING (
--   bucket_id = 'products' AND
--   EXISTS (
--     SELECT 1 FROM profiles
--     WHERE profiles.id = auth.uid() AND profiles.is_admin = true
--   )
-- );
