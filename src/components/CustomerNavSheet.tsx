import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './ui/IconButton';

interface CustomerNavSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onCustom: () => void;
  onSearch: () => void;
  onAccount: () => void;
  accountLabel: string;
}

export default function CustomerNavSheet({
  isOpen,
  onClose,
  onCustom,
  onSearch,
  onAccount,
  accountLabel,
}: CustomerNavSheetProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      restoreRef.current?.focus({ preventScroll: true });
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const itemClass =
    'focus-ring type-label flex min-h-11 w-full items-center justify-start border-0 bg-transparent px-1 text-left text-text-primary';

  return (
    <div
      id="customer-nav-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-nav-title"
      className="border-t border-border-subtle"
    >
      <div className="container-shell flex items-start justify-between gap-3 py-3">
        <div className="min-w-0 flex-1">
          <h2 id="customer-nav-title" className="type-label text-text-secondary">
            메뉴
          </h2>
          <nav aria-label="고객 메뉴" className="mt-2 flex flex-col">
            <button type="button" className={itemClass} onClick={onCustom}>
              커스텀 제작
            </button>
            <button type="button" className={itemClass} onClick={onSearch}>
              검색
            </button>
            <button type="button" className={itemClass} onClick={onAccount}>
              {accountLabel}
            </button>
          </nav>
        </div>
        <IconButton
          ref={closeRef}
          variant="ghost"
          aria-label="메뉴 닫기"
          onClick={onClose}
          className="shrink-0 text-text-secondary hover:text-text-primary"
        >
          <X size={18} />
        </IconButton>
      </div>
    </div>
  );
}
