import React from 'react';
import { Link } from 'react-router-dom';
import { Product } from '../data/products';
import { useListImageSrc } from '../hooks/useListImageSrc';

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const [isLoaded, setIsLoaded] = React.useState(false);
  const originalImage = product.front_image || product.image;
  const { src, onError } = useListImageSrc(originalImage, 320);

  return (
    <Link 
      to={`/product/${product.id}`} 
      onClick={() => sessionStorage.setItem('homeScrollPosition', window.scrollY.toString())}
      className="block h-full"
    >
      <div className="relative w-full aspect-[210/297] rounded-none bg-transparent overflow-hidden cursor-pointer group border-none transform-gpu">
        <img
          src={src}
          alt={product.title}
          loading="lazy"
          onLoad={() => setIsLoaded(true)}
          onError={onError}
          className={`w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 ${
            isLoaded ? 'blur-0 opacity-100' : 'blur-xl opacity-50'
          }`}
        />
        
        {/* Metal Shine Effect */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
        
        {/* Hover Info */}
        <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col items-center justify-end text-center z-30">
          <h3 className="text-white font-bold text-sm md:text-base mb-1 tracking-tight">{product.title}</h3>
          <p className="text-zinc-200 text-[12px] md:text-sm font-medium uppercase tracking-widest">{product.subtitle || product.artist}</p>
        </div>
      </div>
    </Link>
  );
}
