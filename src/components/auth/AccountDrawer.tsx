import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Moon, Sun, X } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { cn } from '../../lib/cn';
import { zClass } from '../../constants/overlays';

const EASE_IN: [number, number, number, number] = [0.16, 1, 0.3, 1];
const EASE_OUT: [number, number, number, number] = [0.4, 0, 1, 1];

const POLICY_ROWS = [
  { to: '/policy/terms', label: '이용약관' },
  { to: '/policy/privacy', label: '개인정보처리방침' },
] as const;

/**
 * Logged-out Account hub. A3-owned.
 * Header wiring is A1. Logged-in hub remains ProfileOverlay (do not edit here).
 */
export default function AccountDrawer({
  isOpen,
  inert = false,
  onClose,
  onRequestAuth,
}: {
  isOpen: boolean;
  inert?: boolean;
  onClose: () => void;
  onRequestAuth: () => void;
}) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduceMotion(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const body = document.body;
    const prevOverflow = body.style.overflow;
    const prevPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    const preventBackgroundScroll = (event: Event) => {
      event.preventDefault();
    };
    const preventScrollKeys = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const key = event.key;
      if (
        key !== 'ArrowUp'
        && key !== 'ArrowDown'
        && key !== 'PageUp'
        && key !== 'PageDown'
        && key !== 'Home'
        && key !== 'End'
        && key !== ' '
      ) {
        return;
      }
      const target = event.target;
      if (
        key === ' '
        && target instanceof HTMLElement
        && (target.closest('button, a, [role="button"], [role="switch"], input, textarea, select') || target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
    };

    window.addEventListener('wheel', preventBackgroundScroll, { passive: false });
    window.addEventListener('touchmove', preventBackgroundScroll, { passive: false });
    window.addEventListener('keydown', preventScrollKeys);

    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPaddingRight;
      window.removeEventListener('wheel', preventBackgroundScroll);
      window.removeEventListener('touchmove', preventBackgroundScroll);
      window.removeEventListener('keydown', preventScrollKeys);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || inert) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, inert, onClose]);

  const panelMotion = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { x: '22%', opacity: 0 },
        animate: { x: 0, opacity: 1 },
        exit: { x: '14%', opacity: 0, transition: { duration: 0.4, ease: EASE_OUT } },
      };

  const rowClass = cn(
    'flex min-h-11 w-full items-center justify-between gap-3 type-metadata tracking-tight',
    isDark ? 'text-zinc-500' : 'text-zinc-400',
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: reduceMotion ? 0.16 : 0.5,
            ease: reduceMotion ? 'linear' : EASE_IN,
          }}
          role="dialog"
          aria-modal={!inert}
          aria-hidden={inert}
          {...(inert ? { inert: true } : {})}
          aria-labelledby="ml-acct-title"
          className={cn(
            'fixed inset-0 flex justify-end overflow-hidden',
            zClass('drawer'),
            inert && 'pointer-events-none',
          )}
        >
          <button
            type="button"
            tabIndex={inert ? -1 : 0}
            aria-label="계정 닫기"
            onClick={onClose}
            className={cn(
              'absolute inset-0 touch-none',
              isDark ? 'bg-black/[0.36]' : 'bg-[rgba(28,24,20,0.18)]',
              inert && 'opacity-0',
            )}
          />

          <motion.aside
            {...panelMotion}
            transition={
              reduceMotion
                ? { duration: 0.16 }
                : { duration: 0.62, ease: EASE_IN }
            }
            className={cn(
              'relative flex h-full w-full flex-col overflow-hidden sm:w-[24.5rem]',
              isDark ? 'ml-acct-panel--dark' : 'ml-acct-panel--light',
            )}
          >
            <style>{`
              .ml-acct-panel--dark {
                background: #121316;
                box-shadow:
                  inset 1px 0 0 rgba(255,255,255,0.06),
                  -24px 0 48px rgba(0,0,0,0.28);
              }
              .ml-acct-panel--light {
                background: #f4f1eb;
                box-shadow:
                  inset 1px 0 0 rgba(255,255,255,0.82),
                  -20px 0 40px rgba(28,24,20,0.10);
              }
              .ml-acct-cta {
                height: 3rem;
                width: 100%;
                border-radius: 2px;
                letter-spacing: -0.02em;
              }
              .ml-acct-cta--dark {
                color: #16150f;
                background: #f2f0ea;
              }
              .ml-acct-cta--light {
                color: #f4f1eb;
                background: #1a1914;
              }
              .ml-acct-cta:hover,
              .ml-acct-cta:focus-visible {
                filter: brightness(1.06);
              }
              .ml-acct-cta:active {
                transform: translateY(1px);
                filter: brightness(0.97);
              }
              @media (prefers-reduced-motion: reduce) {
                .ml-acct-cta:active { transform: none; }
                .ml-acct-cta:hover,
                .ml-acct-cta:focus-visible { filter: none; }
              }
            `}</style>

            <div className="flex items-center justify-between px-7 pt-6">
              <img
                id="ml-acct-title"
                src="/logo/metalora-wordmark.webp"
                alt="METALORA"
                width={384}
                height={124}
                className={`w-[6.25rem] object-contain ${isDark ? 'invert' : ''}`}
                referrerPolicy="no-referrer"
              />
              <button
                type="button"
                onClick={onClose}
                tabIndex={inert ? -1 : 0}
                aria-label="계정 닫기"
                className={cn(
                  'focus-ring -mr-1 rounded-full p-2',
                  isDark ? 'text-zinc-500 hover:text-zinc-200' : 'text-zinc-400 hover:text-zinc-800',
                )}
              >
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col px-7 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              <div className="pt-[min(16vh,7.25rem)]">
                <h2
                  className={cn(
                    'type-page-title',
                    isDark ? 'text-[#f3f1ec]' : 'text-[#16150f]',
                  )}
                >
                  오직 당신만의 커스텀 작품을
                  <br />
                  만들어보세요.
                </h2>

                <button
                  type="button"
                  onClick={onRequestAuth}
                  tabIndex={inert ? -1 : 0}
                  className={cn(
                    'ml-acct-cta type-cta focus-ring mt-9',
                    isDark ? 'ml-acct-cta--dark' : 'ml-acct-cta--light',
                  )}
                >
                  로그인하고 제작하기
                </button>
              </div>

              <div className="mt-auto pt-10">
                <div
                  className={cn('mb-2 h-px w-full', isDark ? 'bg-white/[0.08]' : 'bg-black/[0.08]')}
                  aria-hidden="true"
                />

                <div className={rowClass}>
                  <span>화면 모드</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isDark}
                    tabIndex={inert ? -1 : 0}
                    aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
                    onClick={toggleTheme}
                    className={cn(
                      'focus-ring relative h-7 w-[2.85rem] shrink-0 rounded-full',
                      isDark ? 'bg-[#2a2b30]' : 'bg-[#ddd8d0]',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 flex size-6 items-center justify-center rounded-full',
                        isDark
                          ? 'left-0.5 translate-x-[1.15rem] bg-[#3a3c42] text-zinc-200'
                          : 'left-0.5 translate-x-0 bg-white text-zinc-700',
                        !reduceMotion && 'transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
                      )}
                    >
                      {isDark ? <Moon size={12} strokeWidth={1.75} /> : <Sun size={12} strokeWidth={1.75} />}
                    </span>
                  </button>
                </div>

                {POLICY_ROWS.map((row) => (
                  <Link
                    key={row.to}
                    to={row.to}
                    tabIndex={inert ? -1 : 0}
                    onClick={onClose}
                    className={cn(
                      rowClass,
                      'focus-ring rounded-sm',
                      isDark ? 'hover:text-zinc-300' : 'hover:text-zinc-700',
                    )}
                  >
                    <span>{row.label}</span>
                    <ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </div>

            {inert && (
              <div
                className="pointer-events-none absolute inset-0"
                style={{ background: isDark ? 'rgba(8,9,11,0.38)' : 'rgba(28,24,20,0.14)' }}
                aria-hidden="true"
              />
            )}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
