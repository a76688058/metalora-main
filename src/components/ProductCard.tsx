import React, { useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Product } from '../data/products';

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const [isLoaded, setIsLoaded] = React.useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const mouseXSpring = useSpring(x);
  const mouseYSpring = useSpring(y);

  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["7deg", "-7deg"]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-7deg", "7deg"]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;

    const rect = ref.current.getBoundingClientRect();

    const width = rect.width;
    const height = rect.height;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const xPct = mouseX / width - 0.5;
    const yPct = mouseY / height - 0.5;

    x.set(xPct);
    y.set(yPct);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <Link to={`/product/${product.id}`} className="block h-full">
      <motion.div
        ref={ref}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          rotateX,
          rotateY,
          transformStyle: "preserve-3d",
        }}
        className="relative w-full aspect-[4/5] rounded-2xl bg-zinc-900 overflow-hidden cursor-pointer group shadow-xl shadow-black/20"
      >
        <motion.div
          style={{
            transform: "translateZ(50px)",
            transformStyle: "preserve-3d",
          }}
          className="absolute inset-0"
        >
          <motion.img
            layoutId={`product-image-${product.id}`}
            src={product.front_image || product.image}
            alt={product.title}
            loading="lazy"
            onLoad={() => setIsLoaded(true)}
            className={`w-full h-full object-cover transition-all duration-700 group-hover:scale-110 ${
              isLoaded ? 'blur-0 opacity-100' : 'blur-xl opacity-50'
            }`}
          />
          
          {/* Metallic Gloss Overlay */}
          <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none mix-blend-overlay" />
          
          {/* Shadow for depth */}
          <div className="absolute inset-0 shadow-inner pointer-events-none" />
        </motion.div>

        {/* Hover Info */}
        <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-4 group-hover:translate-y-0 flex flex-col items-center justify-end text-center">
          <h3 className="text-white font-bold text-xl mb-1 tracking-tight">{product.title}</h3>
          <p className="text-zinc-400 text-xs font-medium uppercase tracking-widest">{product.subtitle || product.artist}</p>
        </div>
      </motion.div>
    </Link>
  );
}
