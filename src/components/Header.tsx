import React, { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { Link, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { Search, User, Frame, Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useTheme } from '../context/ThemeContext';
import { useShellOverlay } from '../context/ShellOverlayContext';
import { IconButton } from './ui/IconButton';
import { cn } from '../lib/cn';
import { zClass } from '../constants/overlays';
import AnnouncementBar from './AnnouncementBar';

const LoginModal = lazy(() => import('./LoginModal'));

const LOGO_URL = '/logo/metalora-wordmark.webp';

export default function Header({ isHome = false }: { isHome?: boolean }) {
  const [hasOpenedLoginModal, setHasOpenedLoginModal] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const {
    user,
    adminUser,
    profile,
    adminProfile,
    isProfileOpen,
    openProfile,
    closeProfile,
    isWorkshopOpen,
    closeWorkshop,
  } = useAuth();
  const { cartItems, isCartOpen, openCart, closeCart } = useCart();
  const { theme, toggleTheme } = useTheme();
  const { registerLoginOverlay } = useShellOverlay();

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const searchQuery = searchParams.get('q') || '';

  const [localSearch, setLocalSearch] = useState(searchQuery);
  const isComposing = useRef(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const currentUser = user || adminUser;
  const isAdmin = profile?.is_admin || adminProfile?.is_admin;

  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    };

    if (isSearchOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSearchOpen]);

  const updateSearch = (value: string) => {
    if (value) {
      setSearchParams({ q: value });
    } else {
      setSearchParams({});
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalSearch(value);
    if (!isComposing.current) {
      updateSearch(value);
    }
  };

  const handleComposition = (e: React.CompositionEvent<HTMLInputElement>) => {
    if (e.type === 'compositionstart') {
      isComposing.current = true;
    } else if (e.type === 'compositionend') {
      isComposing.current = false;
      updateSearch(e.currentTarget.value);
    }
  };

  const isHeroTop = isHome && !isScrolled && !isSearchOpen;
  const isDark = theme === 'dark';

  const openLoginModal = () => {
    setHasOpenedLoginModal(true);
    registerLoginOverlay('login', true);
    setIsLoginModalOpen(true);
  };

  const closeLoginModal = () => {
    setIsLoginModalOpen(false);
  };

  const iconTone = isHeroTop
    ? isDark
      ? 'text-text-inverse/80 hover:text-text-inverse'
      : 'text-text-primary/80 hover:text-text-primary'
    : 'text-text-secondary hover:text-text-primary';

  return (
    <>
      <header
        ref={searchRef}
        className={cn(
          'fixed top-0 left-0 isolate w-full max-w-[100vw] border-b motion-safe-transition transform-gpu',
          zClass('header'),
          isHeroTop
            ? 'border-transparent bg-transparent'
            : 'surface-glass border-border-subtle shadow-raised',
        )}
        style={{ transitionDuration: 'var(--duration-normal)' }}
      >
        <motion.div className="flex w-full flex-col">
          <AnnouncementBar />

          <div
            className="relative mx-auto flex w-full max-w-7xl items-center justify-between px-4 sm:px-6"
            style={{ height: 'var(--shell-nav-height)' }}
          >
            {/* Left controls */}
            <div className="flex min-w-0 flex-1 items-center justify-start gap-1 sm:gap-2">
              {location.pathname === '/' && (
                <IconButton
                  variant="ghost"
                  aria-label={isSearchOpen ? '검색 닫기' : '검색 열기'}
                  aria-expanded={isSearchOpen}
                  onClick={() => setIsSearchOpen(!isSearchOpen)}
                  className={cn('shrink-0', iconTone, isHeroTop && 'hover:bg-black/5 dark:hover:bg-white/10')}
                >
                  <Search size={20} strokeWidth={1.5} />
                </IconButton>
              )}

              <IconButton
                variant="ghost"
                aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
                onClick={toggleTheme}
                className={cn('shrink-0', iconTone, isHeroTop && 'hover:bg-black/5 dark:hover:bg-white/10')}
              >
                {isDark ? <Sun size={20} strokeWidth={1.5} /> : <Moon size={20} strokeWidth={1.5} />}
              </IconButton>
            </div>

            {/* Center logo */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 max-w-[7.25rem] -translate-x-1/2 -translate-y-1/2 min-[360px]:max-w-[42vw] sm:max-w-none">
              <Link
                to="/"
                className="pointer-events-auto flex items-center justify-center"
                onClick={(e) => {
                  if (isCartOpen) closeCart();
                  if (isProfileOpen) closeProfile();
                  if (isWorkshopOpen) closeWorkshop();

                  if (location.pathname === '/') {
                    e.preventDefault();
                    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                  }
                }}
              >
                <img
                  src={LOGO_URL}
                  alt="메탈 액자의 기준, 메탈로라 | METALORA"
                  width={384}
                  height={124}
                  className={cn(
                    'h-7 w-auto object-contain motion-safe-transition sm:h-9 md:h-10',
                    isDark && 'invert',
                  )}
                  style={{ transitionDuration: 'var(--duration-normal)' }}
                  referrerPolicy="no-referrer"
                />
              </Link>
            </div>

            {/* Right controls */}
            <div className="flex min-w-0 flex-1 items-center justify-end gap-1 sm:gap-2">
              {currentUser ? (
                <IconButton
                  variant="ghost"
                  aria-label={isAdmin ? '관리자 대시보드' : '내 정보'}
                  onClick={() => {
                    if (isProfileOpen) {
                      closeProfile();
                    } else {
                      if (isCartOpen) closeCart();
                      if (isWorkshopOpen) closeWorkshop();
                      openProfile();
                    }
                  }}
                  className={cn('shrink-0', iconTone, isHeroTop && 'hover:bg-black/5 dark:hover:bg-white/10')}
                >
                  <User size={20} strokeWidth={1.5} />
                </IconButton>
              ) : (
                <IconButton
                  variant="ghost"
                  aria-label="로그인"
                  onClick={() => {
                    if (isWorkshopOpen) closeWorkshop();
                    openLoginModal();
                  }}
                  className={cn('shrink-0', iconTone, isHeroTop && 'hover:bg-black/5 dark:hover:bg-white/10')}
                >
                  <User size={20} strokeWidth={1.5} />
                </IconButton>
              )}

              <IconButton
                variant="ghost"
                aria-label="내 컬렉션"
                onClick={(e) => {
                  if (!currentUser) {
                    e.preventDefault();
                    if (isWorkshopOpen) closeWorkshop();
                    openLoginModal();
                    return;
                  }
                  if (isCartOpen) {
                    closeCart();
                  } else {
                    if (isProfileOpen) closeProfile();
                    if (isWorkshopOpen) closeWorkshop();
                    openCart();
                  }
                }}
                className={cn('relative shrink-0', iconTone, isHeroTop && 'hover:bg-black/5 dark:hover:bg-white/10')}
              >
                <Frame size={20} strokeWidth={1.5} />
                {currentUser && cartItems.length > 0 && (
                  <span
                    className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-text-primary text-[10px] font-semibold text-text-inverse"
                    aria-hidden
                  >
                    {cartItems.length}
                  </span>
                )}
              </IconButton>
            </div>
          </div>

          {/* Search panel */}
          <AnimatePresence>
            {isSearchOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0, transition: { duration: 0.2 } }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="w-full overflow-hidden transform-gpu will-change-transform"
              >
                <div className="mx-auto max-w-3xl px-4 pb-4 pt-1 sm:px-6 sm:pb-5">
                  <input
                    type="search"
                    placeholder="제품명 검색..."
                    value={localSearch}
                    onChange={handleSearchChange}
                    onCompositionStart={handleComposition}
                    onCompositionEnd={handleComposition}
                    className="focus-ring type-body w-full rounded-md border border-border-subtle bg-surface px-4 py-3 text-text-primary placeholder:text-text-tertiary"
                    autoFocus
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </header>

      {hasOpenedLoginModal && (
        <Suspense fallback={null}>
          <LoginModal
            isOpen={isLoginModalOpen}
            onClose={closeLoginModal}
            onSuccess={closeLoginModal}
          />
        </Suspense>
      )}
    </>
  );
}
