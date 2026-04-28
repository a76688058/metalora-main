import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { Product } from '../data/products';

interface CartItem {
  id: string;
  user_id: string;
  product_id: string;
  selected_option: string;
  quantity: number;
  created_at: string;
  orientation?: 'portrait' | 'landscape';
  custom_image?: string;
  custom_config?: any;
  product?: Product;
  product_type: 'stock' | 'workshop';
}

interface CartContextType {
  cartItems: CartItem[];
  isLoading: boolean;
  addToCart: (
    productId: string, 
    selectedOption: string, 
    quantity: number, 
    customImage?: string, 
    customConfig?: any,
    orientation?: 'portrait' | 'landscape'
  ) => Promise<void>;
  removeFromCart: (itemId: string) => Promise<void>;
  updateQuantity: (itemId: string, quantity: number) => Promise<void>;
  clearCart: () => Promise<void>;
  totalPrice: number;
  refreshCart: () => Promise<void>;
  isCartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const { user, adminUser } = useAuth();
  const { showToast } = useToast();

  const openCart = () => setIsCartOpen(true);
  const closeCart = () => setIsCartOpen(false);

  // Helper to get the correct supabase client based on active session
  const getClient = useCallback(() => {
    return supabase;
  }, []);

  const refreshCart = useCallback(async () => {
    const currentUserId = user?.id || adminUser?.id;
    if (!currentUserId) {
      setCartItems([]);
      return;
    }

    try {
      setIsLoading(true);
      console.log('Refreshing cart for user:', currentUserId);
      
      const client = getClient();
      
      // 1. Fetch cart items WITHOUT join to avoid PGRST200 error
      const { data: items, error: itemsError } = await client
        .from('cart_items')
        .select('*')
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false });

      if (itemsError) throw itemsError;
      
      if (!items || items.length === 0) {
        setCartItems([]);
        return;
      }

      // 2. Identify standard products to fetch details for
      const standardProductIds = items
        .filter(item => item.product_id !== 'workshop-single')
        .map(item => item.product_id);

      let productsMap: Record<string, any> = {};
      
      if (standardProductIds.length > 0) {
        const client = getClient();
        const { data: products, error: productsError } = await client
          .from('products')
          .select('*')
          .in('id', standardProductIds);
        
        if (!productsError && products) {
          productsMap = products.reduce((acc, p) => ({ ...acc, [p.id]: p }), {});
        }
      }

      // 3. Hydrate and merge data
      const hydratedData = items.map(item => {
        const product_type = item.product_id === 'workshop-single' ? 'workshop' : 'stock';
        
        if (item.product_id === 'workshop-single') {
          return {
            ...item,
            product_type,
            product: {
              id: 'workshop-single',
              title: '나만의 커스텀 포스터',
              artist: 'METALORA Workshop',
              image: item.custom_image || '',
              description: '워크숍에서 직접 제작한 커스텀 포스터입니다.',
              limited: false,
              options: []
            } as any
          };
        } else {
          return {
            ...item,
            product_type,
            product: productsMap[item.product_id] || null
          };
        }
      });

      setCartItems(hydratedData);
    } catch (error) {
      console.error('Error fetching cart:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshCart();
  }, [refreshCart]);

  const addToCart = async (
    productId: string, 
    selectedOption: string, 
    quantity: number, 
    customImage?: string, 
    customConfig?: any,
    orientation?: 'portrait' | 'landscape'
  ) => {
    try {
      setIsLoading(true);
      console.log('--- ADD TO CART DEBUG START ---');

      // 1. Try to get user from context first
      let currentUserId = user?.id || adminUser?.id;

      // 2. Fallback to direct session check if context is stale
      if (!currentUserId) {
        console.log('User missing in context, checking direct session...');
        // Check regular user session
        const { data: { session: sess } } = await supabase.auth.getSession();
        currentUserId = sess?.user?.id;
      }
      
      if (!currentUserId) {
        console.error('Auth Error: No user session found in context or storage');
        showToast('로그인이 필요합니다.', 'error');
        return;
      }

      console.log('User ID:', currentUserId);
      console.log('Product ID:', productId);

      const client = getClient();

      // Determine product type
      const productType = productId === 'workshop-single' ? 'workshop' : 'stock';

      // 1. 기존 아이템 확인 (workshop-single은 항상 새로 추가)
      let existingItem = null;
      if (productId !== 'workshop-single') {
        let query = client
          .from('cart_items')
          .select('*')
          .eq('user_id', currentUserId)
          .eq('product_id', productId)
          .eq('selected_option', selectedOption)
          .is('custom_image', null);
          
        if (orientation) {
          query = query.eq('orientation', orientation);
        } else {
          // Backward compatibility: If no orientation specified, match those with null or those without orientation
          // But since orientation is a new column, some existing rows might have it as null.
          query = query.is('orientation', null);
        }
          
        const { data, error } = await query;
          
        if (error) {
          console.error('Existing Item Check Error:', error);
          throw error;
        }
        existingItem = data && data.length > 0 ? data[0] : null;
      }

      // 2. Insert 또는 Update
      if (existingItem) {
        console.log('Updating existing item:', existingItem.id);
        const { error } = await client
          .from('cart_items')
          .update({ quantity: existingItem.quantity + quantity })
          .eq('id', existingItem.id);
        if (error) throw error;
      } else {
        console.log('Inserting new item');
        const { error } = await client
          .from('cart_items')
          .insert([
            {
              user_id: currentUserId,
              product_id: productId,
              selected_option: selectedOption,
              quantity: quantity,
              orientation: orientation || null,
              custom_image: customImage || null,
              custom_config: customConfig || null
              // Note: product_type column might not exist yet in DB, 
              // so we handle it in hydration logic (refreshCart)
            }
          ]);
        if (error) throw error;
      }

      await refreshCart();
    } catch (error: any) {
      console.error('Final AddToCart Error:', error);
    } finally {
      setIsLoading(false);
      console.log('--- ADD TO CART DEBUG END ---');
    }
  };

  const removeFromCart = async (itemId: string) => {
    try {
      // Find the item first to check its type
      const itemToRemove = cartItems.find(item => item.id === itemId);
      const client = getClient();
      
      const { error } = await client
        .from('cart_items')
        .delete()
        .eq('id', itemId);
      
      if (error) throw error;

      // If it's a workshop item, we could potentially clean up storage or other temporary data
      // For now, we ensure that if it was a workshop item, we log it or handle specific cleanup
      if (itemToRemove?.product_type === 'workshop') {
        console.log('Cleaning up workshop item data for:', itemId);
        // If we had a specific table for workshop assets, we would delete from there.
        // The image in storage is usually kept if it might be referenced elsewhere,
        // but for a true 'cleanup', we could implement storage deletion here if we're sure.
      }
      
      await refreshCart();
    } catch (error) {
      console.error('Error removing from cart:', error);
    }
  };

  const updateQuantity = async (itemId: string, quantity: number) => {
    if (quantity < 1) return;
    
    try {
      const client = getClient();
      const { error } = await client
        .from('cart_items')
        .update({ quantity })
        .eq('id', itemId);
      
      if (error) throw error;
      await refreshCart();
    } catch (error) {
      console.error('Error updating quantity:', error);
    }
  };

  const clearCart = async () => {
    const currentUserId = user?.id || adminUser?.id;
    if (!currentUserId) return;
    try {
      const client = getClient();
      const { error } = await client
        .from('cart_items')
        .delete()
        .eq('user_id', currentUserId);
      
      if (error) throw error;
      setCartItems([]);
    } catch (error) {
      console.error('Error clearing cart:', error);
    }
  };

  const totalPrice = cartItems.reduce((acc, item) => {
    const option = item.product?.options?.find(opt => opt.id === item.selected_option);
    const price = option ? option.price : (item.custom_config?.price || 0);
    return acc + (price * item.quantity);
  }, 0);

  return (
    <CartContext.Provider value={{ 
      cartItems, 
      isLoading, 
      addToCart, 
      removeFromCart, 
      updateQuantity, 
      clearCart,
      totalPrice,
      refreshCart,
      isCartOpen,
      openCart,
      closeCart
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
