import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { Product } from '../data/products';
import { supabase, supabasePublic } from '../lib/supabase';

interface ProductContextType {
  products: Product[];
  isLoading: boolean;
  isError: boolean;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  fetchProducts: () => Promise<void>;
  addProduct: (product: Product) => Promise<void>;
  updateProduct: (id: string, updatedProduct: Product) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  customBasePrice: number;
  updateCustomBasePrice: (price: number) => Promise<void>;
}

const ProductContext = createContext<ProductContextType | undefined>(undefined);

export const useProducts = () => {
  const context = useContext(ProductContext);
  if (!context) {
    throw new Error('useProducts must be used within a ProductProvider');
  }
  return context;
};

export const ProductProvider = ({ children }: { children: ReactNode }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [customBasePrice, setCustomBasePrice] = useState(49000);
  const hasLoadedRef = useRef(false);

  const fetchCustomBasePrice = useCallback(async () => {
    if (!supabasePublic) return;
    try {
      const { data, error } = await supabasePublic
        .from('site_settings')
        .select('value')
        .eq('key', 'custom_base_price')
        .single();
      
      if (error) {
        // PGRST205: Table not found, PGRST116: No rows found
        if (error.code === 'PGRST116' || error.code === 'PGRST205') {
          return;
        }
        throw error;
      }
      
      if (data && data.value) {
        setCustomBasePrice(Number(data.value));
      }
    } catch (error) {
      // Silent fail for fetch to avoid annoying toasts for missing table
      console.warn("Custom base price fetch skipped (table might not exist yet)");
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    if (!supabasePublic) return;
    
    // Check global flag to prevent fetching during signout
    if ((window as any).isLoggingOutFlag) return;

    // Only show loading spinner on initial load
    if (!hasLoadedRef.current) {
      setIsLoading(true);
    }
    setIsError(false);
    
    let attempt = 0;
    const maxRetries = 3;
    let success = false;

    while (attempt < maxRetries && !success) {
      try {
        // Query Optimization: Select only necessary columns and limit results
        const fetchPromise = supabasePublic
          .from('products')
          .select('id, title, subtitle, front_image, back_image, description, is_limited, is_visible, options, created_at, display_order')
          .order('display_order', { ascending: true })
          .limit(20);
          
        // Timeout Extension: 10 seconds (reduced from 25s to prevent long hangs)
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 10000)
        );
        
        const { data, error } = await Promise.race([fetchPromise, timeoutPromise]) as any;
        
        if (error) throw error;
        
        if (data) {
          const mappedData = data.map((item: any) => ({
            ...item,
            artist: item.subtitle || 'Unknown Artist',
            price: item.options?.[0]?.price || 0,
            image: item.front_image || '',
            limited: item.is_limited || false,
          }));
          setProducts(mappedData as Product[]);
          hasLoadedRef.current = true;
          success = true;
        }
      } catch (error: any) {
        attempt++;
        if (attempt >= maxRetries) {
          console.error("Failed to fetch products after 3 attempts:", error);
          if (!hasLoadedRef.current) {
            setIsError(true);
          }
        } else {
          console.warn(`Product fetch attempt ${attempt} failed. Retrying in ${attempt}s...`);
          // Exponential Backoff: 1s, then 2s
          await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        }
      }
    }
    
    setIsLoading(false);
  }, []);

  useEffect(() => {
    // Only fetch if not already loaded to prevent unnecessary re-renders
    if (products.length === 0) {
      fetchProducts();
      fetchCustomBasePrice();
    }

    const handleRefresh = () => {
      fetchProducts();
      fetchCustomBasePrice();
    };

    window.addEventListener('refresh-products', handleRefresh);

    return () => {
      window.removeEventListener('refresh-products', handleRefresh);
    };
  }, [fetchProducts, products.length]);

  const addProduct = async (product: Product) => {
    if (!supabase) return;
    try {
      const { error } = await supabase.from('products').insert(product);
      if (error) throw error;
      await fetchProducts();
    } catch (error) {
      throw error;
    }
  };

  const updateProduct = async (id: string, updatedProduct: Product) => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('products')
        .update({
          ...updatedProduct,
          options: updatedProduct.options,
        })
        .eq('id', id);
      if (error) throw error;
      await fetchProducts();
    } catch (error) {
      throw error;
    }
  };

  const deleteProduct = async (id: string) => {
    if (!supabase) return;
    try {
      // Optimistically update local state
      setProducts(prev => prev.filter(p => p.id !== id));
      
      // Use select() to return the deleted rows. If empty, it means RLS blocked it or ID not found.
      const { data, error } = await supabase.from('products').delete().eq('id', id).select();
      if (error) throw error;
      
      if (!data || data.length === 0) {
        // Revert optimistic update if failed
        await fetchProducts();
        throw new Error('삭제 권한이 없거나 상품을 찾을 수 없습니다. (Supabase RLS 정책을 확인해주세요)');
      }
      
      await fetchProducts();
    } catch (error) {
      console.error("Delete product error:", error);
      // Revert optimistic update on error
      await fetchProducts();
      throw error;
    }
  };

  const updateCustomBasePrice = async (price: number) => {
    if (!supabase) return;
    try {
      setCustomBasePrice(price);
      const { error } = await supabase
        .from('site_settings')
        .upsert({ key: 'custom_base_price', value: price.toString() }, { onConflict: 'key' });
      
      if (error) {
        if (error.code === 'PGRST205') {
          throw new Error('데이터베이스에 "site_settings" 테이블이 없습니다. SQL을 실행하여 테이블을 생성해 주세요.');
        }
        throw error;
      }
    } catch (error) {
      console.error("Update custom base price error:", error);
      await fetchCustomBasePrice();
      throw error;
    }
  };

  const value = React.useMemo(() => ({ 
    products, 
    isLoading, 
    isError, 
    searchTerm, 
    setSearchTerm, 
    fetchProducts, 
    addProduct, 
    updateProduct, 
    deleteProduct,
    customBasePrice,
    updateCustomBasePrice
  }), [
    products, 
    isLoading, 
    isError, 
    searchTerm, 
    customBasePrice,
    fetchProducts,
    addProduct,
    updateProduct,
    deleteProduct,
    updateCustomBasePrice
  ]);

  return (
    <ProductContext.Provider value={value}>
      {children}
    </ProductContext.Provider>
  );
};
