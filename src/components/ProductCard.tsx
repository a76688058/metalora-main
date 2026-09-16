import React from 'react';
import { Link } from 'react-router-dom';
import { Product } from '../data/products';
import { useListImageSrc } from '../hooks/useListImageSrc';
import { Badge } from './ui/Badge';

interface ProductCardProps {
  product: Product & { isNew?: boolean };
  /** CSS sizes for the artwork srcSet. Gallery may pass a grid hint; marquee ignores presentation. */
  sizes?: string;
  /** Default is marquee-compact. Home gallery must pass `gallery`. */
  presentation?: 'gallery';
}

const MARQUEE_SIZES = '(max-width: 767px) 85px, 109px';

export default function ProductCard({
  product,
  sizes = MARQUEE_SIZES,
  presentation,
}: ProductCardProps) {
  const isGallery = presentation === 'gallery';
  const [isLoaded, setIsLoaded] = React.useState(false);
  const originalImage = product.front_image || product.image;
  const { src, srcSet, onError } = useListImageSrc(originalImage, isGallery ? 720 : 320, {
    responsive: isGallery,
  });

  if (!isGallery) {
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
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
          <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col items-center justify-end text-center z-30">
            <p className="text-white font-bold text-sm md:text-base mb-1 tracking-tight">{product.title}</p>
            <p className="text-zinc-200 text-[12px] md:text-sm font-medium uppercase tracking-widest">
              {product.subtitle || product.artist}
            </p>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      to={`/product/${product.id}`}
      aria-label={product.title}
      onClick={() => sessionStorage.setItem('homeScrollPosition', window.scrollY.toString())}
      className="focus-ring group relative block overflow-hidden"
    >
      <div className="relative aspect-[210/297] w-full overflow-hidden bg-surface">
        <img
          src={src}
          srcSet={srcSet}
          sizes={srcSet ? sizes : undefined}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setIsLoaded(true)}
          onError={onError}
          className={`h-full w-full object-cover motion-safe-transition ${
            isLoaded ? 'opacity-100' : 'opacity-60'
          } group-hover:opacity-90`}
          style={{ transitionDuration: 'var(--duration-normal)' }}
        />
        {(product.limited || product.isNew) ? (
          <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
            {product.limited ? <Badge variant="limited">한정판</Badge> : null}
            {product.isNew ? <Badge variant="new">신상품</Badge> : null}
          </div>
        ) : null}
      </div>
    </Link>
  );
}
