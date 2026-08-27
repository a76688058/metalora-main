import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { Product } from '../data/products';
import { supabase, supabasePublic } from '../lib/supabase';
import { useAuth } from './AuthContext';

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
}

const ProductContext = createContext<ProductContextType | undefined>(undefined);

export const useProducts = () => {
  const context = useContext(ProductContext);
  if (!context) {
    throw new Error('useProducts must be used within a ProductProvider');
  }
  return context;
};

const PRODUCT_LIST_SELECT =
  'id, title, subtitle, front_image, back_image, landscape_image, landscape_back_image, supported_orientations, description, is_limited, is_visible, options, created_at, display_order';

// Separate in-flight chains so storefront (anon) and admin (JWT) never share a response.
let inFlightPublicQuery: Promise<{ data: any[] | null; error: any }> | null = null;
let inFlightAdminQuery: Promise<{ data: any[] | null; error: any }> | null = null;

function queryProductList(asAdmin: boolean) {
  const client = asAdmin ? supabase : supabasePublic;
  if (!client) {
    return Promise.resolve({ data: null, error: new Error('Supabase is not configured.') });
  }

  if (asAdmin) {
    if (!inFlightAdminQuery) {
      inFlightAdminQuery = Promise.resolve(
        client
          .from('products')
          .select(PRODUCT_LIST_SELECT)
          .order('display_order', { ascending: true })
          .limit(20)
      ).finally(() => {
        inFlightAdminQuery = null;
      });
    }
    return inFlightAdminQuery;
  }

  if (!inFlightPublicQuery) {
    inFlightPublicQuery = Promise.resolve(
      client
        .from('products')
        .select(PRODUCT_LIST_SELECT)
        .order('display_order', { ascending: true })
        .limit(20)
    ).finally(() => {
      inFlightPublicQuery = null;
    });
  }
  return inFlightPublicQuery;
}

export const ProductProvider = ({ children }: { children: ReactNode }) => {
  const { profile, adminProfile } = useAuth();
  // FE routing/UX only — DB RLS remains authoritative after #16A-2
  const isAdmin = !!(adminProfile?.is_admin || profile?.is_admin);

  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const hasLoadedRef = useRef(false);
  const mountedRef = useRef(true);
  const wasAdminRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchProducts = useCallback(async () => {
    const asAdmin = !!(adminProfile?.is_admin || profile?.is_admin);
    if (asAdmin ? !supabase : !supabasePublic) return;

    // Check global flag to prevent fetching during signout
    if ((window as any).isLoggingOutFlag) return;

    // Only show loading spinner on initial load
    if (!hasLoadedRef.current) {
      setIsLoading(true);
    }
    setIsError(false);

    try {
      const { data, error } = await queryProductList(asAdmin);

      if (!mountedRef.current) return;
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
      }
    } catch (error: any) {
      console.error("Failed to fetch products:", error);
      if (mountedRef.current && !hasLoadedRef.current) {
        setIsError(true);
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [adminProfile?.is_admin, profile?.is_admin]);

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

  // After admin session/profile resolves, refetch so hidden products are included.
  useEffect(() => {
    if (isAdmin && !wasAdminRef.current && hasLoadedRef.current) {
      fetchProducts();
    }
    wasAdminRef.current = isAdmin;
  }, [isAdmin, fetchProducts]);

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

  return (
    <ProductContext.Provider value={{ products, isLoading, isError, searchTerm, setSearchTerm, fetchProducts, addProduct, updateProduct, deleteProduct }}>
      {children}
    </ProductContext.Provider>
  );
};
