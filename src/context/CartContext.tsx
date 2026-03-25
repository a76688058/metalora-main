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
  product?: Product;
}

interface CartContextType {
  cartItems: CartItem[];
  isLoading: boolean;
  addToCart: (productId: string, selectedOption: string, quantity: number) => Promise<void>;
  removeFromCart: (itemId: string) => Promise<void>;
  updateQuantity: (itemId: string, quantity: number) => Promise<void>;
  clearCart: () => Promise<void>;
  totalPrice: number;
  refreshCart: () => Promise<void>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { user, session: authSession } = useAuth();
  const { showToast } = useToast();

  const refreshCart = useCallback(async () => {
    try {
      // 1. Check if we already have a session from AuthContext
      let session = authSession;
      
      if (!session) {
        // If not, try to get it from supabase (might trigger refresh)
        const { data: { session: s }, error } = await supabase.auth.getSession();
        if (error) {
          const errorMsg = error.message || String(error);
          if (errorMsg.includes('Lock was stolen')) {
            console.warn('Cart Refresh: Lock was stolen by another request. Skipping this cycle.');
            return;
          }
          if (errorMsg.includes('Invalid Refresh Token') || errorMsg.includes('Refresh Token Not Found')) {
            console.warn('Cart Refresh: Session invalid or expired. Clearing cart.');
            setCartItems([]);
            return;
          }
          throw error;
        }
        session = s;
      }
      
      if (!session) {
        console.warn("Session lost, cart refresh skipped.");
        setCartItems([]);
        return;
      }

      setIsLoading(true);
      const { data, error } = await supabase
        .from('cart_items')
        .select(`
          *,
          product:products(*)
        `)
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCartItems(data || []);
    } catch (error) {
      const errorStr = String(error);
      if (errorStr.includes('Lock was stolen')) {
        console.warn('refreshCart caught lock stolen error:', error);
        return;
      }
      if (errorStr.includes('Invalid Refresh Token') || errorStr.includes('Refresh Token Not Found')) {
        console.warn('refreshCart: Session invalid or expired. Clearing cart.');
        setCartItems([]);
        return;
      }
      console.error('Error fetching cart:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCart();

    // Resurrection Logic: 사용자가 다시 탭을 클릭하거나 앱으로 돌아오는 순간 감지
    const handleFocus = () => {
      refreshCart();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [refreshCart]);

  const addToCart = async (productId: string, selectedOption: string, quantity: number) => {
    try {
      setIsLoading(true);
      
      // Get current user session explicitly to ensure user_id is present
      const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();
      
      if (userError) {
        if (userError.message?.includes('Lock was stolen') || String(userError).includes('Lock was stolen')) {
          showToast('인증 세션 충돌이 발생했습니다. 다시 시도해주세요.', 'error');
          return;
        }
        throw userError;
      }
      
      if (!currentUser) {
        showToast('로그인이 필요합니다.', 'error');
        return;
      }

      // Check if item already exists
      const { data: existingItem } = await supabase
        .from('cart_items')
        .select('*')
        .eq('user_id', currentUser.id)
        .eq('product_id', productId)
        .eq('selected_option', selectedOption)
        .single();

      if (existingItem) {
        const { error } = await supabase
          .from('cart_items')
          .update({ quantity: existingItem.quantity + quantity })
          .eq('id', existingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('cart_items')
          .insert([
            {
              user_id: currentUser.id,
              product_id: productId,
              selected_option: selectedOption,
              quantity: quantity
            }
          ]);
        if (error) throw error;
      }

      await refreshCart();
      showToast('내 컬렉션에 안전하게 담겼습니다', 'success');
    } catch (error) {
      console.error('Error adding to collection:', error);
      showToast('컬렉션 담기에 실패했습니다.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const removeFromCart = async (itemId: string) => {
    try {
      const { error } = await supabase
        .from('cart_items')
        .delete()
        .eq('id', itemId);
      
      if (error) throw error;
      await refreshCart();
      showToast('상품이 삭제되었습니다.', 'success');
    } catch (error) {
      console.error('Error removing from cart:', error);
      showToast('삭제에 실패했습니다.', 'error');
    }
  };

  const updateQuantity = async (itemId: string, quantity: number) => {
    if (quantity < 1) return;
    
    try {
      const { error } = await supabase
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
    if (!user) return;
    try {
      const { error } = await supabase
        .from('cart_items')
        .delete()
        .eq('user_id', user.id);
      
      if (error) throw error;
      setCartItems([]);
    } catch (error) {
      console.error('Error clearing cart:', error);
    }
  };

  const totalPrice = cartItems.reduce((acc, item) => {
    const option = item.product?.options?.find(opt => opt.id === item.selected_option);
    const price = option ? option.price : 0;
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
      refreshCart
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
