import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProducts } from '../context/ProductContext';
import { Link, useSearchParams } from 'react-router-dom';
import { Clock, Shuffle } from 'lucide-react';
import { getOptimizedImageUrl } from '../lib/utils';

import LoadingScreen from '../components/LoadingScreen';

export default function Collection() {
  const { products, isLoading, isError, fetchProducts } = useProducts();
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get('q') || '';

  const [sortBy, setSortBy] = useState<'latest' | 'random'>('latest');
  const [randomSeed, setRandomSeed] = useState(0);

  const handleSortChange = (type: 'latest' | 'random') => {
    setSortBy(type);
    if (type === 'random') {
      setRandomSeed(Math.random());
    }
  };

  const visibleProducts = useMemo(() => {
    let filtered = products
      .filter(p => p.is_visible !== false)
      .filter(p => {
        if (!searchQuery) return true;
        return p.title.toLowerCase().includes(searchQuery.toLowerCase());
      });

    if (sortBy === 'latest') {
      filtered.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });
    } else if (sortBy === 'random') {
      const seed = randomSeed; // trigger re-evaluation
      filtered = [...filtered].sort(() => Math.random() - 0.5);
    }

    return filtered.map(p => ({
      ...p,
      animationDelay: Math.random() * 0.5,
      isNew: p.created_at ? (new Date().getTime() - new Date(p.created_at).getTime()) < (14 * 24 * 60 * 60 * 1000) : false
    }));
  }, [products, searchQuery, sortBy, randomSeed]);

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    e.currentTarget.src = 'https://picsum.photos/seed/metalora_fallback/210/297';
    e.currentTarget.onerror = null;
  };

  if (isLoading) {
    return <LoadingScreen />;
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
      className="min-h-screen bg-black text-white pb-24 px-4 md:px-8 lg:px-12"
    >
      <div className="max-w-7xl mx-auto">
        <header className="mb-12 flex flex-col md:flex-row justify-between items-center md:items-end gap-6">
          <div className="text-center md:text-left">
            <motion.h1 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="text-3xl md:text-5xl font-serif font-light tracking-[0.2em] uppercase"
            >
              COLLECTION
            </motion.h1>
          </div>

          <div className="flex items-center bg-zinc-900/80 backdrop-blur-md p-1 rounded-full border border-white/10 shadow-xl">
            <button
              onClick={() => handleSortChange('latest')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-[10px] font-bold tracking-widest uppercase transition-all ${
                sortBy === 'latest' ? 'bg-white text-black shadow-md' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Clock size={14} strokeWidth={2.5} />
              최신순
            </button>
            <button
              onClick={() => handleSortChange('random')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-[10px] font-bold tracking-widest uppercase transition-all ${
                sortBy === 'random' ? 'bg-white text-black shadow-md' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Shuffle size={14} strokeWidth={2.5} />
              랜덤순
            </button>
          </div>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-12 md:gap-x-6 md:gap-y-16">
          <AnimatePresence mode="popLayout">
            {visibleProducts.length > 0 ? (
              visibleProducts.map((product, index) => (
                <motion.div
                  key={product.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ 
                    layout: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
                    opacity: { duration: 0.4 },
                    scale: { duration: 0.4 }
                  }}
                  className="group flex flex-col transform-gpu will-change-transform"
                >
                  <Link to={`/product/${product.id}`} className="flex flex-col w-full relative">
                    <div className="block overflow-hidden bg-zinc-900 aspect-[210/297] relative border border-white/5 shadow-2xl shadow-black/50">
                      <img 
                        src={getOptimizedImageUrl(product.image || product.front_image, 400)} 
                        alt={product.title}
                        onError={handleImageError}
                        className="w-full h-full object-cover rounded-none transition-transform duration-[2000ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-110"
                        loading={index < 4 ? "eager" : "lazy"}
                        decoding="async"
                        fetchPriority={index < 4 ? "high" : "auto"}
                      />
                      
                      {/* Badges */}
                      <div className="absolute top-3 left-3 flex flex-col gap-2 z-10">
                        {product.limited && (
                          <span className="bg-white/90 backdrop-blur-md text-black text-[9px] font-black px-2 py-1 tracking-[0.2em] uppercase shadow-lg">
                            Limited
                          </span>
                        )}
                        {product.isNew && (
                          <span className="bg-purple-600/90 backdrop-blur-md text-white text-[9px] font-black px-2 py-1 tracking-[0.2em] uppercase shadow-lg">
                            New
                          </span>
                        )}
                      </div>
  
                      {/* Subtle overlay on hover */}
                      <div className="absolute inset-0 bg-black/0 transition-all duration-700 group-hover:bg-black/30 pointer-events-none flex items-center justify-center">
                        <span className="text-[10px] font-black tracking-[0.4em] uppercase text-white opacity-0 group-hover:opacity-100 transition-all duration-700 translate-y-4 group-hover:translate-y-0">
                          View Details
                        </span>
                      </div>
                    </div>
                    
                    <div className="mt-6 flex flex-col items-center space-y-2">
                      <div className="flex flex-col items-center">
                        <p className="text-[9px] font-medium tracking-[0.3em] text-zinc-500 uppercase mb-1">
                          {product.artist}
                        </p>
                        <h3 className="text-[12px] md:text-[14px] font-sans font-light tracking-[0.1em] text-white uppercase truncate w-full text-center group-hover:text-purple-400 transition-colors duration-500">
                          {product.title}
                        </h3>
                      </div>
                      <div className="h-[1px] w-4 bg-white/10 group-hover:w-8 transition-all duration-700" />
                      <p className="text-[11px] md:text-[12px] font-sans font-medium tracking-widest text-zinc-300">
                        ₩{product.options?.[0]?.price?.toLocaleString() || '0'}
                      </p>
                    </div>
                  </Link>
                </motion.div>
              ))
            ) : (
              <motion.div 
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="col-span-full flex flex-col items-center justify-center py-32 text-white/50"
              >
                <p className="text-lg font-light tracking-wider">검색 결과가 없습니다.</p>
                <p className="text-sm mt-2">다른 검색어를 입력해 보세요.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
