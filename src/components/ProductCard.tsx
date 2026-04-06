import React from 'react';
import { Link } from 'react-router-dom';
import { Product } from '../data/products';
import { getFullImageUrl } from '../lib/utils';

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const [isLoaded, setIsLoaded] = React.useState(false);

  // Fast loading texture optimization: append ?w=300&q=70 if it's an unsplash image
  const optimizeImage = (url: string) => {
    if (url.includes('unsplash.com')) {
      return `${url}&w=300&q=70`;
    }
    return url;
  };

  return (
    <Link to={`/product/${product.id}`} className="block h-full">
      <div className="relative w-full aspect-[4/5] rounded-none bg-transparent overflow-hidden cursor-pointer group border-none transform-gpu">
        {getFullImageUrl(product.front_image || product.image) ? (
          <img
            src={optimizeImage(getFullImageUrl(product.front_image || product.image)!) || undefined}
            alt={product.title}
            loading="lazy"
            onLoad={() => setIsLoaded(true)}
            className={`w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 ${
              isLoaded ? 'blur-0 opacity-100' : 'blur-xl opacity-50'
            }`}
          />
        ) : (
          <div className="w-full h-full bg-zinc-900 flex items-center justify-center text-zinc-800">
            <span className="text-xs font-bold opacity-20 uppercase tracking-widest">No Image</span>
          </div>
        )}
        
        {/* Hover Info */}
        <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col items-center justify-end text-center z-30">
          <h3 className="text-white font-bold text-sm md:text-base mb-1 tracking-tight">{product.title}</h3>
          <p className="text-zinc-400 text-[10px] md:text-xs font-medium uppercase tracking-widest">{product.subtitle || product.artist}</p>
        </div>
      </div>
    </Link>
  );
}
