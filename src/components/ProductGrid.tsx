import React, { useRef, useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, useMotionValue, useSpring, useTransform, AnimatePresence } from 'framer-motion';
import { useProducts } from '../context/ProductContext';
import { useAuth } from '../context/AuthContext';
import { Product } from '../data/products';
import { supabase } from '../lib/supabase';
import { Sparkles, Lock } from 'lucide-react';
import Skeleton from './Skeleton';
import ProductCard from './ProductCard';

export default function ProductGrid() {
  const { products: allProducts, isLoading } = useProducts();
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get('q')?.toLowerCase() || '';
  
  const products = allProducts.filter(p => {
    if (p.is_visible === false) return false;
    if (!searchQuery) return true;
    
    const titleMatch = p.title?.toLowerCase().includes(searchQuery);
    const artistMatch = p.artist?.toLowerCase().includes(searchQuery);
    return titleMatch || artistMatch;
  });
  
  return (
    <>
      <section className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 pt-8 pb-24">
        {/* Grid */}
        <motion.div 
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-12 md:gap-x-10 md:gap-y-20"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
        >
          {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-4">
              <Skeleton className="aspect-[4/5] w-full" />
              <Skeleton className="h-6 w-3/4 mx-auto" />
              <Skeleton className="h-4 w-1/2 mx-auto" />
            </div>
          ))
        ) : (
          products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))
        )}
      </motion.div>
      
      {/* Loading Message */}
      {isLoading && (
        <div className="text-center py-10 text-zinc-400 animate-pulse">
          <p>데이터를 불러오는 중입니다...</p>
        </div>
      )}
      
      {/* Minimal Error Message */}
      {!isLoading && products.length === 0 && (
        <div className="text-center py-32 text-zinc-500 font-light tracking-widest">
          <p>{searchQuery ? "검색 결과가 없습니다." : "상품을 불러올 수 없습니다. 잠시 후 다시 시도해주세요."}</p>
        </div>
      )}
    </section>
    </>
  );
}
