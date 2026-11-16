import { memo, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Search, Shuffle, X } from 'lucide-react';
import type { Product } from '../data/products';
import { getFullImageUrl } from '../lib/utils';
import { readCatalogControls } from './catalogControls';
import { sampleRgb } from './ConceptGallery';
import './conceptGallery.css';
import { artworkAspectRatio } from './collection18/artworkFrame';
import {
  CATALOG_PAGE_SIZE,
  type CatalogGridProduct,
  type CatalogPageSource,
  type CatalogSort,
} from './collection18/catalogPage';

const SEARCH_DEBOUNCE_MS = 280;
const ROOT_MARGIN = '240px 0px';

const WorkCard = memo(function WorkCard({
  product,
  href,
  eager,
}: {
  product: CatalogGridProduct;
  href: string;
  eager: boolean;
}) {
  const raw = product.front_image || '';
  const src = raw.startsWith('/') || raw.startsWith('blob:') || raw.startsWith('data:')
    ? raw
    : (getFullImageUrl(raw) || '');
  return (
    <li>
      <Link className="concept-work focus-ring" to={href} aria-label={product.title}>
        <span className="concept-glow" aria-hidden="true" />
        {src ? (
          <img
            src={src}
            alt=""
            width={210}
            height={297}
            decoding="async"
            loading={eager ? 'eager' : 'lazy'}
            onLoad={(event) => {
              const card = event.currentTarget.closest('.concept-work');
              if (card instanceof HTMLElement) {
                card.style.setProperty('--rgb', sampleRgb(event.currentTarget));
              }
            }}
          />
        ) : null}
      </Link>
    </li>
  );
});

function asLinkProduct(product: CatalogGridProduct): Product {
  return {
    id: product.id,
    title: product.title,
    artist: product.subtitle || 'METALORA',
    image: product.front_image || '',
    front_image: product.front_image || '',
    subtitle: product.subtitle || undefined,
    description: '',
    limited: product.is_limited === true,
    created_at: product.created_at,
    is_visible: true,
  };
}

export default function AllWorks({
  source,
  search,
  sort,
  seed,
  hrefFor,
  between,
}: {
  source: CatalogPageSource;
  search: string;
  sort: CatalogSort;
  seed: number | string;
  hrefFor: (product: Product) => string;
  between?: ReactNode;
}) {
  const [committedSearch, setCommittedSearch] = useState(search);
  const [items, setItems] = useState<CatalogGridProduct[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const sentinelRef = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  const held = useRef(false);
  const requestId = useRef(0);
  const cursorRef = useRef<string | null>(null);
  const queryRef = useRef({ search: committedSearch, sort, seed });
  const itemsRef = useRef(items);
  const armedRandom = useRef(0);
  const fadeTimers = useRef<number[]>([]);
  const [settling, setSettling] = useState(false);
  itemsRef.current = items;

  const clearFade = useCallback(() => {
    fadeTimers.current.forEach((timer) => window.clearTimeout(timer));
    fadeTimers.current = [];
  }, []);

  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const commitReplace = useCallback((next: CatalogGridProduct[], fade: boolean) => {
    const previous = itemsRef.current.map((product) => product.id).join();
    const changed = next.map((product) => product.id).join() !== previous;
    if (!fade || !changed || reducedMotion()) {
      setSettling(false);
      setItems(next);
      return;
    }
    clearFade();
    setSettling(true);
    fadeTimers.current.push(window.setTimeout(() => {
      setItems(next);
      setSettling(false);
    }, 120));
    fadeTimers.current.push(window.setTimeout(() => setSettling(false), 360));
  }, [clearFade]);

  useEffect(() => {
    const timer = window.setTimeout(() => setCommittedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  const runPage = useCallback(async (mode: 'replace' | 'append', hold = false) => {
    const id = requestId.current + 1;
    requestId.current = id;
    lock.current = true;
    if (!hold) setPhase('loading');
    const active = queryRef.current;
    const fade = hold && armedRandom.current !== 0;
    try {
      const page = await source.fetchPage({
        search: active.search,
        sort: active.sort,
        seed: active.seed,
        cursor: mode === 'replace' ? null : cursorRef.current,
      });
      if (id !== requestId.current) return;
      if (!page.ok) {
        if (fade) armedRandom.current = 0;
        setSettling(false);
        setPhase('error');
        return;
      }
      if (mode === 'replace') {
        if (fade) armedRandom.current = 0;
        commitReplace(page.products, fade);
      } else {
        setItems((current) => [...current, ...page.products]);
      }
      cursorRef.current = page.next_cursor;
      setHasMore(page.has_more);
      setPhase('ready');
    } catch {
      if (id !== requestId.current) return;
      if (fade) armedRandom.current = 0;
      setSettling(false);
      setPhase('error');
    } finally {
      if (id === requestId.current) lock.current = false;
    }
  }, [commitReplace, source]);

  useEffect(() => {
    queryRef.current = { search: committedSearch, sort, seed };
    cursorRef.current = null;
    held.current = false;
    const hold = armedRandom.current !== 0;
    if (hold) setHasMore(false);
    else {
      setItems([]);
      setHasMore(true);
    }
    void runPage('replace', hold);
    return () => {
      requestId.current += 1;
      clearFade();
      setSettling(false);
    };
  }, [clearFade, committedSearch, sort, seed, runPage]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || phase !== 'ready') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((entry) => entry.isIntersecting);
        if (!hit) {
          held.current = false;
          return;
        }
        if (held.current || lock.current) return;
        held.current = true;
        void runPage('append');
      },
      { rootMargin: ROOT_MARGIN },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, phase, runPage]);

  const empty = phase === 'ready' && items.length === 0;
  const showMore = hasMore && phase !== 'error' && !(phase === 'loading' && items.length === 0);
  const controls = readCatalogControls();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchKeyFocus, setSearchKeyFocus] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchToggleRef = useRef<HTMLButtonElement>(null);
  const searchFocusRef = useRef(false);
  const searchKeyFocusRef = useRef(false);

  useEffect(() => {
    if (controls?.search) setSearchOpen(true);
  }, [controls?.search]);

  useEffect(() => {
    if (!searchOpen || !searchFocusRef.current) return;
    searchFocusRef.current = false;
    searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Tab') searchKeyFocusRef.current = true;
      if ((event.key === 'Enter' || event.key === ' ') && event.target === searchToggleRef.current) {
        searchKeyFocusRef.current = true;
      }
    };
    const onPointer = () => {
      searchKeyFocusRef.current = false;
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, []);

  return (
    <section
      id="all-works"
      className="all-works"
      aria-labelledby="all-works-heading"
      aria-busy={phase === 'loading'}
      style={{ '--artwork-ratio': artworkAspectRatio() } as CSSProperties}
    >
      <div className="all-works-bar">
        <h2 id="all-works-heading">고르세요.</h2>
        {controls ? (
          <div className="all-works-controls">
            <div className="concept-sort" role="group" aria-label="작품 정렬">
              <button type="button" className="focus-ring" aria-pressed={controls.sort === 'latest'} disabled={controls.disabled} onClick={() => { armedRandom.current = controls.sort === 'latest' ? 0 : armedRandom.current + 1; controls.onSort('latest'); }}>
                <Clock size={14} strokeWidth={2} aria-hidden="true" />
                최신순
              </button>
              <button type="button" className="focus-ring" aria-pressed={controls.sort === 'random'} disabled={controls.disabled} onClick={() => { armedRandom.current += 1; controls.onSort('random'); }}>
                <Shuffle size={14} strokeWidth={2} aria-hidden="true" />
                랜덤순
              </button>
            </div>
            <form
              className={`all-works-search${searchOpen ? ' is-open' : ''}${searchKeyFocus ? ' is-key-focus' : ''}`}
              role="search"
              onSubmit={(event) => event.preventDefault()}
            >
              <button
                ref={searchToggleRef}
                type="button"
                className="all-works-search-toggle focus-ring"
                aria-label="작품검색"
                aria-expanded={searchOpen}
                aria-controls="catalog-artwork-search"
                disabled={controls.disabled}
                onClick={() => {
                  if (searchOpen && !controls.search) {
                    setSearchOpen(false);
                    return;
                  }
                  searchFocusRef.current = true;
                  setSearchOpen(true);
                }}
              >
                <Search size={15} strokeWidth={1.75} aria-hidden="true" />
              </button>
              <label className="all-works-search-label" htmlFor="catalog-artwork-search">작품검색</label>
              <input
                ref={searchInputRef}
                id="catalog-artwork-search"
                type="search"
                placeholder="작품검색"
                value={controls.search}
                disabled={controls.disabled}
                tabIndex={searchOpen ? 0 : -1}
                aria-hidden={searchOpen ? undefined : true}
                onChange={(event) => { armedRandom.current = 0; controls.onSearch(event.target.value, true); }}
                onFocus={() => setSearchKeyFocus(searchKeyFocusRef.current)}
                onBlur={() => setSearchKeyFocus(false)}
                onKeyDown={(event) => {
                  if (event.key !== 'Escape' || controls.search) return;
                  event.preventDefault();
                  setSearchOpen(false);
                  searchToggleRef.current?.focus();
                }}
              />
              {controls.search ? (
                <button type="button" className="concept-clear focus-ring" aria-label="검색 지우기" onClick={() => { armedRandom.current = 0; controls.onClear(); }}>
                  <X size={14} strokeWidth={1.5} aria-hidden="true" />
                </button>
              ) : null}
            </form>
          </div>
        ) : null}
      </div>
      {between}
      {empty ? <p className="all-works-empty">검색 결과가 없습니다.</p> : null}
      <ul className={settling ? 'concept-more is-settling' : 'concept-more'}>
        {phase === 'loading' && items.length === 0
          ? Array.from({ length: CATALOG_PAGE_SIZE }, (_, index) => (
            <li key={`slot-${index}`} className="all-works-slot" aria-hidden="true" />
          ))
          : null}
        {items.map((product, index) => (
          <WorkCard
            key={product.id}
            product={product}
            href={hrefFor(asLinkProduct(product))}
            eager={index < 4}
          />
        ))}
      </ul>
      {phase === 'loading' && items.length > 0 ? (
        <p className="all-works-status" role="status">다음 작품을 불러오는 중입니다.</p>
      ) : null}
      {phase === 'error' ? (
        <div className="all-works-status" role="alert">
          <p>작품을 더 불러오지 못했습니다.</p>
          <button type="button" className="concept-load focus-ring" onClick={() => void runPage(items.length === 0 ? 'replace' : 'append')}>
            다시 시도
          </button>
        </div>
      ) : null}
      {showMore ? (
        <>
          <div ref={sentinelRef} className="concept-sentinel" aria-hidden="true" />
          <button
            type="button"
            className="concept-load focus-ring"
            onClick={() => {
              if (lock.current || phase === 'loading') return;
              held.current = true;
              void runPage('append');
            }}
          >
            작품 더 보기
          </button>
        </>
      ) : null}
    </section>
  );
}
