import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';
import { cn } from '../lib/cn';
import { zClass } from '../constants/overlays';
import { useShellOverlay } from '../context/ShellOverlayContext';
import {
  dispatchAnalyticsConsentChanged,
  getAnalyticsConsent,
} from '../lib/analytics';

type ConsentValue = 'accepted' | 'essential_only';

const panelMotion = {
  initial: { y: '100%', opacity: 0 },
  animate: { y: 0, opacity: 1 },
  exit: { y: '100%', opacity: 0 },
  transition: { type: 'spring' as const, damping: 28, stiffness: 320 },
};

function consentStatusLabel(consent: ConsentValue | null): string {
  if (consent === 'accepted') return '현재 선택적 분석 쿠키를 허용한 상태입니다.';
  if (consent === 'essential_only') return '현재 선택적 분석 쿠키가 꺼져 있습니다.';
  return '아직 분석 쿠키 사용 여부를 선택하지 않았습니다.';
}

export default function CookieBanner() {
  const { isTransactionOverlayActive } = useShellOverlay();
  const [isVisible, setIsVisible] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [consent, setConsent] = useState<ConsentValue | null>(null);
  const settingsCloseRef = useRef<HTMLButtonElement>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearBannerTimer = () => {
    if (bannerTimerRef.current) {
      clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = null;
    }
  };

  useEffect(() => {
    const stored = getAnalyticsConsent();
    setConsent(stored);
    if (!stored) {
      bannerTimerRef.current = setTimeout(() => setIsVisible(true), 1500);
      return () => clearBannerTimer();
    }
  }, []);

  useEffect(() => {
    const openSettings = () => {
      clearBannerTimer();
      setConsent(getAnalyticsConsent());
      setIsSettingsOpen(true);
      setIsVisible(false);
    };
    window.addEventListener('open-cookie-settings', openSettings);
    return () => window.removeEventListener('open-cookie-settings', openSettings);
  }, []);

  const closeSettings = () => {
    setIsSettingsOpen(false);
    if (!getAnalyticsConsent()) {
      setIsVisible(true);
    }
  };

  useEffect(() => {
    if (!isSettingsOpen || isTransactionOverlayActive) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeSettings();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSettingsOpen, isTransactionOverlayActive]);

  useEffect(() => {
    if (isSettingsOpen && !isTransactionOverlayActive) {
      settingsCloseRef.current?.focus({ preventScroll: true });
    }
  }, [isSettingsOpen, isTransactionOverlayActive]);

  const applyConsent = (value: ConsentValue) => {
    clearBannerTimer();
    localStorage.setItem('cookieConsent', value);
    dispatchAnalyticsConsentChanged(value);
    setConsent(value);
    setIsVisible(false);
    setIsSettingsOpen(false);
  };

  const handleAccept = () => applyConsent('accepted');
  const handleDecline = () => applyConsent('essential_only');

  const openCookiePolicy = () => {
    window.dispatchEvent(new CustomEvent('open-policy', { detail: 'cookie' }));
  };

  const shouldShowBanner = isVisible && !isSettingsOpen && !isTransactionOverlayActive;
  const shouldShowSettings = isSettingsOpen && !isTransactionOverlayActive;

  return (
    <>
      <AnimatePresence>
        {shouldShowBanner && (
          <motion.div
            role="region"
            aria-label="쿠키 사용 안내"
            {...panelMotion}
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
                  {' '}는 사이트 이용 현황을 분석하고 서비스를 개선하기 위해 선택적 분석 쿠키를 사용합니다.{' '}
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

      <AnimatePresence>
        {shouldShowSettings && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cookie-settings-title"
            {...panelMotion}
            className={cn(
              'fixed inset-x-0 bottom-0 border-t border-border-subtle surface-floating pb-safe motion-safe-transition',
              zClass('cookie'),
            )}
            style={{ transitionDuration: 'var(--duration-panel)' }}
          >
            <div className="relative mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 pr-2">
                  <h2 id="cookie-settings-title" className="type-label text-text-primary">
                    쿠키 설정
                  </h2>
                  <p className="type-supporting mt-2 text-text-secondary">
                    선택적 분석 쿠키는 사이트 이용 현황 분석과 서비스 개선에 사용됩니다.{' '}
                    <button
                      type="button"
                      onClick={openCookiePolicy}
                      className="focus-ring type-label text-accent underline underline-offset-4 hover:text-accent-hover"
                    >
                      쿠키 정책
                    </button>
                  </p>
                  <p className="type-supporting mt-2 text-text-tertiary">{consentStatusLabel(consent)}</p>
                </div>
                <IconButton
                  ref={settingsCloseRef}
                  variant="ghost"
                  aria-label="쿠키 설정 닫기"
                  onClick={closeSettings}
                  className="shrink-0"
                >
                  <X size={18} />
                </IconButton>
              </div>

              <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
                <Button variant="secondary" size="md" fullWidth className="sm:w-auto" onClick={handleDecline}>
                  필수만 허용
                </Button>
                <Button variant="primary" size="md" fullWidth className="sm:w-auto" onClick={handleAccept}>
                  모두 동의
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
