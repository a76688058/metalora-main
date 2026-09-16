import React, { useMemo, useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProducts } from '../context/ProductContext';
import { useSearchParams, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { Clock, Shuffle } from 'lucide-react';
import ProductGrid from '../components/ProductGrid';
import ProductCard from '../components/ProductCard';
import HeroSpatial from '../components/hero/HeroSpatial';
import { Button } from '../components/ui/Button';
import { useTheme } from '../context/ThemeContext';

// Document-lifetime: first Home mount vs later SPA remounts (e.g. Product → Back).
let hasMountedHomeInThisDocument = false;

const ARTWORK_IMAGE_SIZES =
  '(max-width: 639px) calc((100vw - 3rem) / 2), (max-width: 767px) calc((100vw - 4rem) / 2), (max-width: 1023px) calc((100vw - 6rem) / 3), calc((min(100vw, 80rem) - 7.5rem) / 4)';

export default function Home() {
  const { products, isLoading, isError, fetchProducts } = useProducts();
  const { theme } = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get('q') || '';
  const isSearchMode = Boolean(searchQuery);
  const location = useLocation();
  const navigate = useNavigate();
  const navType = useNavigationType();
  const { openCart } = useCart();

  const [sortBy, setSortBy] = useState<'latest' | 'random'>('latest');
  const [randomSeed, setRandomSeed] = useState(0);
  const hasRestoredScroll = useRef(false);

  const handleSortChange = (type: 'latest' | 'random') => {
    setSortBy(type);
    if (type === 'random') {
      setRandomSeed(Math.random());
    }
  };

  const clearSearch = () => {
    setSearchParams({});
  };

  useEffect(() => {
    if (location.state?.openCart) {
      openCart();
      navigate('/', { replace: true, state: { ...location.state, openCart: undefined } });
    }
    
    if (location.state?.scrollTo === 'marquee-section' || location.hash === '#marquee-section') {
      setTimeout(() => {
        const element = document.getElementById('marquee-section');
        if (element) {
          const headerOffset = 100; // Account for fixed header height
          const elementPosition = element.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.scrollY - headerOffset;

          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });
        }
      }, 100);
      
      // Clean up the hash/state without triggering a full re-render
      if (location.hash === '#marquee-section') {
        window.history.replaceState(null, '', '/');
      } else if (location.state?.scrollTo === 'marquee-section') {
        navigate('/', { replace: true, state: { ...location.state, scrollTo: undefined } });
      }
    }
  }, [location.state, location.hash, openCart, navigate]);

  // Restore scroll position (SPA Back only — not refresh / direct entry)
  useEffect(() => {
    if (!hasMountedHomeInThisDocument) {
      hasMountedHomeInThisDocument = true;

      const navigationEntry = performance.getEntriesByType(
        'navigation',
      )[0] as PerformanceNavigationTiming | undefined;
      const loadType = navigationEntry?.type;

      // First Home in this document after navigate/reload (or unknown): never restore stale Y.
      // React Router also reports these as POP, which previously restored sessionStorage.
      if (loadType !== 'back_forward') {
        sessionStorage.removeItem('homeScrollPosition');
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        hasRestoredScroll.current = true;
        return;
      }
      // First Home + document back_forward: allow saved-position restore below.
    }

    if (navType === 'POP' && !isLoading && products.length > 0 && !hasRestoredScroll.current) {
      const savedScroll = sessionStorage.getItem('homeScrollPosition');
      if (savedScroll) {
        const scrollPos = parseInt(savedScroll, 10);
        if (!isNaN(scrollPos) && scrollPos > 0) {
          // Aggressive restore to combat layout shifts
          let frameCount = 0;
          const restore = () => {
            window.scrollTo({ top: scrollPos, behavior: 'instant' });
            frameCount++;
            if (frameCount < 20) { // Force for ~300ms
              requestAnimationFrame(restore);
            }
          };
          requestAnimationFrame(restore);
        }
      }
      hasRestoredScroll.current = true;
    }
  }, [navType, isLoading, products.length]);

  // Reset restoration flag on new navigation
  useEffect(() => {
    if (navType === 'PUSH' && location.pathname === '/') {
      sessionStorage.removeItem('homeScrollPosition');
      hasRestoredScroll.current = false;
    }
  }, [navType, location.pathname]);

  const searchResultProducts = useMemo(() => {
    return products
      .filter(p => p.is_visible !== false)
      .filter(p => {
        if (!searchQuery) return true;
        return p.title.toLowerCase().includes(searchQuery.toLowerCase());
      });
  }, [products, searchQuery]);

  const visibleProducts = useMemo(() => {
    let filtered = [...searchResultProducts];

    if (sortBy === 'latest') {
      filtered.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });
    } else if (sortBy === 'random') {
      const seed = randomSeed; // trigger re-evaluation
      filtered = [...filtered].sort(() => Math.random() - 0.5);
    }

    return filtered.map(p => ({
      ...p,
      animationDelay: Math.random() * 0.5,
      isNew: p.created_at ? (new Date().getTime() - new Date(p.created_at).getTime()) < (14 * 24 * 60 * 60 * 1000) : false
    }));
  }, [searchResultProducts, sortBy, randomSeed]);

  const skeletonTone = theme === 'dark' ? 'bg-zinc-900' : 'bg-zinc-100';

  return (
    <div className="isolate">
      <HeroSpatial />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-[5] overflow-x-clip bg-canvas text-text-primary"
        style={{
          marginTop: '-8vh',
          marginBottom: 'calc((1 - var(--hero-curtain-rise, 1)) * 72vh - 2px)',
          transform: 'translate3d(0, calc((1 - var(--hero-curtain-rise, 1)) * 72vh), 0)',
          willChange: 'transform',
        }}
      >
      {/* Collection chapter — black/white surface rises over Hero during EXIT */}
      <div
        id="marquee-section"
        className="scroll-mt-28 pt-12 md:pt-16 pb-16 md:pb-24"
        style={{
          transform:
            'translate3d(0, calc((1 - var(--hero-marquee-enter, 1)) * 60px), 0) scale(calc(0.985 + var(--hero-marquee-enter, 1) * 0.015))',
          opacity: 'calc(0.2 + var(--hero-marquee-enter, 1) * 0.8)',
        }}
      >
        <ProductGrid products={searchQuery ? searchResultProducts : undefined} />
      </div>

      <div className="container-shell">
        <div
          className="mb-10 grid grid-cols-1 items-end gap-6 border-b border-border-subtle pb-6 md:grid-cols-3"
          style={{
            transform: 'translate3d(0, calc((1 - var(--hero-artworks-enter, 1)) * 32px), 0)',
            opacity: 'var(--hero-artworks-enter, 1)',
          }}
        >
          <div className="hidden md:block" aria-hidden="true" />
          <div className="flex flex-col items-center text-center">
            <h2
              className="type-product-title text-text-primary"
              style={{ fontSize: 26 }}
            >
              고르거나, 만들거나.
            </h2>
            <p
              className="text-sm text-text-secondary"
              style={{
                fontSize: 14,
                opacity: 'var(--hero-artworks-subtitle-enter, 1)',
              }}
            >
              고르기 · 만들기
            </p>
          </div>
          <div className="flex flex-col items-center gap-3 md:items-end">
            {isSearchMode ? (
              <Button type="button" variant="ghost" size="md" onClick={clearSearch}>
                전체 작품 보기
              </Button>
            ) : null}
            <div role="group" aria-label="작품 정렬" className="flex flex-wrap items-center justify-center md:justify-end">
              <button
                type="button"
                onClick={() => handleSortChange('latest')}
                disabled={isLoading || isError}
                aria-pressed={sortBy === 'latest'}
                className={`focus-ring type-label inline-flex min-h-11 items-center gap-2 border-b px-3 ${
                  sortBy === 'latest'
                    ? 'border-text-primary text-text-primary'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                }`}
              >
                <Clock size={14} strokeWidth={2.5} aria-hidden />
                최신순
              </button>
              <button
                type="button"
                onClick={() => handleSortChange('random')}
                disabled={isLoading || isError}
                aria-pressed={sortBy === 'random'}
                className={`focus-ring type-label inline-flex min-h-11 items-center gap-2 border-b px-3 ${
                  sortBy === 'random'
                    ? 'border-text-primary text-text-primary'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                }`}
              >
                <Shuffle size={14} strokeWidth={2.5} aria-hidden />
                랜덤순
              </button>
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
          {isLoading ? (
            Array.from({ length: 10 }).map((_, index) => (
              <div key={`artwork-skeleton-${index}`} aria-hidden="true">
                <div className={`aspect-[210/297] animate-pulse ${skeletonTone}`} />
              </div>
            ))
          ) : isError ? (
            <div className="col-span-full flex flex-col items-center justify-center py-32 gap-4">
              <div className="text-red-400">작품을 불러올 수 없습니다.</div>
              <button
                onClick={fetchProducts}
                className={`px-4 py-2 rounded-lg ${theme === 'dark' ? 'bg-white text-black' : 'bg-black text-white'}`}
              >
                다시 시도
              </button>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {visibleProducts.length > 0 ? (
                visibleProducts.map((product) => (
                  <motion.div
                    key={product.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ opacity: { duration: 0.3 } }}
                  >
                    <ProductCard
                      product={product}
                      sizes={ARTWORK_IMAGE_SIZES}
                      presentation="gallery"
                    />
                  </motion.div>
                ))
              ) : (
                <motion.div 
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="col-span-full flex flex-col items-center justify-center py-32 text-text-secondary"
                >
                  <p className="text-lg font-light tracking-wider">검색 결과가 없습니다.</p>
                  <p className="text-sm mt-2">다른 검색어를 입력해 보세요.</p>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </div>
    </motion.div>
    </div>
  );
}
