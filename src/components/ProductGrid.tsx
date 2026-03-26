import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useProducts } from '../context/ProductContext';
import ProductCard from './ProductCard';
import { motion, useMotionValue, useAnimationFrame } from 'framer-motion';

// Custom wrap function
const wrap = (min: number, max: number, v: number) => {
  const rangeSize = max - min;
  return ((((v - min) % rangeSize) + rangeSize) % rangeSize) + min;
};

export default function ProductGrid() {
  const { products: allProducts, isLoading, isError, fetchProducts } = useProducts();
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = useState(0);
  
  const x = useMotionValue(0);
  const baseVelocity = -0.5; // pixels per frame
  const lastDragTime = useRef(0);
  const isAutoPlaying = useRef(true);

  const visibleProducts = useMemo(() => {
    return allProducts.filter(p => p.is_visible !== false);
  }, [allProducts]);

  const { marqueeItems, finalCopies } = useMemo(() => {
    if (visibleProducts.length === 0) return { marqueeItems: [], finalCopies: 0 };
    
    const shuffled = [...visibleProducts].sort(() => Math.random() - 0.5);
    
    const minItems = 32;
    const copiesNeeded = Math.max(4, Math.ceil(minItems / shuffled.length));
    const finalCopies = copiesNeeded % 2 === 0 ? copiesNeeded : copiesNeeded + 1;
    
    const items = [];
    for (let i = 0; i < finalCopies; i++) {
      items.push(...shuffled);
    }
    return { marqueeItems: items, finalCopies };
  }, [visibleProducts]);

  useEffect(() => {
    if (containerRef.current && finalCopies > 0) {
      const totalWidth = containerRef.current.scrollWidth;
      setContentWidth(totalWidth / finalCopies);
    }
  }, [marqueeItems, finalCopies]);

  useAnimationFrame((t, delta) => {
    let currentX = x.get();

    if (isDragging) {
      isAutoPlaying.current = false;
      lastDragTime.current = Date.now();
      
      if (contentWidth > 0) {
        const wrapped = wrap(-contentWidth, 0, currentX);
        if (wrapped !== currentX) {
          x.set(wrapped);
        }
      }
      return;
    }

    if (!isAutoPlaying.current) {
      const v = x.getVelocity();
      if (Math.abs(v) < 5) {
        if (Date.now() - lastDragTime.current > 1500) {
          isAutoPlaying.current = true;
        }
      } else {
        lastDragTime.current = Date.now();
      }
      
      if (contentWidth > 0) {
        const wrapped = wrap(-contentWidth, 0, currentX);
        if (wrapped !== currentX) {
          x.set(wrapped);
        }
      }
      return;
    }

    // Auto play
    const moveBy = baseVelocity * (delta / 16.66);
    currentX += moveBy;
    
    if (contentWidth > 0) {
      currentX = wrap(-contentWidth, 0, currentX);
    }
    x.set(currentX);
  });

  if (isLoading) {
    return (
      <div className="py-24 flex items-center justify-center">
        <div className="text-zinc-500 animate-pulse">Loading products...</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-4">
        <div className="text-red-400">Failed to load products.</div>
        <button onClick={fetchProducts} className="px-4 py-2 bg-white text-black rounded-lg">Retry</button>
      </div>
    );
  }

  if (marqueeItems.length === 0) {
    return null;
  }

  return (
    <section id="product-grid" className="relative w-full py-0 overflow-x-hidden overflow-y-visible bg-black flex items-center">
      {/* Fade Masks for smooth appearance/disappearance */}
      <div className="absolute left-0 top-0 bottom-0 w-16 md:w-32 bg-gradient-to-r from-black to-transparent z-20 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-16 md:w-32 bg-gradient-to-l from-black to-transparent z-20 pointer-events-none" />

      {/* Marquee Track */}
      <motion.div 
        ref={containerRef}
        className={`flex w-max items-center transform-gpu will-change-transform ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{ x }}
        drag="x"
        onDragStart={() => setIsDragging(true)}
        onDragEnd={() => setIsDragging(false)}
        dragTransition={{ power: 0.8, timeConstant: 200, restDelta: 0.5 }}
      >
        {marqueeItems.map((product, index) => (
          <motion.div 
            key={`${product.id}-${index}`} 
            className="w-[95px] md:w-[136px] flex-shrink-0 mx-2 md:mx-4 transform-gpu will-change-transform"
            animate={{ scale: isDragging ? 0.97 : 1 }}
            transition={{ duration: 0.2 }}
            whileHover={!isDragging ? { scale: 1.03 } : {}}
          >
            <ProductCard product={product} />
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
