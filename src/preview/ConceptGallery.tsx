import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import type { Product } from '../data/products';
import { bindCatalogControls } from './catalogControls';
import './conceptGallery.css';

const SLOTS = ['west', 'north', 'hero', 'east'] as const;
type SortMode = 'latest' | 'random';

const FALLBACK_RGB: Record<string, string> = {
  'card-a': '32, 168, 214',
  'card-b': '156, 46, 198',
  'card-c': '28, 156, 142',
  'card-d': '214, 46, 148',
};

const SECOND_RGB: Record<string, string> = {
  'card-a': '214, 48, 168',
  'card-b': '92, 48, 196',
  'card-c': '196, 148, 52',
  'card-d': '36, 168, 214',
};

const colorCache = new Map<string, string>();

function colorFor(src: string, table: Record<string, string>, backup: string): string {
  const match = Object.keys(table).find((key) => src.includes(key));
  return match ? table[match] : backup;
}

function fallbackFor(src: string): string {
  return colorFor(src, FALLBACK_RGB, '168, 52, 118');
}

export function sampleRgb(img: HTMLImageElement): string {
  const cached = colorCache.get(img.currentSrc || img.src);
  if (cached) return cached;
  const src = img.currentSrc || img.src;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 12;
    canvas.height = 12;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return fallbackFor(src);
    ctx.drawImage(img, 0, 0, 12, 12);
    const data = ctx.getImageData(0, 0, 12, 12).data;
    const bins = Array.from({ length: 12 }, () => ({ r: 0, g: 0, b: 0, n: 0 }));
    let sumRed = 0;
    let sumGreen = 0;
    let sumBlue = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const red = data[i];
      const green = data[i + 1];
      const blue = data[i + 2];
      sumRed += red;
      sumGreen += green;
      sumBlue += blue;
      count += 1;
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      const sat = max - min;
      if (max < 80 || sat < 70) continue;
      const delta = sat || 1;
      let hue = 0;
      if (max === red) hue = ((green - blue) / delta) % 6;
      else if (max === green) hue = (blue - red) / delta + 2;
      else hue = (red - green) / delta + 4;
      const degrees = (hue * 60 + 360) % 360;
      const bin = bins[Math.floor(degrees / 30)];
      bin.r += red * sat;
      bin.g += green * sat;
      bin.b += blue * sat;
      bin.n += sat;
    }
    const best = bins.reduce((winner, bin) => (bin.n > winner.n ? bin : winner));
    const average = count
      ? `${Math.round(sumRed / count)}, ${Math.round(sumGreen / count)}, ${Math.round(sumBlue / count)}`
      : fallbackFor(src);
    const value = best.n
      ? `${Math.round(best.r / best.n)}, ${Math.round(best.g / best.n)}, ${Math.round(best.b / best.n)}`
      : average;
    colorCache.set(src, value);
    return value;
  } catch {
    const value = fallbackFor(src);
    colorCache.set(src, value);
    return value;
  }
}

function ArtworkLink({
  product,
  href,
  className,
  children,
}: {
  product: Product;
  href?: string;
  className: string;
  children: ReactNode;
}) {
  if (href && href.startsWith('#')) {
    return (
      <a className={className} href={href} aria-label={product.title}>
        {children}
      </a>
    );
  }
  return (
    <Link className={className} to={href || `/product/${product.id}`} aria-label={product.title}>
      {children}
    </Link>
  );
}

function Artwork({
  product,
  slot,
  href,
  eager,
}: {
  product: Product;
  slot?: (typeof SLOTS)[number];
  href?: string;
  eager?: boolean;
}) {
  const src = product.front_image || product.image;
  return (
    <ArtworkLink product={product} href={href} className={slot ? `concept-plate is-${slot}` : 'concept-work'}>
      <span className="concept-glow" aria-hidden="true" />
      <img
        src={src}
        alt=""
        decoding="async"
        loading={eager ? 'eager' : 'lazy'}
        onLoad={(event) => {
          const plate = event.currentTarget.closest('.concept-plate, .concept-work');
          if (plate instanceof HTMLElement) {
            const value = sampleRgb(event.currentTarget);
            const src = event.currentTarget.currentSrc || event.currentTarget.src;
            plate.style.setProperty('--rgb', value);
            plate.style.setProperty('--rgb2', colorFor(src, SECOND_RGB, value));
            if (slot) {
              const floor = event.currentTarget.closest('.concept-scroll')?.querySelector(`.concept-floor-light.is-${slot}`);
              if (floor instanceof HTMLElement) {
                floor.style.setProperty('--rgb', value);
                floor.style.setProperty('--rgb2', colorFor(src, SECOND_RGB, value));
              }
            }
          }
        }}
      />
      {slot ? <span className="concept-side" aria-hidden="true" /> : null}
      <span className="concept-spill" aria-hidden="true" />
    </ArtworkLink>
  );
}

export default function ConceptGallery({
  products,
  query,
  onQueryChange,
  onClear,
  sortBy,
  onSort,
  onCustom,
  disabled = false,
  hrefFor,
  note,
  embedded = false,
}: {
  products: Product[];
  query: string;
  onQueryChange: (value: string, commit: boolean) => void;
  onClear: () => void;
  sortBy: SortMode;
  onSort: (mode: SortMode) => void;
  onCustom: () => void;
  disabled?: boolean;
  hrefFor?: (product: Product) => string;
  note?: string;
  embedded?: boolean;
}) {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (embedded) {
      root.style.setProperty('--gallery-progress', '1');
      return;
    }
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const update = () => {
      const narrow = window.innerWidth <= 900;
      if (motion.matches || narrow) {
        root.style.setProperty('--gallery-progress', '1');
        return;
      }
      const rect = root.getBoundingClientRect();
      const view = window.innerHeight;
      const start = view * 0.92;
      const end = view * 0.22;
      const progress = Math.min(1, Math.max(0, (start - rect.top) / (start - end)));
      root.style.setProperty('--gallery-progress', progress.toFixed(4));
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    motion.addEventListener('change', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      motion.removeEventListener('change', onScroll);
    };
  }, [embedded]);

  const featured = products.slice(0, SLOTS.length);
  if (!embedded) bindCatalogControls({
    sort: sortBy,
    onSort,
    search: query,
    onSearch: onQueryChange,
    onClear,
    disabled,
  });

  return (
    <div className={embedded ? 'concept-collection is-embedded' : 'concept-collection'}>
      <section ref={rootRef} className="concept-scroll" aria-label={embedded ? '전시 벽' : '갤러리'}>
        <div className="concept-sticky">
          <div className="concept-stage">
            {embedded ? null : (
            <div className="concept-room" aria-hidden="true">
              <img className="concept-env is-light" src="/preview/gallery-environment-light.webp" alt="" />
              <img className="concept-env is-dark" src="/preview/gallery-environment-dark.webp" alt="" />
            </div>
            )}
            <div className="concept-floor-lights" aria-hidden="true">
              <span className="concept-floor-light is-west" />
              <span className="concept-floor-light is-north" />
              <span className="concept-floor-light is-hero" />
              <span className="concept-floor-light is-east" />
            </div>
            <div className="concept-frames">
              {featured.map((product, index) => (
                <Artwork key={product.id} product={product} slot={SLOTS[index]} href={hrefFor?.(product)} eager />
              ))}
              {featured.length === 0 ? <p className="concept-empty">검색 결과가 없습니다.</p> : null}
            </div>
            <div className="concept-copy">
              <p className="concept-kicker">METAL WALL ART</p>
              <h1>
                고르거나,
                <br />
                만들거나.
              </h1>
              <p className="concept-lead">금속이 만드는 빛의 깊이, 당신만의 공간 예술.</p>
              <div className="concept-actions">
                <button type="button" className="concept-custom focus-ring" onClick={onCustom}>
                  <Sparkles size={14} strokeWidth={1.75} aria-hidden="true" />
                  만들어 보세요.
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {note ? <p className="concept-note">{note}</p> : null}
    </div>
  );
}
