import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn';
import { acquireBodyScrollLock } from './bodyScrollLock';
import { DockGenieMesh } from './genieProjective';

const OPEN_MS = 500;
const CLOSE_MS = 500;
export const ACCOUNT_ANCHOR = '[data-account-anchor]';

type Phase = 'closed' | 'opening' | 'open' | 'closing';

const FOCUSABLE = 'a[href], button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function GenieShell({
  isOpen,
  inert = false,
  labelledBy,
  anchor = ACCOUNT_ANCHOR,
  className,
  panelClassName,
  backdropClassName,
  onClose,
  children,
}: {
  isOpen: boolean;
  inert?: boolean;
  labelledBy: string;
  anchor?: string;
  className?: string;
  panelClassName: string;
  backdropClassName: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<Phase>('closed');
  const [reduced, setReduced] = useState(false);
  const [fallback, setFallback] = useState(false);
  const phaseRef = useRef<Phase>('closed');
  const progressRef = useRef(0);
  const targetRef = useRef(0);
  const visualRef = useRef<HTMLDivElement>(null);
  const meshHostRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const meshRef = useRef<DockGenieMesh | null>(null);
  const frameRef = useRef(0);
  const lastRef = useRef(0);
  const openerRef = useRef<HTMLElement | null>(null);
  const anchorRef = useRef(anchor);
  const missRef = useRef(0);
  anchorRef.current = anchor;

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (!mounted) return undefined;
    return acquireBodyScrollLock();
  }, [mounted]);

  const stop = () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
  };

  const finish = (next: Phase) => {
    stop();
    phaseRef.current = next;
    setPhase(next);
    if (next === 'open') {
      progressRef.current = 1;
      targetRef.current = 1;
      meshRef.current?.destroy();
      meshRef.current = null;
    }
    if (next === 'closed') {
      progressRef.current = 0;
      targetRef.current = 0;
      meshRef.current?.destroy();
      meshRef.current = null;
      setMounted(false);
      restoreOpenerFocus();
    }
  };

  const restoreOpenerFocus = () => {
    const opener = openerRef.current;
    openerRef.current = null;
    window.setTimeout(() => {
      const fallback = document.querySelector(anchorRef.current);
      const target = opener && opener.isConnected ? opener : fallback;
      if (target instanceof HTMLElement && !target.hasAttribute('disabled')) {
        target.focus({ preventScroll: true });
      }
    }, 32);
  };

  const paint = () => {
    const visual = visualRef.current;
    const host = meshHostRef.current;
    if (!visual || !host || reduced) return;
    if (!meshRef.current || meshRef.current.host !== host || meshRef.current.anchorSelector !== anchorRef.current) {
      meshRef.current?.destroy();
      meshRef.current = new DockGenieMesh(host, anchorRef.current);
    }
    const progress = progressRef.current;
    if (backdropRef.current) backdropRef.current.style.opacity = String(progress);
    if (progress <= 0 || progress >= 1) {
      if (progress >= 1 && visual.parentElement) visual.parentElement.style.visibility = '';
      meshRef.current.destroy();
      return;
    }
    const warped = meshRef.current.render(visual, progress);
    if (warped) {
      missRef.current = 0;
      return;
    }
    missRef.current += 1;
    if (missRef.current > 8) setFallback(true);
  };

  const tick = (now: number) => {
    const dt = lastRef.current ? Math.min(48, now - lastRef.current) : 16;
    lastRef.current = now;
    const target = targetRef.current;
    const duration = target >= progressRef.current ? OPEN_MS : CLOSE_MS;
    const step = dt / duration;
    const current = progressRef.current;
    progressRef.current = current < target
      ? Math.min(target, current + step)
      : Math.max(target, current - step);
    paint();
    if (progressRef.current === target) {
      finish(target === 1 ? 'open' : 'closed');
      return;
    }
    frameRef.current = requestAnimationFrame(tick);
  };

  const drive = (open: boolean) => {
    if (open && (phaseRef.current === 'closed' || phaseRef.current === 'closing')) {
      const trigger = document.querySelector(anchorRef.current);
      openerRef.current = trigger instanceof HTMLElement
        ? trigger
        : (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      missRef.current = 0;
      setFallback(false);
    }
    if (prefersReducedMotion() || reduced) {
      setMounted(open);
      progressRef.current = open ? 1 : 0;
      targetRef.current = open ? 1 : 0;
      finish(open ? 'open' : 'closed');
      return;
    }
    targetRef.current = open ? 1 : 0;
    const next: Phase = open ? 'opening' : 'closing';
    if (!mounted) setMounted(true);
    phaseRef.current = next;
    setPhase(next);
    stop();
    lastRef.current = 0;
    frameRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    if (isOpen) {
      if (phaseRef.current === 'open') return;
      drive(true);
      return;
    }
    if (phaseRef.current === 'closed') return;
    drive(false);
    // drive identity is stable enough for open/close edges
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, reduced]);

  useLayoutEffect(() => {
    if (phase === 'opening' || phase === 'closing') paint();
    if (phase === 'open' || phase === 'closed') meshRef.current?.destroy();
  }, [phase]);

  useEffect(() => () => {
    stop();
    meshRef.current?.destroy();
  }, []);

  useEffect(() => {
    if (phase !== 'open' || inert) return undefined;
    const root = rootRef.current;
    if (!root) return undefined;
    const items = () => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
      if (el.closest('[inert], [aria-hidden="true"]')) return false;
      return el.getClientRects().length > 0;
    });
    const first = items()[0];
    first?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const list = items();
      if (!list.length) return;
      const index = list.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey
        ? (index <= 0 ? list[list.length - 1] : list[index - 1])
        : (index < 0 || index >= list.length - 1 ? list[0] : list[index + 1]);
      event.preventDefault();
      next.focus({ preventScroll: true });
    };
    root.addEventListener('keydown', onKey);
    return () => root.removeEventListener('keydown', onKey);
  }, [phase, inert]);

  useEffect(() => {
    if (!mounted || inert) return undefined;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [mounted, inert, onClose]);

  useEffect(() => {
    const root = rootRef.current;
    const app = document.getElementById('root');
    if (!root || !app || phase !== 'open' || inert) return undefined;
    const changed: HTMLElement[] = [];
    let node: HTMLElement | null = root;
    while (node && node !== app) {
      const parent = node.parentElement;
      if (!parent) break;
      Array.from(parent.children).forEach((child) => {
        if (!(child instanceof HTMLElement) || child === node || child.contains(root)) return;
        if (child.hasAttribute('inert')) return;
        child.setAttribute('inert', '');
        changed.push(child);
      });
      node = parent;
    }
    return () => {
      changed.forEach((node) => node.removeAttribute('inert'));
    };
  }, [phase, inert]);

  if (!mounted) return null;

  const interactive = phase === 'open' && !inert;
  const concealed = !reduced && !fallback && phase !== 'open';

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal={interactive}
      aria-hidden={inert || !interactive ? true : undefined}
      inert={inert}
      aria-labelledby={labelledBy}
      className={cn('fixed inset-0 flex justify-end overflow-hidden', className)}
    >
      <button
        ref={backdropRef}
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
        className={cn('absolute inset-0 touch-none', backdropClassName)}
        style={{ opacity: inert ? 0 : (reduced || phase === 'open' ? 1 : 0) }}
      />
      <div
        className={cn('relative h-full', panelClassName)}
        style={{ visibility: concealed ? 'hidden' : 'visible' }}
      >
        <div ref={visualRef} className="h-full">
          {children}
        </div>
      </div>
      <div ref={meshHostRef} className="pointer-events-none absolute inset-0 z-[2] overflow-visible" aria-hidden="true" />
    </div>
  );
}
