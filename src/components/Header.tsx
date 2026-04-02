import React, { useState, useRef, useEffect } from 'react';
import { Link, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { Search, User, Frame } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import LoginModal from './LoginModal';

const LOGO_URL = "https://postfiles.pstatic.net/MjAyNjAzMzFfMTE2/MDAxNzc0OTQzMjQwMzI1.x_oF4Rn3jx1adpueuXOwP2XnNoym4vphKH-tVom_jE0g.2GiYCl0zR7EoUoU3WVtvErE0UK5Jef4b7otun81kHZAg.PNG/BLACK_V_(1).png?type=w3840";

export default function Header({ isHome = false }: { isHome?: boolean }) {
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { user, adminUser, profile, adminProfile } = useAuth();
  const { cartItems } = useCart();
  
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const searchQuery = searchParams.get('q') || '';
  
  // Local state for IME handling
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const isComposing = useRef(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const currentUser = user || adminUser;
  const isAdmin = profile?.is_admin || adminProfile?.is_admin;

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
                  src={LOGO_URL} 
                  alt="METALORA" 
                  className="h-9 md:h-11 object-contain filter invert" 
                  referrerPolicy="no-referrer"
                />
              </Link>
            </div>

            {/* Right: User & Collection Icons */}
            <div className="flex-1 flex justify-end items-center gap-x-5">
              {currentUser ? (
                <Link 
                  to={isAdmin ? "/admin" : "/mypage"}
                  className="text-white opacity-60 hover:opacity-100 transition-all duration-300"
                  title={isAdmin ? "Admin Dashboard" : "My Info"}
                >
                  <User size={24} strokeWidth={1} />
                </Link>
              ) : (
                <button 
                  onClick={() => {
                    setIsLoginModalOpen(true);
                  }} 
                  className="text-white opacity-60 hover:opacity-100 transition-all duration-300"
                  title="Login"
                >
                  <User size={24} strokeWidth={1} />
                </button>
              )}

              <Link 
                to="/my-collection"
                className="text-white opacity-60 hover:opacity-100 transition-all duration-300 relative"
                title="My Collection"
                onClick={(e) => {
                  if (!currentUser) {
                    e.preventDefault();
                    setIsLoginModalOpen(true);
                  }
                }}
              >
                <Frame size={24} strokeWidth={1} />
                {currentUser && cartItems.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-white text-black text-[9px] font-bold rounded-full flex items-center justify-center">
                    {cartItems.length}
                  </span>
                )}
              </Link>
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
        onSuccess={() => setIsLoginModalOpen(false)}
      />
    </>
  );
}
