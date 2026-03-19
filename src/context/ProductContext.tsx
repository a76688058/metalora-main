import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Product } from '../data/products';
import { supabase, supabasePublic } from '../lib/supabase';

interface ProductContextType {
  products: Product[];
  isLoading: boolean;
  fetchProducts: () => Promise<void>;
  addProduct: (product: Product) => Promise<void>;
  updateProduct: (id: string, updatedProduct: Product) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
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

  const fetchProducts = useCallback(async () => {
    if (!supabasePublic) return;
    
    // Check global flag to prevent fetching during signout
    if ((window as any).isLoggingOutFlag) return;

    try {
      setIsLoading(true);
      
      // Fetch products with a timeout to prevent infinite skeleton
      const fetchPromise = supabasePublic
        .from('products')
        .select('*')
        .order('display_order', { ascending: true });
        
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 5000)
      );
      
      const { data, error } = await Promise.race([fetchPromise, timeoutPromise]) as any;
      
      if (error) throw error;
      if (data) {
        setProducts(data as Product[]);
      }
    } catch (error) {
      console.error("Failed to fetch products:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Only fetch if not already loaded to prevent unnecessary re-renders
    if (products.length === 0) {
      fetchProducts();
    }

    const handleRefresh = () => {
      fetchProducts();
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
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
      await fetchProducts();
    } catch (error) {
      throw error;
    }
  };

  return (
    <ProductContext.Provider value={{ products, isLoading, fetchProducts, addProduct, updateProduct, deleteProduct }}>
      {children}
    </ProductContext.Provider>
  );
};
