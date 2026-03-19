import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Frame, User, Menu, X, LogOut, Loader2, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import LoginModal from './LoginModal';
import Cart from './Cart';
import InquiryModal from './InquiryModal';

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isInquiryModalOpen, setIsInquiryModalOpen] = useState(false);
  const { user, signOut, isLoggingOut } = useAuth();
  const { cartItems } = useCart();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 bg-[#000000]/70 backdrop-blur-lg border-b border-white/10 transition-all duration-300"
    >
      <div className="max-w-7xl mx-auto px-6 h-20 md:h-24 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="z-50 flex items-center">
          <img 
            src="https://postfiles.pstatic.net/MjAyNjAzMTZfMjM2/MDAxNzczNjQzMzQ3MDUw.zR_7l4ozVWSXDJOr1CA_6tw0H8LF8ZQenQvN8Tw3swEg.i_g5v5uqKHopzrE-iqVmSsuKM-nhT3X3N0tWVC_DDBgg.PNG/METALORA_LOGO.png?type=w3840" 
            alt="METALORA" 
            className="h-10 md:h-14 object-contain dark:invert filter invert" 
            referrerPolicy="no-referrer"
          />
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-8">
          <Link to="/" className="text-sm font-medium text-white/70 hover:text-white transition-colors">
            컬렉션
          </Link>
          <Link to="/" className="text-sm font-medium text-white/70 hover:text-white transition-colors">
            아티스트
          </Link>
          <Link to="/brand-story" className="text-sm font-medium text-white/70 hover:text-white transition-colors">
            브랜드 스토리
          </Link>
          <Link to="/anisotropic" className="text-sm font-medium text-white/70 hover:text-white transition-colors">
            이방성 셰이더
          </Link>
        </nav>

        {/* Icons */}
        <div className="hidden md:flex items-center gap-6">
          {user ? (
            <>
              <div className="flex items-center gap-4">
                <Link to="/profile" className="text-sm text-zinc-400 hover:text-white transition-colors" title="내 정보">
                  {user.user_metadata?.full_name || user.user_metadata?.name || user.user_metadata?.preferred_username || '사용자'}님
                </Link>
                <button 
                  onClick={() => {
                    localStorage.clear();
                    sessionStorage.clear();
                    document.cookie.split(";").forEach((c) => {
                      document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
                    });
                    signOut();
                    window.location.href = '/';
                  }} 
                  disabled={isLoggingOut}
                  className="text-white/70 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed" 
                  title="로그아웃"
                >
                  {isLoggingOut ? <Loader2 className="animate-spin" size={20} /> : <LogOut size={20} />}
                </button>
              </div>
              <button 
                onClick={() => setIsInquiryModalOpen(true)}
                className="text-white/70 hover:text-white transition-colors"
                title="1:1 문의하기"
              >
                <MessageSquare size={20} />
              </button>
              <button 
                onClick={() => setIsCartOpen(true)}
                className="text-white/70 hover:text-white transition-colors relative"
                title="내 컬렉션"
              >
                <Frame size={20} />
                {cartItems.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-[10px] font-bold text-white rounded-full flex items-center justify-center">
                    {cartItems.length}
                  </span>
                )}
              </button>
            </>
          ) : (
            <button 
              onClick={() => setIsLoginModalOpen(true)} 
              className="text-white/70 hover:text-white transition-colors" 
              title="로그인"
            >
              <User size={20} />
            </button>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden text-white z-50"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        {/* Mobile Menu Overlay */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-0 left-0 w-full h-screen bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center gap-8 md:hidden"
            >
              <Link
                to="/"
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-2xl font-medium text-white"
              >
                컬렉션
              </Link>
              <Link
                to="/"
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-2xl font-medium text-white"
              >
                아티스트
              </Link>
              <Link
                to="/brand-story"
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-2xl font-medium text-white"
              >
                브랜드 스토리
              </Link>
              <Link
                to="/anisotropic"
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-2xl font-medium text-white"
              >
                이방성 셰이더
              </Link>
              {user && (
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setIsInquiryModalOpen(true);
                  }}
                  className="text-2xl font-medium text-white/60 hover:text-white transition-colors"
                >
                  1:1 문의하기
                </button>
              )}
              <div className="flex gap-8 mt-8">
                {user ? (
                  <>
                    <Link to="/profile" onClick={() => setIsMobileMenuOpen(false)} className="text-white flex flex-col items-center gap-2">
                      <User size={28} />
                      <span className="text-xs">내 정보</span>
                    </Link>
                    <button 
                      onClick={() => {
                        localStorage.clear();
                        sessionStorage.clear();
                        document.cookie.split(";").forEach((c) => {
                          document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
                        });
                        signOut();
                        setIsMobileMenuOpen(false);
                        window.location.href = '/';
                      }} 
                      disabled={isLoggingOut}
                      className="text-white flex flex-col items-center gap-2 disabled:opacity-50"
                    >
                      {isLoggingOut ? <Loader2 className="animate-spin" size={28} /> : <LogOut size={28} />}
                      <span className="text-xs">로그아웃</span>
                    </button>
                    <button 
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        setIsCartOpen(true);
                      }}
                      className="text-white relative flex flex-col items-center gap-2"
                    >
                      <div className="relative">
                        <Frame size={28} />
                        {cartItems.length > 0 && (
                          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-[10px] font-bold text-white rounded-full flex items-center justify-center border-2 border-black">
                            {cartItems.length}
                          </span>
                        )}
                      </div>
                      <span className="text-xs">내 컬렉션</span>
                    </button>
                  </>
                ) : (
                  <button 
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      setIsLoginModalOpen(true);
                    }} 
                    className="text-white flex flex-col items-center gap-2"
                  >
                    <User size={28} />
                    <span className="text-xs">로그인</span>
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <LoginModal 
          isOpen={isLoginModalOpen} 
          onClose={() => setIsLoginModalOpen(false)} 
        />

        <Cart 
          isOpen={isCartOpen} 
          onClose={() => setIsCartOpen(false)} 
        />

        <InquiryModal 
          isOpen={isInquiryModalOpen} 
          onClose={() => setIsInquiryModalOpen(false)} 
        />
      </div>
    </header>
  );
}
