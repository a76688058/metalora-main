import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { X } from 'lucide-react';

export default function CookieBanner() {
  const { theme } = useTheme();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookieConsent');
    if (!consent) {
      // 약간의 지연 후 배너 표시 (UX 향상)
      const timer = setTimeout(() => setIsVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('cookieConsent', 'accepted');
    setIsVisible(false);
  };

  const handleDecline = () => {
    localStorage.setItem('cookieConsent', 'essential_only');
    setIsVisible(false);
  };

  const openCookiePolicy = () => {
    window.dispatchEvent(new CustomEvent('open-policy', { detail: 'cookie' }));
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className={`fixed bottom-0 left-0 right-0 z-[60000] p-5 md:p-6 border-t shadow-2xl backdrop-blur-xl transition-colors duration-500 ${
            theme === 'dark' 
              ? 'bg-zinc-950/85 border-white/10 text-zinc-300' 
              : 'bg-white/85 border-black/10 text-zinc-700'
          }`}
        >
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-5 relative">
            
            {/* 텍스트 영역 */}
            <div className="flex-1 pr-6 md:pr-8">
              <p className="text-[14px] md:text-[15px] leading-relaxed font-medium">
                <strong className={theme === 'dark' ? 'text-white' : 'text-black'}>METALORA</strong>는 더 나은 서비스 경험과 맞춤형 환경을 제공하기 위해 쿠키를 사용합니다. 
                자세한 내용은{' '}
                <button 
                  onClick={openCookiePolicy} 
                  className={`underline underline-offset-4 font-semibold transition-colors ${
                    theme === 'dark' ? 'text-white hover:text-purple-400' : 'text-black hover:text-purple-600'
                  }`}
                >
                  쿠키 정책
                </button>
                을 확인해 주세요.
              </p>
            </div>

            {/* 버튼 영역 */}
            <div className="flex items-center gap-3 w-full md:w-auto shrink-0">
              <button
                onClick={handleDecline}
                className={`flex-1 md:flex-none px-6 py-3 rounded-xl text-[14px] font-semibold transition-colors ${
                  theme === 'dark'
                    ? 'bg-zinc-800 hover:bg-zinc-700 text-white'
                    : 'bg-zinc-200 hover:bg-zinc-300 text-black'
                }`}
              >
                필수만 허용
              </button>
              <button
                onClick={handleAccept}
                className="flex-1 md:flex-none px-6 py-3 rounded-xl text-[14px] font-semibold bg-purple-600 hover:bg-purple-700 text-white transition-colors shadow-lg shadow-purple-500/20"
              >
                모두 동의
              </button>
            </div>

            {/* 모바일 닫기 버튼 */}
            <button 
              onClick={handleDecline}
              className={`absolute -top-1 -right-1 md:hidden p-1.5 rounded-full transition-colors ${
                theme === 'dark' ? 'bg-zinc-800 text-zinc-400 hover:text-white' : 'bg-zinc-200 text-zinc-500 hover:text-black'
              }`}
              aria-label="닫기"
            >
              <X size={16} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
