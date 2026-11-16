import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useProducts } from '../context/ProductContext';
import { useSearchParams, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import ProductGrid from '../components/ProductGrid';
import HomeHero from '../preview/HomeHero';
import AllWorks from '../preview/AllWorks';
import { catalogSourceFromStoreProducts } from '../preview/collection18/catalogPage';
import { bindCatalogControls } from '../preview/catalogControls';
import { HOME_UNIFIED_SCENES } from '../preview/heroScenes';
import { selectPublicHeroVideoSrc } from '../preview/homepageVideoSource';
import type { VideoHeroMediaConfig } from '../preview/videoHeroConfig';
import { useTheme } from '../context/ThemeContext';

// Document-lifetime: first Home mount vs later SPA remounts (e.g. Product → Back).
let hasMountedHomeInThisDocument = false;

export default function Home() {
  const { products, isLoading, isError, fetchProducts } = useProducts();
  const { theme } = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get('q') || '';
  const location = useLocation();
  const navigate = useNavigate();
  const navType = useNavigationType();
  const { openCart } = useCart();

  const [sortBy, setSortBy] = useState<'latest' | 'random'>('latest');
  const [randomSeed, setRandomSeed] = useState(1);
  const [collectionDraft, setCollectionDraft] = useState(searchQuery);
  const hasRestoredScroll = useRef(false);

  const handleSortChange = (type: 'latest' | 'random') => {
    setSortBy(type);
    if (type === 'random') setRandomSeed((value) => value + 1);
  };

  const closeCollectionSearch = () => {
    setCollectionDraft('');
    setSearchParams({});
  };

  useEffect(() => {
    setCollectionDraft(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    if (location.state?.openCart) {
      openCart();
      navigate('/', { replace: true, state: { ...location.state, openCart: undefined } });
    }

    if (location.state?.scrollTo === 'marquee-section' || location.hash === '#marquee-section') {
      setTimeout(() => {
        const element = document.getElementById('marquee-section');
        if (element) {
          const headerOffset = 100;
          const elementPosition = element.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.scrollY - headerOffset;
          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth',
          });
        }
      }, 100);

      if (location.hash === '#marquee-section') {
        window.history.replaceState(null, '', '/');
      } else if (location.state?.scrollTo === 'marquee-section') {
        navigate('/', { replace: true, state: { ...location.state, scrollTo: undefined } });
      }
    }
  }, [location.state, location.hash, openCart, navigate]);

  useEffect(() => {
    if (!hasMountedHomeInThisDocument) {
      hasMountedHomeInThisDocument = true;
      const navigationEntry = performance.getEntriesByType(
        'navigation',
      )[0] as PerformanceNavigationTiming | undefined;
      const loadType = navigationEntry?.type;
      if (loadType !== 'back_forward') {
        sessionStorage.removeItem('homeScrollPosition');
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        hasRestoredScroll.current = true;
        return;
      }
    }

    if (navType === 'POP' && !isLoading && products.length > 0 && !hasRestoredScroll.current) {
      const savedScroll = sessionStorage.getItem('homeScrollPosition');
      if (savedScroll) {
        const scrollPos = parseInt(savedScroll, 10);
        if (!isNaN(scrollPos) && scrollPos > 0) {
          let frameCount = 0;
          const restore = () => {
            window.scrollTo({ top: scrollPos, behavior: 'instant' });
            frameCount++;
            if (frameCount < 20) requestAnimationFrame(restore);
          };
          requestAnimationFrame(restore);
        }
      }
      hasRestoredScroll.current = true;
    }
  }, [navType, isLoading, products.length]);

  useEffect(() => {
    if (navType === 'PUSH' && location.pathname === '/') {
      sessionStorage.removeItem('homeScrollPosition');
      hasRestoredScroll.current = false;
    }
  }, [navType, location.pathname]);

  const [heroVideo, setHeroVideo] = useState<Partial<VideoHeroMediaConfig> | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const mobile = window.matchMedia('(max-width: 860px)').matches;
    const probe = (slot: 'desktop' | 'mobile') => fetch(`/api/homepage-video/${slot}`, { method: 'HEAD' })
      .then((response) => response.ok)
      .catch(() => false);
    Promise.all([
      probe('desktop'),
      mobile ? probe('mobile') : Promise.resolve(false),
    ]).then(([desktopAvailable, mobileAvailable]) => {
      if (cancelled) return;
      const src = selectPublicHeroVideoSrc({ mobile, desktopAvailable, mobileAvailable });
      if (src.startsWith('/api/')) setHeroVideo({ src });
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const catalogSource = useMemo(
    () => catalogSourceFromStoreProducts(products),
    [products],
  );

  bindCatalogControls({
    sort: sortBy,
    onSort: handleSortChange,
    search: collectionDraft,
    onSearch: (value) => setCollectionDraft(value),
    onClear: closeCollectionSearch,
    disabled: false,
  });

  return (
    <div className="home-surface">
      <HomeHero scenes={HOME_UNIFIED_SCENES} videoMedia={heroVideo} />

      {isError ? (
        <div className="container-shell flex flex-col items-center gap-4 py-16 text-text-secondary">
          <p>작품을 불러올 수 없습니다.</p>
          <button
            type="button"
            onClick={fetchProducts}
            className={`px-4 py-2 rounded-lg ${theme === 'dark' ? 'bg-white text-black' : 'bg-black text-white'}`}
          >
            다시 시도
          </button>
        </div>
      ) : null}

      <div className="concept-collection">
        <AllWorks
          source={catalogSource}
          search={collectionDraft}
          sort={sortBy}
          seed={randomSeed || 1}
          hrefFor={(product) => `/product/${product.id}`}
          between={(
            <div
              id="marquee-section"
              className="scroll-mt-28 overflow-clip bg-transparent pt-4 pb-4 text-inherit md:pt-8 md:pb-8"
            >
              <ProductGrid />
            </div>
          )}
        />
      </div>
    </div>
  );
}
