import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useProducts } from '../context/ProductContext';
import { Link } from 'react-router-dom';

export default function Collection() {
  const { products, isLoading, isError, fetchProducts } = useProducts();

  const visibleProducts = useMemo(() => {
    return products
      .filter(p => p.is_visible !== false)
      .map(p => ({
        ...p,
        animationDelay: Math.random() * 0.5
      }));
  }, [products]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black pt-24 flex items-center justify-center">
        <div className="text-zinc-500 animate-pulse">Loading collection...</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-black pt-24 flex flex-col items-center justify-center gap-4">
        <div className="text-red-400">Failed to load collection.</div>
        <button onClick={fetchProducts} className="px-4 py-2 bg-white text-black rounded-lg">Retry</button>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-black text-white pt-10 pb-24 px-4 md:px-8 lg:px-12"
    >
      <div className="max-w-7xl mx-auto">
        <header className="mb-10 text-center">
          <motion.h1 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="text-3xl md:text-5xl font-serif font-light tracking-[0.2em] uppercase"
          >
            COLLECTION
          </motion.h1>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-4 md:gap-x-6 md:gap-y-5">
          {visibleProducts.map((product) => (
            <motion.div
              key={product.id}
              initial={{ scale: 1.5, y: -100, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ 
                type: "spring", 
                stiffness: 260, 
                damping: 20, 
                delay: product.animationDelay 
              }}
              className="group flex flex-col transform-gpu will-change-transform"
            >
              <Link to={`/product/${product.id}`} className="flex flex-col w-full">
                <div className="block overflow-hidden bg-zinc-900 aspect-[3/4] relative">
                  <img 
                    src={product.image || product.front_image} 
                    alt={product.title}
                    className="w-full h-full object-cover rounded-none transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
                    loading="lazy"
                  />
                  {/* Subtle overlay on hover for brightness change effect */}
                  <div className="absolute inset-0 bg-black/0 transition-colors duration-500 group-hover:bg-black/10 pointer-events-none" />
                </div>
                
                <div className="mt-2 flex flex-col items-center">
                  <h3 className="text-sm md:text-base font-sans font-light tracking-wide text-[#FFFFFF] truncate w-full text-center">
                    {product.title}
                  </h3>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
