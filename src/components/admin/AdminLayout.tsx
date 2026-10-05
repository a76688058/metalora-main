import React, { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Globe, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/cn';
import {
  ADMIN_NAV_ITEMS,
  ADMIN_SIDEBAR_WIDTH_CLASS,
  adminNavTitle,
  isAdminNavActive,
} from './adminNav';

interface AdminLayoutProps {
  children: React.ReactNode;
}

function BrandMark() {
  return (
    <p className="text-xl font-black tracking-tighter">
      METALORA <span className="text-purple-500">ADMIN</span>
    </p>
  );
}

function NavLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="관리자 메뉴">
      <ul className="space-y-1">
        {ADMIN_NAV_ITEMS.map((item) => {
          const active = isAdminNavActive(pathname, item.path);
          const Icon = item.icon;
          return (
            <li key={item.path}>
              <Link
                to={item.path}
                aria-current={active ? 'page' : undefined}
                onClick={onNavigate}
                className={cn(
                  'focus-ring flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm',
                  active
                    ? 'bg-white font-bold text-black'
                    : 'text-zinc-400 hover:bg-zinc-900 hover:text-white',
                )}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const location = useLocation();
  const { signOut } = useAuth();
  const menuTitleId = useId();
  const logoutTitleId = useId();
  const logoutDescId = useId();
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const logoutRef = useRef<HTMLDivElement>(null);

  const pageTitle = adminNavTitle(location.pathname);

  const closeNav = () => {
    setIsNavOpen(false);
    menuTriggerRef.current?.focus();
  };

  const handleLogout = async () => {
    setShowLogoutModal(false);
    await signOut();
  };

  useEffect(() => {
    setIsNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isNavOpen && !showLogoutModal) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isNavOpen, showLogoutModal]);

  useEffect(() => {
    if (!isNavOpen && !showLogoutModal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (showLogoutModal) {
        setShowLogoutModal(false);
        return;
      }
      closeNav();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isNavOpen, showLogoutModal]);

  useEffect(() => {
    if (!isNavOpen) return;
    const root = drawerRef.current;
    const first = root?.querySelector<HTMLElement>('a, button');
    first?.focus();
  }, [isNavOpen]);

  useEffect(() => {
    if (!showLogoutModal) return;
    logoutRef.current?.querySelector<HTMLElement>('button')?.focus();
  }, [showLogoutModal]);

  const trapFocus = (event: React.KeyboardEvent, root: HTMLElement | null) => {
    if (event.key !== 'Tab' || !root) return;
    const focusable = Array.from(
      root.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="flex min-h-dvh overflow-x-hidden bg-black text-white">
      <aside
        className={cn('hidden h-dvh shrink-0 flex-col border-r border-white/5 bg-[#050505] lg:flex', ADMIN_SIDEBAR_WIDTH_CLASS)}
        inert={showLogoutModal || undefined}
      >
        <div className="flex h-16 shrink-0 items-center px-5">
          <BrandMark />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <NavLinks pathname={location.pathname} />
        </div>
        <div className="shrink-0 p-3">
          <button
            type="button"
            onClick={() => setShowLogoutModal(true)}
            className="focus-ring flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-zinc-400 hover:bg-red-500/5 hover:text-red-400"
          >
            <LogOut size={18} aria-hidden="true" />
            로그아웃
          </button>
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col overflow-hidden" inert={isNavOpen || showLogoutModal || undefined}>
        <header className="sticky top-0 z-20 flex shrink-0 items-center gap-3 border-b border-white/5 bg-black/80 px-4 py-3 backdrop-blur-xl lg:px-8 lg:py-5">
          <button
            ref={menuTriggerRef}
            type="button"
            className="focus-ring inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-zinc-900 text-white lg:hidden"
            aria-expanded={isNavOpen}
            aria-controls="admin-mobile-nav"
            aria-haspopup="dialog"
            onClick={() => setIsNavOpen(true)}
          >
            <Menu size={20} aria-hidden="true" />
            <span className="sr-only">관리자 메뉴 열기</span>
          </button>
          <h1 className="min-w-0 truncate text-base font-bold lg:text-lg">{pageTitle}</h1>
          <Link
            to="/"
            className="focus-ring ml-auto inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 px-3 text-xs font-medium text-zinc-400 hover:text-white"
          >
            <Globe size={14} aria-hidden="true" />
            스토어 바로가기
          </Link>
        </header>

        <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 lg:p-8">
          <div className="mx-auto w-full max-w-7xl min-w-0">
            {children}
          </div>
        </main>
      </div>

      {isNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/80"
            aria-label="관리자 메뉴 닫기"
            onClick={closeNav}
          />
          <div
            ref={drawerRef}
            id="admin-mobile-nav"
            role="dialog"
            aria-modal="true"
            aria-labelledby={menuTitleId}
            onKeyDown={(event) => trapFocus(event, drawerRef.current)}
            className="relative flex h-full w-72 max-w-[min(18rem,100vw)] flex-col bg-[#050505] border-r border-white/5"
          >
            <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-4">
              <p id={menuTitleId} className="text-sm font-bold">관리자 메뉴</p>
              <button
                type="button"
                onClick={closeNav}
                aria-label="닫기"
                className="focus-ring inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-white/5 text-zinc-300"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              <BrandMark />
              <div className="mt-4">
                <NavLinks pathname={location.pathname} onNavigate={closeNav} />
              </div>
            </div>
            <div className="shrink-0 space-y-1 border-t border-white/5 p-3">
              <Link
                to="/"
                onClick={closeNav}
                className="focus-ring flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-zinc-400 hover:text-white"
              >
                <Globe size={18} aria-hidden="true" />
                스토어 바로가기
              </Link>
              <button
                type="button"
                onClick={() => {
                  setIsNavOpen(false);
                  setShowLogoutModal(true);
                }}
                className="focus-ring flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-zinc-400 hover:bg-red-500/5 hover:text-red-400"
              >
                <LogOut size={18} aria-hidden="true" />
                로그아웃
              </button>
            </div>
          </div>
        </div>
      )}

      {showLogoutModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-4">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="로그아웃 취소"
            onClick={() => setShowLogoutModal(false)}
          />
          <div
            ref={logoutRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={logoutTitleId}
            aria-describedby={logoutDescId}
            onKeyDown={(event) => trapFocus(event, logoutRef.current)}
            className="relative z-10 w-full max-w-sm rounded-2xl border border-white/10 bg-[#0A0A0A] p-6"
          >
            <h2 id={logoutTitleId} className="text-xl font-bold text-white">로그아웃</h2>
            <p id={logoutDescId} className="mt-2 text-sm text-zinc-500">로그아웃하시겠습니까?</p>
            <div className="mt-6 space-y-2">
              <button
                type="button"
                onClick={() => { void handleLogout(); }}
                className="focus-ring min-h-11 w-full rounded-xl bg-zinc-900 font-medium text-white hover:bg-zinc-800"
              >
                로그아웃
              </button>
              <button
                type="button"
                onClick={() => setShowLogoutModal(false)}
                className="focus-ring min-h-11 w-full rounded-xl text-sm font-medium text-zinc-500 hover:text-white"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
