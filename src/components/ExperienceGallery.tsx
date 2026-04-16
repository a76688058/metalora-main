import React, { useRef, useMemo, useState, useEffect } from 'react';
import { motion, useScroll, useTransform, useSpring, useMotionValue, useVelocity, useAnimationFrame } from 'framer-motion';
import { useProducts } from '../context/ProductContext';
import { useNavigate } from 'react-router-dom';
import { FALLBACK_IMAGE } from '../lib/utils';

interface BentoCardProps {
  product: any;
  size: 'small' | 'medium' | 'large' | 'tall' | 'wide';
}

const BentoCard = ({ product, size }: BentoCardProps) => {
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement>(null);
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);
  const [glossX, setGlossX] = useState(0);
  const [glossY, setGlossY] = useState(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    const rotateXValue = ((y - centerY) / centerY) * -10;
    const rotateYValue = ((x - centerX) / centerX) * 10;
    
    setRotateX(rotateXValue);
    setRotateY(rotateYValue);
    setGlossX((x / rect.width) * 100);
    setGlossY((y / rect.height) * 100);
  };

  const handleMouseLeave = () => {
    setRotateX(0);
    setRotateY(0);
  };

  const sizeClasses = {
    small: 'w-48 h-48 md:w-64 md:h-64',
    medium: 'w-64 h-64 md:w-80 md:h-80',
    large: 'w-80 h-80 md:w-[450px] md:h-[450px]',
    tall: 'w-48 h-72 md:w-64 md:h-[400px]',
    wide: 'w-72 h-48 md:w-[500px] md:h-64',
  };

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={() => navigate(`/product/${product.id}`)}
      style={{
        rotateX,
        rotateY,
        transformStyle: 'preserve-3d',
      }}
      whileHover={{ scale: 1.02 }}
      className={`relative flex-shrink-0 mx-4 rounded-2xl overflow-hidden border border-white/10 bg-zinc-900 group cursor-pointer transform-gpu will-change-transform ${sizeClasses[size]}`}
    >
      <img
        src={product.image_url || FALLBACK_IMAGE}
        alt={product.name}
        className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-500"
        referrerPolicy="no-referrer"
        loading="lazy"
      />
      
      {/* Glassmorphism Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      
      {/* Dynamic Gloss Effect */}
      <div 
        className="absolute inset-0 opacity-0 group-hover:opacity-30 transition-opacity duration-300 pointer-events-none"
        style={{
          background: `radial-gradient(circle at ${glossX}% ${glossY}%, rgba(255,255,255,0.4) 0%, transparent 60%)`,
        }}
      />

      {/* Content Overlay */}
      <div className="absolute inset-0 p-6 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500">
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-400 mb-2">Collection</p>
        <h3 className="text-lg font-bold text-white tracking-tight">{product.name}</h3>
      </div>

      {/* 1.15mm Edge Highlight (Subtle) */}
      <div className="absolute inset-0 border border-white/5 rounded-2xl pointer-events-none" />
    </motion.div>
  );
};

export default function ExperienceGallery() {
  const { products, isLoading } = useProducts();
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [constraints, setConstraints] = useState({ left: 0, right: 0 });
  
  const x = useMotionValue(0);
  const baseVelocity = -0.3; // pixels per frame
  const isAutoPlaying = useRef(true);
  const lastInteractionTime = useRef(0);

  const bentoProducts = useMemo(() => {
    if (!products || products.length === 0) return [];
    
    const sizes: ('small' | 'medium' | 'large' | 'tall' | 'wide')[] = ['large', 'small', 'tall', 'medium', 'wide', 'medium', 'small', 'large'];
    
    // Duplicate products to fill the marquee
    const repeated = [];
    const count = Math.ceil(20 / products.length);
    for (let i = 0; i < count; i++) {
      repeated.push(...products);
    }
    
    return repeated.map((p, i) => ({
      product: p,
      size: sizes[i % sizes.length],
      id: `${p.id}-${i}`
    }));
  }, [products]);

  useEffect(() => {
    if (containerRef.current) {
      const updateConstraints = () => {
        const containerWidth = containerRef.current?.scrollWidth || 0;
        const viewportWidth = window.innerWidth;
        setConstraints({ left: -(containerWidth - viewportWidth), right: 0 });
      };
      
      updateConstraints();
      window.addEventListener('resize', updateConstraints);
      return () => window.removeEventListener('resize', updateConstraints);
    }
  }, [bentoProducts]);

  useAnimationFrame((t, delta) => {
    if (isDragging) {
      isAutoPlaying.current = false;
      lastInteractionTime.current = Date.now();
      return;
    }

    // Resume auto-play after 3 seconds of no interaction
    if (Date.now() - lastInteractionTime.current > 3000) {
      isAutoPlaying.current = true;
    }

    if (isAutoPlaying.current) {
      const moveBy = baseVelocity * (delta / 16.66);
      let nextX = x.get() + moveBy;
      
      // Loop logic
      if (nextX < constraints.left) {
        nextX = 0;
      } else if (nextX > 0) {
        nextX = constraints.left;
      }
      
      x.set(nextX);
    }
  });

  if (isLoading || bentoProducts.length === 0) return null;

  return (
    <section className="relative min-h-screen py-32 bg-black overflow-hidden select-none flex flex-col items-center justify-center">
      <div className="max-w-7xl mx-auto px-6 mb-16 text-center w-full flex flex-col items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px 0px -100px 0px", amount: 0.2 }}
          transition={{ duration: 0.8, ease: [0.17, 0.67, 0.83, 0.67] }}
          className="space-y-6"
        >
          <span className="text-xs font-black uppercase tracking-[0.5em] text-zinc-600">Archive</span>
          <h2 className="text-3xl md:text-5xl font-light tracking-[0.2em] text-white/80 uppercase">
            지나간 작품도 다시 확인해보세요.
          </h2>
        </motion.div>
      </div>

      {/* Marquee Container */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: "-100px 0px -100px 0px", amount: 0.2 }}
        transition={{ duration: 0.8, delay: 0.2, ease: [0.17, 0.67, 0.83, 0.67] }}
        className="relative w-full overflow-visible"
      >
        {/* Fade Masks */}
        <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-black to-transparent z-20 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-black to-transparent z-20 pointer-events-none" />

        <motion.div
          ref={containerRef}
          drag="x"
          dragConstraints={constraints}
          dragElastic={0.1}
          dragTransition={{ power: 0.2, timeConstant: 200 }}
          onDragStart={() => {
            setIsDragging(true);
            isAutoPlaying.current = false;
          }}
          onDragEnd={() => {
            setIsDragging(false);
            lastInteractionTime.current = Date.now();
          }}
          style={{ x }}
          className={`flex items-center w-max px-[10vw] transform-gpu will-change-transform ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        >
          {bentoProducts.map((item) => (
            <BentoCard key={item.id} product={item.product} size={item.size} />
          ))}
        </motion.div>
      </motion.div>

      {/* Interaction Hint */}
      <div className="mt-16 flex justify-center">
        <motion.div 
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-100px 0px -100px 0px", amount: 0.2 }}
          transition={{ duration: 0.8, delay: 0.4, ease: [0.17, 0.67, 0.83, 0.67] }}
          className="flex items-center gap-4 text-zinc-600"
        >
          <div className="w-12 h-px bg-zinc-800" />
          <span className="text-[10px] font-bold uppercase tracking-[0.3em]">Drag to Explore</span>
          <div className="w-12 h-px bg-zinc-800" />
        </motion.div>
      </div>
    </section>
  );
}
