import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, LayoutDashboard, MessageSquare, Moon, Package, PenLine, Star, Sun, User, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { cn } from '../lib/cn';
import { zClass } from '../constants/overlays';
import { CustomerReviews } from './reviews/CustomerReviews';
import { GenieShell } from './shell/genieShell';
import { POLICY_ROWS } from './auth/AccountDrawer';
import OrdersModal from './OrdersModal';
import ProfileEditModal from './ProfileEditModal';
import InquiryModal from './InquiryModal';

interface ProfileOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

type ProfileCard = {
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
};

const iconProps = { size: 22, strokeWidth: 1.75, 'aria-hidden': true as const };

type ProfilePane = 'hub' | 'reviews' | 'orders' | 'profile' | 'inquiry';

const PANE_TITLE: Record<ProfilePane, string> = {
  hub: '내 정보',
  reviews: '리뷰',
  orders: '주문 내역',
  profile: '프로필 수정',
  inquiry: '1:1 문의',
};

export default function ProfileOverlay({ isOpen, onClose }: ProfileOverlayProps) {
  const { profile, signOut, openWorkshop } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [view, setView] = useState<ProfilePane>('hub');
  const [paneDir, setPaneDir] = useState<'none' | 'forward' | 'back'>('none');
  const [reduceMotion, setReduceMotion] = useState(false);
  const backRef = useRef<HTMLButtonElement>(null);
  const cardRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const originRef = useRef<string | null>(null);
  const inquiryBackRef = useRef<(() => void) | null>(null);
  const isDark = theme === 'dark';

  const goHub = () => {
    setPaneDir('back');
    setView('hub');
  };

  const openPane = (pane: Exclude<ProfilePane, 'hub'>, cardId: string) => {
    originRef.current = cardId;
    inquiryBackRef.current = null;
    setPaneDir('forward');
    setView(pane);
  };

  useEffect(() => {
    if (!isOpen) {
      setView('hub');
      setPaneDir('none');
    }
  }, [isOpen]);

  useEffect(() => {
    if (view !== 'inquiry') inquiryBackRef.current = null;
  }, [view]);

  useEffect(() => {
    if (!isOpen) return;
    if (view !== 'hub') backRef.current?.focus();
    else if (paneDir === 'back' && originRef.current) cardRefs.current[originRef.current]?.focus();
  }, [isOpen, view, paneDir]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduceMotion(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const menuItems: ProfileCard[] = [
    ...(profile?.is_admin ? [{
      id: 'admin',
      label: '관리자 대시보드',
      icon: <LayoutDashboard {...iconProps} />,
      onClick: () => {
        onClose();
        navigate('/admin');
      },
    }] : []),
    {
      id: 'workshop',
      label: '커스텀 제작',
      icon: <PenLine {...iconProps} />,
      onClick: () => {
        onClose();
        openWorkshop();
      },
    },
    {
      id: 'orders',
      label: '주문 내역',
      icon: <Package {...iconProps} />,
      onClick: () => openPane('orders', 'orders'),
    },
    {
      id: 'reviews',
      label: '리뷰',
      icon: <Star {...iconProps} />,
      onClick: () => openPane('reviews', 'reviews'),
    },
    {
      id: 'profile',
      label: '프로필 수정',
      icon: <User {...iconProps} />,
      onClick: () => openPane('profile', 'profile'),
    },
    {
      id: 'cs',
      label: '1:1 문의',
      icon: <MessageSquare {...iconProps} />,
      onClick: () => openPane('inquiry', 'cs'),
    },
  ];

  const greetingName = profile?.full_name?.trim() || '사용자';
  const muted = isDark ? 'text-[#c9c4b8]' : 'text-[#3f3c36]';
  const rowClass = 'flex min-h-11 w-full items-center justify-between gap-3 type-cta tracking-tight';

  return (
    <GenieShell
      isOpen={isOpen}
      labelledBy="profile-overlay-title"
      className={zClass('sheet')}
      panelClassName="w-full max-w-lg"
      backdropClassName="bg-black/60 backdrop-blur-sm"
      onClose={onClose}
    >
      <div
        className={cn(
          'ml-profile-panel flex h-full flex-col transition-colors duration-500',
          isDark ? 'bg-[#101114] text-[#f3f1ec]' : 'bg-[#f6f4ef] text-[#16150f]',
        )}
        data-theme={theme}
      >
        <style>{`
          .ml-profile-card:hover,
          .ml-profile-card:focus-visible { background: rgba(0, 0, 0, 0.04); }
          .ml-profile-panel[data-theme="dark"] .ml-profile-card:hover,
          .ml-profile-panel[data-theme="dark"] .ml-profile-card:focus-visible { background: rgba(255, 255, 255, 0.05); }
          .ml-profile-card:active { transform: translateY(1px); }
          .ml-profile-logout:hover,
          .ml-profile-logout:focus-visible { filter: brightness(1.06); }
          .ml-profile-logout:active { transform: translateY(1px); filter: brightness(0.97); }
          .ml-profile-forward { animation: ml-profile-forward 220ms cubic-bezier(0.22, 1, 0.36, 1); }
          .ml-profile-back { animation: ml-profile-back 220ms cubic-bezier(0.22, 1, 0.36, 1); }
          @keyframes ml-profile-forward {
            from { opacity: 0; transform: translateX(12px); }
            to { opacity: 1; transform: none; }
          }
          @keyframes ml-profile-back {
            from { opacity: 0; transform: translateX(-12px); }
            to { opacity: 1; transform: none; }
          }
          @media (prefers-reduced-motion: reduce) {
            .ml-profile-panel, .ml-profile-forward, .ml-profile-back { transition: none; animation: none; }
            .ml-profile-card:active,
            .ml-profile-logout:active { transform: none; }
            .ml-profile-card:hover,
            .ml-profile-card:focus-visible,
            .ml-profile-logout:hover,
            .ml-profile-logout:focus-visible { filter: none; }
          }
        `}</style>

        <div className={cn('flex items-start justify-between gap-3 border-b px-6 py-5', isDark ? 'border-white/5' : 'border-black/5')}>
          <div className="flex min-w-0 items-start gap-3">
            {view !== 'hub' && (
              <button
                ref={backRef}
                type="button"
                onClick={() => {
                  if (view === 'inquiry' && inquiryBackRef.current) {
                    inquiryBackRef.current();
                    return;
                  }
                  goHub();
                }}
                aria-label="내 정보로 돌아가기"
                className={cn(
                  'focus-ring flex size-10 shrink-0 items-center justify-center rounded-full',
                  isDark ? 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800 hover:text-white' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-black',
                )}
              >
                <ChevronLeft size={20} strokeWidth={1.75} />
              </button>
            )}
            <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="profile-overlay-title" className="text-[1.75rem] font-medium leading-none tracking-[-0.02em]">
                {PANE_TITLE[view]}
              </h2>
              {profile?.is_admin && view === 'hub' && (
                <span className={cn('rounded-[2px] border px-2 py-0.5 text-sm tracking-tight', muted, isDark ? 'border-white/20' : 'border-black/15')}>
                  관리자
                </span>
              )}
            </div>
            {view === 'hub' && (
              <p className={cn('mt-2 truncate text-sm', muted)}>
                {greetingName}님, 반갑습니다.
              </p>
            )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="내 정보 닫기"
            className={cn(
              'focus-ring -mr-1 shrink-0 rounded-full p-2',
              isDark ? 'text-zinc-500 hover:text-zinc-200' : 'text-zinc-400 hover:text-zinc-800',
            )}
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div
          key={view}
          className={cn(
            'custom-scrollbar min-h-0 flex-1 overflow-y-auto',
            (view === 'hub' || view === 'reviews') && 'px-6 py-5',
            !reduceMotion && paneDir === 'forward' && 'ml-profile-forward',
            !reduceMotion && paneDir === 'back' && 'ml-profile-back',
          )}
        >
          {view === 'reviews' && <CustomerReviews embedded onBack={goHub} />}
          {view === 'orders' && <OrdersModal embedded isOpen onClose={goHub} onExit={onClose} />}
          {view === 'profile' && <ProfileEditModal embedded isOpen onClose={goHub} />}
          {view === 'inquiry' && (
            <InquiryModal
              embedded
              isOpen
              onClose={goHub}
              onBindBack={(back) => { inquiryBackRef.current = back; }}
            />
          )}
          {view === 'hub' && (
            <div className="grid grid-cols-2 gap-3">
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  ref={(node) => { cardRefs.current[item.id] = node; }}
                  type="button"
                  onClick={item.onClick}
                  className={cn(
                    'ml-profile-card focus-ring flex min-h-[4.75rem] items-center gap-2.5 rounded-[2px] border px-3 py-4 text-left',
                    isDark ? 'border-white/10' : 'border-black/10',
                  )}
                >
                  <span className={cn('shrink-0', isDark ? 'text-zinc-400' : 'text-zinc-500')}>{item.icon}</span>
                  <span className="min-w-0 flex-1 text-base font-medium leading-snug tracking-tight [word-break:keep-all]">
                    {item.id === 'admin' ? <>관리자<br />대시보드</> : item.label}
                  </span>
                  <ChevronRight className="shrink-0 text-text-secondary" size={14} strokeWidth={1.75} aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </div>

        {view === 'hub' && (
        <div className="shrink-0 px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className={cn('mb-2 h-px w-full', isDark ? 'bg-white/[0.08]' : 'bg-black/[0.08]')} aria-hidden="true" />
          <div className={rowClass}>
            <span>화면 모드</span>
            <button
              type="button"
              role="switch"
              aria-checked={isDark}
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
              onClick={onClose}
              className={cn(rowClass, 'focus-ring rounded-sm')}
            >
              <span>{row.label}</span>
              <ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" />
            </Link>
          ))}
          <button
            type="button"
            onClick={() => {
              onClose();
              signOut();
            }}
            className={cn(
              'ml-profile-logout type-cta focus-ring mt-4 flex h-12 w-full items-center justify-center rounded-[2px]',
              isDark ? 'bg-[#f2f0ea] text-[#16150f]' : 'bg-[#1a1914] text-[#f4f1eb]',
            )}
          >
            로그아웃
          </button>
        </div>
        )}
      </div>
    </GenieShell>
  );
}
