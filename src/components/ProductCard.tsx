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

function catalogPriceLabel(product: Product): string | null {
  const amount = typeof product.price === 'number'
    ? product.price
    : product.options?.find((option) => option.isActive)?.price;
  if (typeof amount !== 'number') return null;
  return `₩${amount.toLocaleString('ko-KR')}`;
}

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
    const priceLabel = catalogPriceLabel(product);
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
          <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col items-center justify-end bg-gradient-to-t from-black/80 to-transparent p-3 text-center opacity-0 transition-opacity duration-500 group-hover:opacity-100">
            <p className="text-sm font-medium tracking-[-0.02em] text-[#f3f1ec]">{product.title}</p>
            {priceLabel ? (
              <p className="mt-1 text-xs text-[#c9c4b8]">{priceLabel}</p>
            ) : null}
          </div>
        </div>
      </Link>
    );
  }

  const priceLabel = catalogPriceLabel(product);

  return (
    <Link
      to={`/product/${product.id}`}
      onClick={() => sessionStorage.setItem('homeScrollPosition', window.scrollY.toString())}
      className="focus-ring group block"
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
      <div className="mt-3 space-y-1">
        <p className="text-[0.9375rem] font-medium leading-snug tracking-[-0.02em] text-[#16150f] dark:text-[#f3f1ec]">
          <span className="bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_1px] bg-left-bottom bg-no-repeat pb-0.5 transition-[background-size] duration-300 group-hover:bg-[length:100%_1px] group-focus-visible:bg-[length:100%_1px]">
            {product.title}
          </span>
        </p>
        {priceLabel ? (
          <p className="text-sm text-[#3f3c36] dark:text-[#c9c4b8]">{priceLabel}</p>
        ) : null}
      </div>
    </Link>
  );
}
