import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { IconButton } from '../ui/IconButton';
import { Button } from '../ui/Button';
import { cn } from '../../lib/cn';
import { zClass } from '../../constants/overlays';
import { getFullImageUrl } from '../../lib/utils';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import type { Product } from '../../data/products';
import {
  ARTWORK_INSIDE_FRACTION,
  ARTWORK_LOCK_SETTLE_MS,
  ARTWORK_MAX_LONG_FRACTION,
  ARTWORK_MIN_HIT_PX,
  ARTWORK_MIN_SHORT_FRACTION,
  ARTWORK_MOVE_THRESHOLD_PX,
  ARTWORK_NUDGE_LARGE_PX,
  ARTWORK_NUDGE_PX,
  ARTWORK_SCALE_STEP,
  type ArtworkPlacement,
} from './roomPreview/types';
import { useRoomPreviewSession } from './roomPreview/useRoomPreviewSession';
import { catalogSizeCaption, CATALOG_M_SIZE_LABEL } from './catalogSizeLabel';

const A4_SHORT_MM = 210;
const A4_LONG_MM = 297;

const LOCKED_SHADOW = '0 10px 24px rgba(0,0,0,0.4), 0 18px 28px -8px rgba(0,0,0,0.45)';
const EDITING_SHADOW =
  '0 0 0 2px var(--color-text-primary), 0 0 0 3px var(--color-canvas), 0 14px 32px rgba(0,0,0,0.5), 0 22px 36px -8px rgba(0,0,0,0.48)';
const EDIT_CHROME_PX = 44;
const EDIT_CHROME_OUTSET = 12;
const SAFE_INLINE = 'pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]';

interface ProductTheatreRoomPreviewProps {
  product: Product;
  orientation: 'portrait' | 'landscape';
  optionName: string;
  optionDimension: string;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}

function isRealAssetUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.includes('picsum.photos')) return false;
  return true;
}

function resolveFrontDisplayUrl(product: Product, orientation: 'portrait' | 'landscape'): string | null {
  const raw =
    orientation === 'landscape' && product.landscape_image
      ? product.landscape_image
      : product.front_image || product.image;
  const url = getFullImageUrl(raw);
  return isRealAssetUrl(url) ? url : null;
}

function panelMillimetresFromDimension(dimension: string | undefined): { shortMm: number; longMm: number } {
  if (!dimension) return { shortMm: A4_SHORT_MM, longMm: A4_LONG_MM };
  const normalized = dimension.toLowerCase().replace(/×/g, 'x');
  const nums = normalized.match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 1) return { shortMm: A4_SHORT_MM, longMm: A4_LONG_MM };
  const a = Number(nums[0]);
  const b = nums.length >= 2 ? Number(nums[1]) : a;
  if (!Number.isFinite(a) || a <= 0) return { shortMm: A4_SHORT_MM, longMm: A4_LONG_MM };
  const rawShort = Math.min(a, Number.isFinite(b) && b > 0 ? b : a);
  const rawLong = Math.max(a, Number.isFinite(b) && b > 0 ? b : a);
  const toMm = /\bmm\b/.test(normalized) ? 1 : /\bcm\b/.test(normalized) ? 10 : null;
  if (toMm == null) return { shortMm: A4_SHORT_MM, longMm: A4_LONG_MM };
  return { shortMm: rawShort * toMm, longMm: rawLong * toMm };
}

function panelAspectFromDimension(
  dimension: string | undefined,
  orientation: 'portrait' | 'landscape',
): number {
  const { shortMm, longMm } = panelMillimetresFromDimension(dimension);
  return orientation === 'landscape' ? longMm / shortMm : shortMm / longMm;
}

function formatOptionDimension(dimension: string, orientation: 'portrait' | 'landscape'): string {
  const dim = dimension || '';
  if (!dim) return '';
  if (!dim.toLowerCase().includes('x')) return dim;
  const parts = dim.toLowerCase().split('x');
  if (parts.length !== 2) return dim;
  const first = parts[0].replace(/cm/g, '').trim();
  const second = parts[1].replace(/cm/g, '').trim();
  if (orientation === 'landscape') {
    return `${second} × ${first} cm`;
  }
  return `${first} × ${second} cm`;
}

function formatSizeCaption(
  optionName: string,
  optionDimension: string,
  orientation: 'portrait' | 'landscape',
): string {
  const mapped = catalogSizeCaption(optionName, optionDimension);
  if (mapped === CATALOG_M_SIZE_LABEL) return mapped;
  const dims = formatOptionDimension(optionDimension, orientation);
  if (optionName && dims) return `${optionName} · ${dims}`;
  return optionName || dims;
}

function lockDocumentScroll(): number {
  const y = window.scrollY;
  document.body.style.overflow = 'hidden';
  document.body.style.position = 'fixed';
  document.body.style.top = `-${y}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
  return y;
}

function unlockDocumentScroll(y: number | null) {
  document.body.style.overflow = '';
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';
  if (y != null) window.scrollTo(0, y);
}

function isFocusable(el: HTMLElement): boolean {
  if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') return false;
  if (el.tabIndex < 0) return false;
  const rects = el.getClientRects();
  return rects.length > 0;
}

interface PhotoDisplayRect {
  width: number;
  height: number;
  left: number;
  top: number;
}

function fitPhotoRect(
  availableWidth: number,
  availableHeight: number,
  photoWidth: number,
  photoHeight: number,
): PhotoDisplayRect | null {
  if (availableWidth <= 0 || availableHeight <= 0 || photoWidth <= 0 || photoHeight <= 0) {
    return null;
  }
  const scale = Math.min(availableWidth / photoWidth, availableHeight / photoHeight);
  const width = photoWidth * scale;
  const height = photoHeight * scale;
  return {
    width,
    height,
    left: (availableWidth - width) / 2,
    top: (availableHeight - height) / 2,
  };
}

function artworkPixelSize(
  photoRect: PhotoDisplayRect,
  longFrac: number,
  aspect: number,
): { width: number; height: number } {
  const photoShort = Math.min(photoRect.width, photoRect.height);
  const longEdge = photoShort * longFrac;
  if (aspect <= 1) return { width: longEdge * aspect, height: longEdge };
  return { width: longEdge, height: longEdge / aspect };
}

function clampLongFrac(longFrac: number, photoRect: PhotoDisplayRect, aspect: number): number {
  const photoShort = Math.min(photoRect.width, photoRect.height);
  const photoLong = Math.max(photoRect.width, photoRect.height);
  const minLongEdge =
    aspect <= 1 ? (photoShort * ARTWORK_MIN_SHORT_FRACTION) / aspect : photoShort * ARTWORK_MIN_SHORT_FRACTION * aspect;
  const maxLongEdge = photoLong * ARTWORK_MAX_LONG_FRACTION;
  const minFrac = minLongEdge / photoShort;
  const maxFrac = maxLongEdge / photoShort;
  return Math.min(maxFrac, Math.max(minFrac, longFrac));
}

function overlapArea(
  left: number,
  top: number,
  width: number,
  height: number,
  photoW: number,
  photoH: number,
): number {
  const overlapW = Math.max(0, Math.min(left + width, photoW) - Math.max(left, 0));
  const overlapH = Math.max(0, Math.min(top + height, photoH) - Math.max(top, 0));
  return overlapW * overlapH;
}

function clampPlacement(
  placement: ArtworkPlacement,
  photoRect: PhotoDisplayRect,
  aspect: number,
): ArtworkPlacement {
  const longFrac = clampLongFrac(placement.longFrac, photoRect, aspect);
  const { width, height } = artworkPixelSize(photoRect, longFrac, aspect);
  let left = placement.cx * photoRect.width - width / 2;
  let top = placement.cy * photoRect.height - height / 2;
  const maxOverlap = Math.min(width, photoRect.width) * Math.min(height, photoRect.height);
  const target = Math.min(ARTWORK_INSIDE_FRACTION * width * height, maxOverlap);
  if (overlapArea(left, top, width, height, photoRect.width, photoRect.height) < target) {
    const artCx = left + width / 2;
    const artCy = top + height / 2;
    const photoCx = photoRect.width / 2;
    const photoCy = photoRect.height / 2;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 18; i += 1) {
      const mid = (lo + hi) / 2;
      const nl = artCx + (photoCx - artCx) * mid - width / 2;
      const nt = artCy + (photoCy - artCy) * mid - height / 2;
      if (overlapArea(nl, nt, width, height, photoRect.width, photoRect.height) >= target) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    left = artCx + (photoCx - artCx) * hi - width / 2;
    top = artCy + (photoCy - artCy) * hi - height / 2;
  }
  return {
    cx: (left + width / 2) / photoRect.width,
    cy: (top + height / 2) / photoRect.height,
    longFrac,
  };
}

type Gesture =
  | {
      kind: 'pending';
      pointerId: number;
      startX: number;
      startY: number;
      start: ArtworkPlacement;
      fromLocked: boolean;
    }
  | {
      kind: 'move';
      pointerId: number;
      startX: number;
      startY: number;
      start: ArtworkPlacement;
    }
  | {
      kind: 'resize';
      pointerId: number;
      nwX: number;
      nwY: number;
      startDist: number;
      start: ArtworkPlacement;
    }
  | {
      kind: 'pinch';
      a: number;
      b: number;
      startDist: number;
      start: ArtworkPlacement;
    };

function pointerDistance(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Displayed photo origin in client (viewport) pixels — not overlay or window. */
function photoClientOrigin(
  photoEl: HTMLElement | null,
  viewportEl: HTMLElement | null,
  photoRect: PhotoDisplayRect,
): { left: number; top: number } {
  if (photoEl) {
    const box = photoEl.getBoundingClientRect();
    return { left: box.left, top: box.top };
  }
  if (viewportEl) {
    const box = viewportEl.getBoundingClientRect();
    return { left: box.left + photoRect.left, top: box.top + photoRect.top };
  }
  return { left: photoRect.left, top: photoRect.top };
}

function viewportSizeFromPhotoRect(photoRect: PhotoDisplayRect): { width: number; height: number } {
  return {
    width: photoRect.width + photoRect.left * 2,
    height: photoRect.height + photoRect.top * 2,
  };
}

function clampChromeInViewport(
  artLeft: number,
  artTop: number,
  artWidth: number,
  artHeight: number,
  photoRect: PhotoDisplayRect,
  corner: 'ne' | 'se',
): { left: number; top: number } {
  const viewport = viewportSizeFromPhotoRect(photoRect);
  const artVx = photoRect.left + artLeft;
  const artVy = photoRect.top + artTop;
  let vx = artVx + artWidth + EDIT_CHROME_OUTSET - EDIT_CHROME_PX;
  let vy =
    corner === 'ne'
      ? artVy - EDIT_CHROME_OUTSET
      : artVy + artHeight + EDIT_CHROME_OUTSET - EDIT_CHROME_PX;
  const maxX = Math.max(0, viewport.width - EDIT_CHROME_PX);
  const maxY = Math.max(0, viewport.height - EDIT_CHROME_PX);
  vx = Math.min(maxX, Math.max(0, vx));
  vy = Math.min(maxY, Math.max(0, vy));
  return { left: vx - artVx, top: vy - artVy };
}

function separateOverlappingChrome(
  check: { left: number; top: number },
  handle: { left: number; top: number },
  artLeft: number,
  artTop: number,
  photoRect: PhotoDisplayRect,
): { check: { left: number; top: number }; handle: { left: number; top: number } } {
  const viewport = viewportSizeFromPhotoRect(photoRect);
  const cx = photoRect.left + artLeft + check.left;
  const cy = photoRect.top + artTop + check.top;
  const hx = photoRect.left + artLeft + handle.left;
  let hy = photoRect.top + artTop + handle.top;
  if (Math.abs(cx - hx) < EDIT_CHROME_PX && Math.abs(cy - hy) < EDIT_CHROME_PX) {
    hy = cy + EDIT_CHROME_PX;
    const maxY = Math.max(0, viewport.height - EDIT_CHROME_PX);
    if (hy > maxY) hy = Math.max(0, cy - EDIT_CHROME_PX);
    hy = Math.min(maxY, Math.max(0, hy));
    return { check, handle: { left: handle.left, top: hy - (photoRect.top + artTop) } };
  }
  return { check, handle };
}

export function ProductTheatreRoomPreview({
  product,
  orientation,
  optionName,
  optionDimension,
  returnFocusRef,
  onClose,
}: ProductTheatreRoomPreviewProps) {
  const titleId = useId();
  const fileInputId = useId();
  const reducedMotion = usePrefersReducedMotion();
  const { phase, photo, error, placement, mode, ingestFile, setPlacement, setMode, resetPlacement, reset } =
    useRoomPreviewSession();
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const emptyCtaRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const photoRectElRef = useRef<HTMLDivElement>(null);
  const artworkRef = useRef<HTMLDivElement>(null);
  const lockedScrollYRef = useRef<number | null>(null);
  const placementRef = useRef(placement);
  const modeRef = useRef(mode);
  const gestureRef = useRef<Gesture | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const settleTimerRef = useRef(0);
  const photoRectRef = useRef<PhotoDisplayRect | null>(null);
  const [photoRect, setPhotoRect] = useState<PhotoDisplayRect | null>(null);
  const [settling, setSettling] = useState(false);
  const [liveMessage, setLiveMessage] = useState('');
  const sawReadyPhotoRef = useRef(false);

  placementRef.current = placement;
  modeRef.current = mode;
  photoRectRef.current = photoRect;

  const artworkUrl = resolveFrontDisplayUrl(product, orientation);
  const panelAspect = panelAspectFromDimension(optionDimension, orientation);
  const sizeCaption = formatSizeCaption(optionName, optionDimension, orientation);
  const photoReady = photo != null;

  const clearGesture = useCallback(() => {
    pointersRef.current.clear();
    gestureRef.current = null;
  }, []);

  const announce = useCallback((message: string) => {
    setLiveMessage('');
    window.requestAnimationFrame(() => setLiveMessage(message));
  }, []);

  const startEditing = useCallback(() => {
    if (modeRef.current === 'editing') return;
    setMode('editing');
    announce('작품 위치와 크기를 조절할 수 있습니다.');
  }, [announce, setMode]);

  const lockArtwork = useCallback(() => {
    clearGesture();
    if (modeRef.current !== 'editing') return;
    setMode('locked');
    announce('작품 위치를 고정했습니다.');
    if (reducedMotion) {
      setSettling(false);
      return;
    }
    setSettling(true);
    window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => {
      setSettling(false);
    }, ARTWORK_LOCK_SETTLE_MS);
  }, [announce, clearGesture, reducedMotion, setMode]);

  const applyPlacement = useCallback(
    (next: ArtworkPlacement) => {
      if (!photoRect) {
        setPlacement(next);
        return;
      }
      setPlacement(clampPlacement(next, photoRect, panelAspect));
    },
    [panelAspect, photoRect, setPlacement],
  );

  const closeOverlay = useCallback(() => {
    clearGesture();
    unlockDocumentScroll(lockedScrollYRef.current);
    lockedScrollYRef.current = null;
    onClose();
    window.setTimeout(() => {
      const entry = returnFocusRef.current ?? document.getElementById('pdp-room-preview-entry');
      entry?.focus({ preventScroll: true });
    }, 50);
  }, [clearGesture, onClose, returnFocusRef]);

  useEffect(() => {
    lockedScrollYRef.current = lockDocumentScroll();
    const frame = requestAnimationFrame(() => {
      (emptyCtaRef.current ?? closeRef.current)?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settleTimerRef.current);
      clearGesture();
      reset();
      unlockDocumentScroll(lockedScrollYRef.current);
      lockedScrollYRef.current = null;
    };
    // Lock, initial focus, and URL revoke run once per overlay mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const nudgePlacement = (dx: number, dy: number, scaleMul: number | null) => {
      const rect = photoRectRef.current;
      const current = placementRef.current;
      if (!rect) return;
      applyPlacement({
        cx: current.cx + dx / rect.width,
        cy: current.cy + dy / rect.height,
        longFrac: scaleMul == null ? current.longFrac : current.longFrac * scaleMul,
      });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (gestureRef.current) {
          clearGesture();
          if (modeRef.current === 'editing') lockArtwork();
          return;
        }
        if (modeRef.current === 'editing') {
          lockArtwork();
          return;
        }
        closeOverlay();
        return;
      }

      if (modeRef.current === 'editing' && photoRectRef.current) {
        const nudge = event.shiftKey ? ARTWORK_NUDGE_LARGE_PX : ARTWORK_NUDGE_PX;
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          nudgePlacement(-nudge, 0, null);
          return;
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          nudgePlacement(nudge, 0, null);
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          nudgePlacement(0, -nudge, null);
          return;
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          nudgePlacement(0, nudge, null);
          return;
        }
        if (event.key === '+' || event.key === '=') {
          event.preventDefault();
          nudgePlacement(0, 0, 1 + ARTWORK_SCALE_STEP);
          return;
        }
        if (event.key === '-' || event.key === '_') {
          event.preventDefault();
          nudgePlacement(0, 0, 1 - ARTWORK_SCALE_STEP);
          return;
        }
      }

      if (event.key !== 'Tab') return;
      const root = overlayRef.current;
      if (!root) return;
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(isFocusable);
      if (focusables.length === 0) {
        event.preventDefault();
        closeRef.current?.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !root.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [applyPlacement, clearGesture, closeOverlay, lockArtwork]);

  const updatePhotoRect = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || !photo) {
      setPhotoRect(null);
      return;
    }
    setPhotoRect(
      fitPhotoRect(viewport.clientWidth, viewport.clientHeight, photo.width, photo.height),
    );
  }, [photo]);

  useEffect(() => {
    if (!photoReady) {
      setPhotoRect(null);
      return;
    }
    const viewport = viewportRef.current;
    if (!viewport) return;
    updatePhotoRect();
    const observer = new ResizeObserver(() => updatePhotoRect());
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [photoReady, photo?.url, photo?.width, photo?.height, updatePhotoRect]);

  useEffect(() => {
    if (!photoRect) return;
    setPlacement((current) => {
      const next = clampPlacement(current, photoRect, panelAspect);
      if (next.cx === current.cx && next.cy === current.cy && next.longFrac === current.longFrac) {
        return current;
      }
      return next;
    });
  }, [panelAspect, photoRect, setPlacement]);

  const artSize =
    photoRect == null ? null : artworkPixelSize(photoRect, placement.longFrac, panelAspect);

  const endPointer = useCallback(
    (pointerId: number, reason: 'up' | 'cancel') => {
      pointersRef.current.delete(pointerId);
      const gesture = gestureRef.current;
      if (!gesture) return;
      if (gesture.kind === 'pending' && gesture.pointerId === pointerId) {
        gestureRef.current = null;
        if (reason === 'up' && gesture.fromLocked) {
          startEditing();
          artworkRef.current?.focus();
        }
        return;
      }
      if (
        (gesture.kind === 'move' || gesture.kind === 'resize') &&
        gesture.pointerId === pointerId
      ) {
        gestureRef.current = null;
        return;
      }
      if (gesture.kind === 'pinch' && (gesture.a === pointerId || gesture.b === pointerId)) {
        const remaining = [...pointersRef.current.keys()];
        gestureRef.current = remaining.length === 1
          ? {
              kind: 'move',
              pointerId: remaining[0],
              startX: pointersRef.current.get(remaining[0])?.x ?? 0,
              startY: pointersRef.current.get(remaining[0])?.y ?? 0,
              start: placementRef.current,
            }
          : null;
      }
    },
    [startEditing],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      const tracked = pointersRef.current.get(event.pointerId);
      if (tracked) {
        tracked.x = event.clientX;
        tracked.y = event.clientY;
      }
      if (!photoRect || !artSize) return;
      const gesture = gestureRef.current;
      if (!gesture) return;

      if (gesture.kind === 'pending' && gesture.pointerId === event.pointerId) {
        const dist = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
        if (dist < ARTWORK_MOVE_THRESHOLD_PX) return;
        if (gesture.fromLocked) {
          startEditing();
        }
        gestureRef.current = {
          kind: 'move',
          pointerId: gesture.pointerId,
          startX: gesture.startX,
          startY: gesture.startY,
          start: gesture.start,
        };
      }

      const active = gestureRef.current;
      if (!active) return;

      if (active.kind === 'move' && active.pointerId === event.pointerId) {
        event.preventDefault();
        applyPlacement({
          cx: active.start.cx + (event.clientX - active.startX) / photoRect.width,
          cy: active.start.cy + (event.clientY - active.startY) / photoRect.height,
          longFrac: active.start.longFrac,
        });
        return;
      }

      if (active.kind === 'resize' && active.pointerId === event.pointerId) {
        event.preventDefault();
        if (active.startDist < 1) return;
        const origin = photoClientOrigin(photoRectElRef.current, viewportRef.current, photoRect);
        const currDist = Math.hypot(
          event.clientX - (origin.left + active.nwX),
          event.clientY - (origin.top + active.nwY),
        );
        const ratio = currDist / active.startDist;
        const nextLong = clampLongFrac(active.start.longFrac * ratio, photoRect, panelAspect);
        const nextSize = artworkPixelSize(photoRect, nextLong, panelAspect);
        applyPlacement({
          cx: (active.nwX + nextSize.width / 2) / photoRect.width,
          cy: (active.nwY + nextSize.height / 2) / photoRect.height,
          longFrac: nextLong,
        });
        return;
      }

      if (active.kind === 'pinch') {
        event.preventDefault();
        const a = pointersRef.current.get(active.a);
        const b = pointersRef.current.get(active.b);
        if (!a || !b || active.startDist < 1) return;
        const ratio = pointerDistance(a, b) / active.startDist;
        applyPlacement({
          ...active.start,
          longFrac: clampLongFrac(active.start.longFrac * ratio, photoRect, panelAspect),
        });
      }
    },
    [applyPlacement, artSize, panelAspect, photoRect, startEditing],
  );

  const onPointerUp = useCallback(
    (event: PointerEvent) => {
      endPointer(event.pointerId, 'up');
    },
    [endPointer],
  );

  const onPointerCancel = useCallback(
    (event: PointerEvent) => {
      endPointer(event.pointerId, 'cancel');
    },
    [endPointer],
  );

  useEffect(() => {
    const onTouchMove = (event: TouchEvent) => {
      if (gestureRef.current) event.preventDefault();
    };
    const onTouchCancel = () => {
      clearGesture();
    };
    const preventGesture = (event: Event) => event.preventDefault();
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchcancel', onTouchCancel);
    const overlay = overlayRef.current;
    overlay?.addEventListener('gesturestart', preventGesture);
    overlay?.addEventListener('gesturechange', preventGesture);
    overlay?.addEventListener('gestureend', preventGesture);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchcancel', onTouchCancel);
      overlay?.removeEventListener('gesturestart', preventGesture);
      overlay?.removeEventListener('gesturechange', preventGesture);
      overlay?.removeEventListener('gestureend', preventGesture);
    };
  }, [clearGesture, onPointerCancel, onPointerMove, onPointerUp]);

  useEffect(() => {
    clearGesture();
    setSettling(false);
  }, [clearGesture, photo?.url]);

  useEffect(() => {
    if (!photo?.url) {
      sawReadyPhotoRef.current = false;
      return;
    }
    announce('방 사진을 적용했습니다.');
    if (sawReadyPhotoRef.current) return;
    sawReadyPhotoRef.current = true;
    const frame = requestAnimationFrame(() => {
      artworkRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [announce, photo?.url]);

  const beginArtworkPointer = (event: React.PointerEvent, fromHandle: boolean) => {
    if (!photoRect || !artSize) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* capture optional */
    }
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const current = placementRef.current;
    const editing = modeRef.current === 'editing';

    if (fromHandle) {
      if (!editing) startEditing();
      const { width, height } = artworkPixelSize(photoRect, current.longFrac, panelAspect);
      const nwX = current.cx * photoRect.width - width / 2;
      const nwY = current.cy * photoRect.height - height / 2;
      const origin = photoClientOrigin(photoRectElRef.current, viewportRef.current, photoRect);
      gestureRef.current = {
        kind: 'resize',
        pointerId: event.pointerId,
        nwX,
        nwY,
        startDist: Math.max(
          1,
          Math.hypot(event.clientX - (origin.left + nwX), event.clientY - (origin.top + nwY)),
        ),
        start: current,
      };
      return;
    }

    if (pointersRef.current.size >= 2) {
      const ids = [...pointersRef.current.keys()];
      const a = pointersRef.current.get(ids[0]);
      const b = pointersRef.current.get(ids[1]);
      if (a && b) {
        if (!editing) startEditing();
        gestureRef.current = {
          kind: 'pinch',
          a: ids[0],
          b: ids[1],
          startDist: Math.max(1, pointerDistance(a, b)),
          start: current,
        };
      }
      return;
    }

    gestureRef.current = {
      kind: 'pending',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      start: current,
      fromLocked: !editing,
    };
  };

  const onArtworkKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (modeRef.current === 'locked') startEditing();
    }
  };

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    clearGesture();
    void ingestFile(file);
  };

  const openPicker = () => {
    fileInputRef.current?.click();
  };

  const editing = mode === 'editing';
  const artLeft = photoRect && artSize ? placement.cx * photoRect.width - artSize.width / 2 : 0;
  const artTop = photoRect && artSize ? placement.cy * photoRect.height - artSize.height / 2 : 0;
  const checkPos =
    photoRect && artSize
      ? clampChromeInViewport(artLeft, artTop, artSize.width, artSize.height, photoRect, 'ne')
      : { left: 0, top: 0 };
  const handlePos =
    photoRect && artSize
      ? clampChromeInViewport(artLeft, artTop, artSize.width, artSize.height, photoRect, 'se')
      : { left: 0, top: 0 };
  const chromePos =
    photoRect && artSize
      ? separateOverlappingChrome(checkPos, handlePos, artLeft, artTop, photoRect)
      : { check: checkPos, handle: handlePos };

  const handleResetPlacement = () => {
    clearGesture();
    resetPlacement();
    announce('작품 위치와 크기를 처음 상태로 되돌렸습니다.');
  };

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-room-preview="true"
      data-room-preview-phase={phase}
      className={cn(
        'fixed inset-0 flex flex-col overflow-hidden bg-canvas text-text-primary overscroll-none',
        zClass('dialog'),
      )}
    >
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </div>
      <header
        className={cn(
          'relative z-10 flex shrink-0 items-center justify-between gap-3 border-b border-border-subtle pb-2 pt-safe',
          SAFE_INLINE,
        )}
      >
        <h2 id={titleId} className="type-section-title text-text-primary">
          내 공간에 걸어보기
        </h2>
        <IconButton ref={closeRef} aria-label="미리보기 닫기" onClick={closeOverlay}>
          <X size={18} strokeWidth={1.5} />
        </IconButton>
      </header>

      <input
        ref={fileInputRef}
        id={fileInputId}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-label="사진 촬영 또는 앨범에서 선택"
        onChange={onFileChange}
      />

      {photoReady && photo ? (
        <div className="flex min-h-0 flex-1 flex-col bg-canvas">
          <div
            ref={viewportRef}
            className="relative min-h-0 flex-1 overflow-hidden touch-none"
            onPointerDown={(event) => {
              if (event.target !== event.currentTarget && !(event.target instanceof HTMLImageElement)) {
                return;
              }
              if (modeRef.current === 'editing') {
                lockArtwork();
              }
            }}
          >
            {photoRect ? (
              <div
                ref={photoRectElRef}
                className="absolute overflow-visible"
                data-room-photo-rect="true"
                data-room-photo-fit="contain"
                data-room-photo-width={photo.width}
                data-room-photo-height={photo.height}
                data-room-photo-source-width={photo.sourceWidth}
                data-room-photo-source-height={photo.sourceHeight}
                data-room-photo-display-width={Math.round(photoRect.width)}
                data-room-photo-display-height={Math.round(photoRect.height)}
                style={{
                  width: photoRect.width,
                  height: photoRect.height,
                  left: photoRect.left,
                  top: photoRect.top,
                }}
                onPointerDown={(event) => {
                  if (event.target === event.currentTarget || event.target instanceof HTMLImageElement) {
                    if (modeRef.current === 'editing') {
                      event.preventDefault();
                      lockArtwork();
                    }
                  }
                }}
              >
                <img
                  src={photo.url}
                  alt="선택한 방 사진"
                  draggable={false}
                  className="pointer-events-none block h-full w-full select-none object-contain"
                />
                {artworkUrl && artSize ? (
                  <div
                    className="absolute border-0"
                    data-room-artwork="true"
                    data-room-artwork-mode={mode}
                    data-room-artwork-min-short={ARTWORK_MIN_SHORT_FRACTION}
                    style={{
                      width: artSize.width,
                      height: artSize.height,
                      left: artLeft,
                      top: artTop,
                      aspectRatio: String(panelAspect),
                    }}
                  >
                    <div
                      ref={artworkRef}
                      role="button"
                      tabIndex={0}
                      aria-label="작품 위치와 크기 조절"
                      aria-pressed={editing || undefined}
                      className={cn(
                        'focus-ring absolute left-1/2 top-1/2 z-[1] touch-none select-none border-0',
                        editing ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
                      )}
                      style={{
                        width: Math.max(artSize.width, ARTWORK_MIN_HIT_PX),
                        height: Math.max(artSize.height, ARTWORK_MIN_HIT_PX),
                        transform: 'translate(-50%, -50%)',
                      }}
                      onPointerDown={(event) => beginArtworkPointer(event, false)}
                      onKeyDown={onArtworkKeyDown}
                    >
                      <div
                        className="absolute left-1/2 top-1/2 border-0"
                        data-room-artwork-visual="true"
                        style={{
                          width: artSize.width,
                          height: artSize.height,
                          transform: 'translate(-50%, -50%)',
                          boxShadow: editing ? EDITING_SHADOW : LOCKED_SHADOW,
                          transition:
                            reducedMotion || editing
                              ? 'none'
                              : settling
                                ? `box-shadow ${ARTWORK_LOCK_SETTLE_MS}ms ease`
                                : 'none',
                        }}
                      >
                        <img
                          src={artworkUrl}
                          alt=""
                          draggable={false}
                          className="pointer-events-none block h-full w-full border-0 select-none object-cover"
                        />
                      </div>
                    </div>
                    {editing ? (
                      <>
                        <button
                          type="button"
                          aria-label="위치 조절 완료"
                          className="focus-ring absolute z-10 inline-flex size-11 items-center justify-center rounded-full border border-border-subtle bg-canvas text-text-primary shadow-[0_2px_10px_rgba(0,0,0,0.2)]"
                          style={{ left: chromePos.check.left, top: chromePos.check.top }}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            lockArtwork();
                          }}
                        >
                          <Check size={16} strokeWidth={2} aria-hidden />
                        </button>
                        <button
                          type="button"
                          aria-label="크기 조절"
                          className="focus-ring absolute z-10 inline-flex size-11 cursor-nwse-resize items-center justify-center touch-none"
                          style={{ left: chromePos.handle.left, top: chromePos.handle.top }}
                          onPointerDown={(event) => beginArtworkPointer(event, true)}
                        >
                          <span
                            aria-hidden
                            className="size-3.5 rounded-[2px] border-2 border-text-primary bg-canvas"
                          />
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div
            className={cn(
              'shrink-0 space-y-3 border-t border-border-subtle bg-canvas pt-3 pb-[max(1.5rem,calc(0.75rem+env(safe-area-inset-bottom)))]',
              SAFE_INLINE,
            )}
          >
            <p className="text-center type-metadata text-text-secondary">{sizeCaption}</p>
            <p className="text-center type-supporting text-text-tertiary">
              실제 제품 크기를 참고해 사진 속 크기와 위치를 조정해보세요.
            </p>
            <div className="flex flex-col items-center gap-1">
              {error ? (
                <p className="text-center type-supporting text-error" role="alert">
                  {error}
                </p>
              ) : null}
              <button
                type="button"
                aria-label="위치 초기화"
                className="focus-ring inline-flex min-h-11 items-center justify-center px-4 type-metadata text-text-secondary hover:text-text-primary"
                onClick={handleResetPlacement}
              >
                위치 초기화
              </button>
              <button
                type="button"
                aria-label="사진 바꾸기"
                className="focus-ring inline-flex min-h-11 items-center justify-center px-4 type-metadata text-text-secondary hover:text-text-primary"
                onClick={openPicker}
                disabled={phase === 'decoding'}
                aria-busy={phase === 'decoding' || undefined}
              >
                {phase === 'decoding' ? '사진을 준비하는 중...' : '사진 바꾸기'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto bg-canvas pb-safe',
            'px-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))]',
          )}
        >
          <div className="mx-auto w-full max-w-md space-y-5 text-center">
            <p className="type-body text-text-secondary">
              방 사진을 선택하면 작품을 공간에 미리 배치해볼 수 있습니다.
            </p>
            <Button
              ref={emptyCtaRef}
              fullWidth
              onClick={openPicker}
              disabled={phase === 'decoding'}
              loading={phase === 'decoding'}
            >
              {phase === 'decoding' ? '사진을 준비하는 중...' : '사진 촬영 또는 앨범에서 선택'}
            </Button>
            {error ? (
              <p className="type-supporting text-error" role="alert">
                {error}
              </p>
            ) : null}
            <p className="type-metadata text-text-tertiary">
              사진은 이 기기에서만 미리보기에 사용되며 서버에 저장되지 않습니다.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
