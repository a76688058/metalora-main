import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useProducts } from '../context/ProductContext';
import ProductCard from './ProductCard';
import { Product } from '../data/products';
import { motion, useMotionValue, useAnimationFrame } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';

interface ProductGridProps {
  products?: Product[];
}

const MARQUEE_VELOCITY = -0.5;

function useNarrowMarquee() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const apply = () => setNarrow(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);
  return narrow;
}

function MarqueeTrack({ products, startOffset = 0 }: { products: Product[]; startOffset?: number }) {
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const x = useMotionValue(0);
  const lastDragTime = useRef(0);
  const isAutoPlaying = useRef(true);
  const offsetApplied = useRef(false);

  const { marqueeItems, finalCopies } = useMemo(() => {
    if (products.length === 0) return { marqueeItems: [] as Product[], finalCopies: 0 };
    const minItems = 32;
    const copiesNeeded = Math.max(4, Math.ceil(minItems / products.length));
    const copies = copiesNeeded % 2 === 0 ? copiesNeeded : copiesNeeded + 1;
    const items: Product[] = [];
    for (let i = 0; i < copies; i += 1) items.push(...products);
    return { marqueeItems: items, finalCopies: copies };
  }, [products]);

  useEffect(() => {
    if (containerRef.current && finalCopies > 0) {
      setContentWidth(containerRef.current.scrollWidth / finalCopies);
    }
  }, [marqueeItems, finalCopies]);

  useEffect(() => {
    if (!contentWidth || offsetApplied.current || startOffset === 0) return;
    x.set(-Math.min(startOffset, contentWidth));
    offsetApplied.current = true;
  }, [contentWidth, startOffset, x]);

  useAnimationFrame((_t, delta) => {
    let currentX = x.get();
    if (isDragging) {
      isAutoPlaying.current = false;
      lastDragTime.current = Date.now();
      if (contentWidth > 0) {
        const wrapped = wrap(-contentWidth, 0, currentX);
        if (wrapped !== currentX) x.set(wrapped);
      }
      return;
    }
    if (!isAutoPlaying.current) {
      const velocity = x.getVelocity();
      if (Math.abs(velocity) < 5) {
        if (Date.now() - lastDragTime.current > 1500) isAutoPlaying.current = true;
      } else {
        lastDragTime.current = Date.now();
      }
      if (contentWidth > 0) {
        const wrapped = wrap(-contentWidth, 0, currentX);
        if (wrapped !== currentX) x.set(wrapped);
      }
      return;
    }
    currentX += MARQUEE_VELOCITY * (delta / 16.66);
    if (contentWidth > 0) currentX = wrap(-contentWidth, 0, currentX);
    x.set(currentX);
  });

  if (marqueeItems.length === 0) return null;

  return (
    <motion.div
      ref={containerRef}
      className={`flex w-max items-center transform-gpu will-change-transform ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={{ x }}
      drag="x"
      dragMomentum={false}
      onPointerDown={() => {
        isAutoPlaying.current = false;
        lastDragTime.current = Date.now();
      }}
      onPointerUp={() => { lastDragTime.current = Date.now(); }}
      onPointerCancel={() => { lastDragTime.current = Date.now(); }}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => setIsDragging(false)}
      dragTransition={{ power: 0.8, timeConstant: 200, restDelta: 0.5 }}
    >
      {marqueeItems.map((product, index) => {
        const clone = index >= products.length;
        return (
          <motion.div
            key={`${product.id}-${index}`}
            className="w-[70px] md:w-[109px] flex-shrink-0 mx-1.5 md:mx-4 transform-gpu will-change-transform"
            animate={{ scale: isDragging ? 0.97 : 1 }}
            transition={{ duration: 0.2 }}
            whileHover={!isDragging ? { scale: 1.03 } : {}}
            aria-hidden={clone ? true : undefined}
            inert={clone ? true : undefined}
          >
            <ProductCard product={product} />
          </motion.div>
        );
      })}
    </motion.div>
  );
}

// Custom wrap function
const wrap = (min: number, max: number, v: number) => {
  const rangeSize = max - min;
  return ((((v - min) % rangeSize) + rangeSize) % rangeSize) + min;
};

function ProductGrid({ products }: ProductGridProps) {
  const { products: allProducts, isLoading, isError, fetchProducts } = useProducts();
  const { theme } = useTheme();
  const narrow = useNarrowMarquee();

  const visibleProducts = useMemo(() => {
    if (products !== undefined) return products;
    return allProducts.filter(p => p.is_visible !== false);
  }, [products, allProducts]);

  const rows = useMemo(() => {
    const shuffled = [...visibleProducts].sort(() => Math.random() - 0.5);
    if (!narrow || shuffled.length < 2) return [shuffled];
    const mid = Math.ceil(shuffled.length / 2);
    return [shuffled.slice(0, mid), shuffled.slice(mid)];
  }, [visibleProducts, narrow]);

  if (isLoading) {
    const skeletonTone = theme === 'dark' ? 'bg-zinc-900 border-white/5' : 'bg-zinc-100 border-black/5';
    return (
      <section
        id="product-grid"
        aria-busy="true"
        className={`relative w-full py-0 overflow-x-hidden overflow-y-visible flex items-center transition-colors duration-500 ${
          theme === 'dark' ? 'bg-black' : 'bg-white'
        }`}
      >
        <div className={`absolute left-0 top-0 bottom-0 w-16 md:w-32 z-20 pointer-events-none ${
          theme === 'dark' ? 'bg-gradient-to-r from-black to-transparent' : 'bg-gradient-to-r from-white to-transparent'
        }`} />
        <div className={`absolute right-0 top-0 bottom-0 w-16 md:w-32 z-20 pointer-events-none ${
          theme === 'dark' ? 'bg-gradient-to-l from-black to-transparent' : 'bg-gradient-to-l from-white to-transparent'
        }`} />
        <div className="flex w-full items-center overflow-hidden">
          {Array.from({ length: 12 }).map((_, index) => (
            <div
              key={index}
              className="w-[70px] md:w-[109px] flex-shrink-0 mx-1.5 md:mx-4"
            >
              <div className={`w-full aspect-[210/297] border animate-pulse ${skeletonTone}`} />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section
        id="product-grid"
        className={`relative w-full py-16 flex flex-col items-center justify-center gap-4 transition-colors duration-500 ${
          theme === 'dark' ? 'bg-black' : 'bg-white'
        }`}
      >
        <div className="text-red-400">작품을 불러올 수 없습니다.</div>
        <button
          onClick={fetchProducts}
          className={`px-4 py-2 rounded-lg ${theme === 'dark' ? 'bg-white text-black' : 'bg-black text-white'}`}
        >
          다시 시도
        </button>
      </section>
    );
  }

  if (rows.every((row) => row.length === 0)) {
    return null;
  }

  return (
    <section id="product-grid" className={`relative w-full py-0 overflow-x-hidden overflow-y-visible flex items-center transition-colors duration-500 ${
      theme === 'dark' ? 'bg-black' : 'bg-white'
    }`}>
      {/* Fade Masks for smooth appearance/disappearance */}
      <div className={`absolute left-0 top-0 bottom-0 w-16 md:w-32 z-20 pointer-events-none ${
        theme === 'dark' ? 'bg-gradient-to-r from-black to-transparent' : 'bg-gradient-to-r from-white to-transparent'
      }`} />
      <div className={`absolute right-0 top-0 bottom-0 w-16 md:w-32 z-20 pointer-events-none ${
        theme === 'dark' ? 'bg-gradient-to-l from-black to-transparent' : 'bg-gradient-to-l from-white to-transparent'
      }`} />

      <div className={`flex w-full min-w-0 flex-col ${rows.length > 1 ? 'gap-2.5' : ''}`}>
        {rows.map((row, rowIndex) => (
          <MarqueeTrack key={rowIndex} products={row} startOffset={rowIndex === 1 ? 72 : 0} />
        ))}
      </div>
    </section>
  );
}

export default React.memo(ProductGrid);
