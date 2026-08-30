import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';
import { cn } from '../lib/cn';
import { zClass } from '../constants/overlays';
import { useShellOverlay } from '../context/ShellOverlayContext';
import { dispatchAnalyticsConsentChanged } from '../lib/analytics';

export default function CookieBanner() {
  const { isTransactionOverlayActive } = useShellOverlay();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookieConsent');
    if (!consent) {
      const timer = setTimeout(() => setIsVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('cookieConsent', 'accepted');
    dispatchAnalyticsConsentChanged('accepted');
    setIsVisible(false);
  };

  const handleDecline = () => {
    localStorage.setItem('cookieConsent', 'essential_only');
    dispatchAnalyticsConsentChanged('essential_only');
    setIsVisible(false);
  };

  const openCookiePolicy = () => {
    window.dispatchEvent(new CustomEvent('open-policy', { detail: 'cookie' }));
  };

  const shouldShow = isVisible && !isTransactionOverlayActive;

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          role="region"
          aria-label="쿠키 사용 안내"
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          className={cn(
            'fixed inset-x-0 bottom-0 border-t border-border-subtle surface-floating pb-safe motion-safe-transition',
            zClass('cookie'),
          )}
          style={{ transitionDuration: 'var(--duration-panel)' }}
        >
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6 sm:py-5">
            <div className="min-w-0 flex-1 pr-8 sm:pr-0">
              <p className="type-supporting text-text-secondary">
                <strong className="type-label text-text-primary">METALORA</strong>
                {' '}는 더 나은 서비스 경험과 맞춤형 환경을 제공하기 위해 쿠키를 사용합니다.{' '}
                <button
                  type="button"
                  onClick={openCookiePolicy}
                  className="focus-ring type-label text-accent underline underline-offset-4 hover:text-accent-hover"
                >
                  쿠키 정책
                </button>
                을 확인해 주세요.
              </p>
            </div>

            <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
              <Button variant="secondary" size="md" fullWidth className="sm:w-auto" onClick={handleDecline}>
                필수만 허용
              </Button>
              <Button variant="primary" size="md" fullWidth className="sm:w-auto" onClick={handleAccept}>
                모두 동의
              </Button>
            </div>

            <IconButton
              variant="ghost"
              aria-label="닫기"
              onClick={handleDecline}
              className="absolute right-3 top-3 sm:hidden"
            >
              <X size={18} />
            </IconButton>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
