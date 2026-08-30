import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react';
import { useCart } from './CartContext';

interface ShellOverlayContextType {
  /** Register a login-modal overlay source (header, PDP, etc.) */
  registerLoginOverlay: (id: string, active: boolean) => void;
  isTransactionOverlayActive: boolean;
}

const ShellOverlayContext = createContext<ShellOverlayContextType | undefined>(undefined);

export function ShellOverlayProvider({ children }: { children: React.ReactNode }) {
  const [loginOverlayIds, setLoginOverlayIds] = useState<Set<string>>(() => new Set());
  const { isCartOpen } = useCart();

  const registerLoginOverlay = useCallback((id: string, active: boolean) => {
    setLoginOverlayIds((prev) => {
      const next = new Set(prev);
      if (active) next.add(id);
      else next.delete(id);
      if (next.size === prev.size && active === prev.has(id)) return prev;
      return next;
    });
  }, []);

  const isLoginModalOpen = loginOverlayIds.size > 0;

  const value = useMemo(
    () => ({
      registerLoginOverlay,
      isTransactionOverlayActive: isCartOpen || isLoginModalOpen,
    }),
    [isCartOpen, isLoginModalOpen, registerLoginOverlay],
  );

  return <ShellOverlayContext.Provider value={value}>{children}</ShellOverlayContext.Provider>;
}

export function useShellOverlay() {
  const context = useContext(ShellOverlayContext);
  if (!context) {
    throw new Error('useShellOverlay must be used within ShellOverlayProvider');
  }
  return context;
}

/** Sync local login-modal open state into the shell overlay registry */
export function useRegisterLoginOverlay(id: string, isOpen: boolean) {
  const { registerLoginOverlay } = useShellOverlay();

  useLayoutEffect(() => {
    registerLoginOverlay(id, isOpen);
    return () => registerLoginOverlay(id, false);
  }, [id, isOpen, registerLoginOverlay]);
}
