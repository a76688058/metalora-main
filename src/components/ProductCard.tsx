import React from 'react';
import { Link } from 'react-router-dom';
import { Product } from '../data/products';
import { getOptimizedImageUrl } from '../lib/utils';

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const [isLoaded, setIsLoaded] = React.useState(false);

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    e.currentTarget.src = 'https://picsum.photos/seed/metalora_fallback/210/297';
    e.currentTarget.onerror = null; // Prevent infinite loop
  };

  return (
    <Link to={`/product/${product.id}`} className="block h-full">
      <div className="relative w-full aspect-[210/297] rounded-none bg-transparent overflow-hidden cursor-pointer group border-none transform-gpu">
        <img
          src={getOptimizedImageUrl(product.front_image || product.image, 200) || undefined}
          alt={product.title}
          loading="lazy"
          onLoad={() => setIsLoaded(true)}
          onError={handleImageError}
          className={`w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 ${
            isLoaded ? 'blur-0 opacity-100' : 'blur-xl opacity-50'
          }`}
        />
        
        {/* Hover Info */}
        <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col items-center justify-end text-center z-30">
          <h3 className="text-white font-bold text-sm md:text-base mb-1 tracking-tight">{product.title}</h3>
          <p className="text-zinc-400 text-[10px] md:text-xs font-medium uppercase tracking-widest">{product.subtitle || product.artist}</p>
        </div>
      </div>
    </Link>
  );
}
