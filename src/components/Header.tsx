import React, { useState, useRef, useEffect } from 'react';
import { Link, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { Search, User, Frame } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import LoginModal from './LoginModal';
import Cart from './Cart';

export default function Header({ isHome = false }: { isHome?: boolean }) {
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { user } = useAuth();
  const { cartItems } = useCart();
  
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const searchQuery = searchParams.get('q') || '';
  
  // Local state for IME handling
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const isComposing = useRef(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  // Click outside to close
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
    if (location.pathname !== '/') {
      navigate(`/?q=${encodeURIComponent(value)}`);
    } else {
      if (value) {
        setSearchParams({ q: value });
      } else {
        setSearchParams({});
      }
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

  return (
    <>
      <header
        className="fixed top-0 left-0 w-full z-[10000] bg-black/80 backdrop-blur-md transition-all duration-300 border-b border-white/5"
        ref={searchRef}
      >
        <motion.div layout className="flex flex-col w-full">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between relative w-full">
            {/* Left: Search Icon (Conditional Visibility) */}
            <div className="flex-1 flex justify-start">
              {location.pathname === '/collection' && (
                <button 
                  onClick={() => setIsSearchOpen(!isSearchOpen)}
                  className="text-white opacity-60 hover:opacity-100 transition-all duration-300"
                  title="Search"
                >
                  <Search size={24} strokeWidth={1} />
                </button>
              )}
            </div>

            {/* Center: Logo (Absolute Center) */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <Link 
                to="/" 
                className="flex items-center"
                onClick={(e) => {
                  if (location.pathname === '/') {
                    e.preventDefault();
                    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                  }
                }}
              >
                <img 
                  src="https://postfiles.pstatic.net/MjAyNjAzMTZfMjM2/MDAxNzczNjQzMzQ3MDUw.zR_7l4ozVWSXDJOr1CA_6tw0H8LF8ZQenQvN8Tw3swEg.i_g5v5uqKHopzrE-iqVmSsuKM-nhT3X3N0tWVC_DDBgg.PNG/METALORA_LOGO.png?type=w3840" 
                  alt="METALORA" 
                  className="h-10 md:h-12 object-contain filter invert" 
                  referrerPolicy="no-referrer"
                />
              </Link>
            </div>

            {/* Right: User & Collection Icons */}
            <div className="flex-1 flex justify-end items-center gap-x-5">
              {user ? (
                <Link 
                  to="/mypage"
                  className="text-white opacity-60 hover:opacity-100 transition-all duration-300"
                  title="My Info"
                >
                  <User size={24} strokeWidth={1} />
                </Link>
              ) : (
                <button 
                  onClick={() => {
                    setIsCartOpen(false);
                    setIsLoginModalOpen(true);
                  }} 
                  className="text-white opacity-60 hover:opacity-100 transition-all duration-300"
                  title="Login"
                >
                  <User size={24} strokeWidth={1} />
                </button>
              )}

              <button 
                onClick={() => {
                  if (!user) {
                    setIsCartOpen(false);
                    setIsLoginModalOpen(true);
                  } else {
                    setIsCartOpen(!isCartOpen);
                  }
                }}
                className="text-white opacity-60 hover:opacity-100 transition-all duration-300 relative"
                title="My Collection"
              >
                <Frame size={24} strokeWidth={1} />
                {user && cartItems.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-white text-black text-[9px] font-bold rounded-full flex items-center justify-center">
                    {cartItems.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Search Section */}
          <AnimatePresence>
            {isSearchOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0, transition: { duration: 0.3 } }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden w-full"
              >
                <div className="max-w-3xl mx-auto px-6 pb-6 pt-2">
                  <div className="relative group">
                    <div className="absolute inset-0 bg-white/5 backdrop-blur-2xl rounded-xl border border-white/10 transition-all duration-300 group-focus-within:border-white/30 group-focus-within:shadow-[0_0_20px_rgba(255,255,255,0.1)]" />
                    <input
                      type="text"
                      placeholder="제품명 검색..."
                      value={localSearch}
                      onChange={handleSearchChange}
                      onCompositionStart={handleComposition}
                      onCompositionEnd={handleComposition}
                      className="relative w-full bg-transparent text-white placeholder-white/40 px-6 py-4 outline-none font-light tracking-wide"
                      autoFocus
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </header>

      <LoginModal 
        isOpen={isLoginModalOpen} 
        onClose={() => setIsLoginModalOpen(false)} 
      />

      <Cart 
        isOpen={isCartOpen} 
        onClose={() => setIsCartOpen(false)} 
      />
    </>
  );
}
