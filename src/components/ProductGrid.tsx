import React, { useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useProducts } from '../context/ProductContext';
import { useAuth } from '../context/AuthContext';
import { Product } from '../data/products';
import { supabase } from '../lib/supabase';
import { Sparkles, Lock } from 'lucide-react';
import Skeleton from './Skeleton';

const ProductCard = ({ product }: { product: Product }) => {
  const [isLoaded, setIsLoaded] = React.useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Mouse position for tilt effect
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Smooth spring animation for tilt
  const mouseX = useSpring(x, { stiffness: 300, damping: 30 });
  const mouseY = useSpring(y, { stiffness: 300, damping: 30 });

  // Convert mouse position to rotation degrees
  const rotateX = useTransform(mouseY, [-0.5, 0.5], [7, -7]);
  const rotateY = useTransform(mouseX, [-0.5, 0.5], [-7, 7]);

  // Glint effect position
  const glintX = useTransform(mouseX, [-0.5, 0.5], ['0%', '100%']);
  const glintY = useTransform(mouseY, [-0.5, 0.5], ['0%', '100%']);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseXPos = e.clientX - rect.left;
    const mouseYPos = e.clientY - rect.top;
    const xPct = mouseXPos / width - 0.5;
    const yPct = mouseYPos / height - 0.5;
    x.set(xPct);
    y.set(yPct);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <Link to={`/product/${product.id}`} className="block group active:scale-95 transition-transform duration-150">
      <motion.div
        ref={ref}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          rotateX,
          rotateY,
          transformStyle: 'preserve-3d',
        }}
        className="relative aspect-[4/5] rounded-2xl overflow-hidden bg-zinc-900 shadow-xl shadow-black/40 transition-shadow duration-300 group-hover:shadow-2xl group-hover:shadow-indigo-500/20"
      >
        {/* Image */}
        <motion.img
          layoutId={`product-image-${product.id}`}
          src={product.front_image || product.image}
          alt={product.title}
          loading="lazy"
          onLoad={() => setIsLoaded(true)}
          className={`w-full h-full object-cover transform scale-100 group-hover:scale-110 transition-all duration-700 ease-out ${
            isLoaded ? 'blur-0 opacity-100' : 'blur-xl opacity-50'
          }`}
        />

        {/* Metallic Glint Effect */}
        <motion.div
          style={{
            background: `radial-gradient(circle at ${glintX} ${glintY}, rgba(255,255,255,0.3) 0%, transparent 60%)`,
            opacity: useTransform(mouseX, [-0.5, 0.5], [0, 1]), // Only visible on hover
          }}
          className="absolute inset-0 pointer-events-none mix-blend-overlay z-10"
        />

        {/* Scarcity Badge */}
        <div className="absolute top-3 right-3 flex flex-col gap-1 items-end z-20">
          {product.limited && (
            <div className="bg-black/60 backdrop-blur-md border border-white/10 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-white flex items-center gap-1">
              <Sparkles size={10} className="text-yellow-400" />
              <span>한정판</span>
            </div>
          )}
          {product.created_at && (new Date().getTime() - new Date(product.created_at).getTime()) / (1000 * 3600 * 24) <= 7 && (
            <div className="bg-green-500/80 backdrop-blur-md border border-white/10 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-white">
              신규
            </div>
          )}
        </div>
      </motion.div>

      {/* Product Info */}
      <div className="mt-6 px-2 flex flex-col items-center justify-center text-center">
        <h3 className="text-lg font-bold text-white tracking-tight group-hover:text-indigo-400 transition-colors">
          {product.title}
        </h3>
        <p className="text-xs text-zinc-500 mt-1 font-medium uppercase tracking-widest">
          {product.subtitle || product.artist}
        </p>
      </div>
    </Link>
  );
};

export default function ProductGrid() {
  const { products: allProducts, isLoading } = useProducts();
  const products = allProducts.filter(p => p.is_visible !== false);

  return (
    <section className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 pt-4 pb-24">
      {/* Section Header */}
      <div className="mb-10 text-center">
        <h2 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight">
          큐레이션 컬렉션
        </h2>
        <p className="text-zinc-400 max-w-2xl mx-auto text-base md:text-lg leading-relaxed">
          빛과 금속이 빚어낸 공간의 오브제. 1.15mm 알루미늄 위에 새겨진 영원한 가치를 만나보세요.
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-12 md:gap-x-10 md:gap-y-20">
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
      </div>
      
      {/* Loading Message */}
      {isLoading && (
        <div className="text-center py-10 text-zinc-400 animate-pulse">
          <p>데이터를 불러오는 중입니다...</p>
        </div>
      )}
      
      {/* Minimal Error Message */}
      {!isLoading && products.length === 0 && (
        <div className="text-center py-20 text-zinc-500">
          <p>상품을 불러올 수 없습니다. 잠시 후 다시 시도해주세요.</p>
        </div>
      )}
    </section>
  );
}
