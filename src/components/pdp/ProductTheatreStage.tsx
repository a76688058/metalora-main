import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Image as ImageIcon, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { getFullImageUrl } from '../../lib/utils';
import type { Product } from '../../data/products';
import { cn } from '../../lib/cn';
import { zClass } from '../../constants/overlays';
import { IconButton } from '../ui/IconButton';
import { PdpSpatialCanvas } from './PdpSpatialCanvas';
import { usePdpQualityTier } from './usePdpQualityTier';

const CROSSFADE_MS = 220;
const HINT_VISIBLE_MS = 1800;
const HINT_FADE_MS = 400;
const A4_SHORT_MM = 210;
const A4_LONG_MM = 297;
const KEYBOARD_YAW_STEP = Math.PI / 36;
const KEYBOARD_PITCH_STEP = Math.PI / 48;
const POINTER_RAD_PER_PX = 0.005;
const COMPACT_QUERY = '(max-width: 1099px)';
const ZOOM_DEFAULT = 1;
const ZOOM_MIN = 0.8;
const ZOOM_MAX = 1.2;
const ZOOM_STEP = 0.1;
const ZOOM_HOLD_DELAY_MS = 250;
const ZOOM_HOLD_RATE = 0.18;
const ZOOM_TAU = 0.35;
const ZOOM_EPS = 0.0004;
const VIEWER_FIT_HEIGHT = 0.7;
const POINTER_MOVE_THRESHOLD_PX = 3;
const CANVAS_FILL_SCALE = 1;

const MEDIA_PILL_CLASS =
  'focus-ring inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-zinc-950/15 bg-white text-zinc-950 shadow-[0_2px_14px_rgba(0,0,0,0.22)] type-metadata hover:bg-zinc-100 hover:shadow-[0_3px_16px_rgba(0,0,0,0.26)] active:bg-zinc-200 active:scale-[0.98]';

interface ProductTheatreStageProps {
  product: Product;
  orientation: 'portrait' | 'landscape';
  optionDimension?: string;
  onOpenRoomPreview?: () => void;
  roomPreviewEntryRef?: React.RefObject<HTMLButtonElement | null>;
  onViewerOpenChange?: (open: boolean) => void;
  /** Custom Workshop only. Catalog omits this and keeps the idle 2D theatre. */
  startInViewer?: boolean;
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

function resolveFront3dUrl(product: Product, orientation: 'portrait' | 'landscape'): string | null {
  const raw =
    orientation === 'landscape' ? product.landscape_image : product.front_image || product.image;
  const url = getFullImageUrl(raw);
  return isRealAssetUrl(url) ? url : null;
}

function resolveBackUrl(product: Product, orientation: 'portrait' | 'landscape'): string | null {
  const raw =
    orientation === 'landscape'
      ? product.landscape_back_image
      : product.back_image || product.backImage;
  const url = getFullImageUrl(raw);
  return isRealAssetUrl(url) ? url : null;
}

/** Parse option millimetres. Unparseable → A4 210 × 297. */
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

/** A4 short side = 210mm → scale 1. Unparseable dimensions stay 1. */
function panelScaleFromDimension(dimension: string | undefined): number {
  return panelMillimetresFromDimension(dimension).shortMm / A4_SHORT_MM;
}

/** Face width / height for the selected option + orientation. */
function panelAspectFromDimension(
  dimension: string | undefined,
  orientation: 'portrait' | 'landscape',
): number {
  const { shortMm, longMm } = panelMillimetresFromDimension(dimension);
  return orientation === 'landscape' ? longMm / shortMm : shortMm / longMm;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
}

function pointerDistance(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function useCompactTheatre(): boolean {
  const [compact, setCompact] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(COMPACT_QUERY).matches : false,
  );

  useEffect(() => {
    const media = window.matchMedia(COMPACT_QUERY);
    const onChange = () => setCompact(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return compact;
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

export function ProductTheatreStage({
  product,
  orientation,
  optionDimension,
  onOpenRoomPreview,
  roomPreviewEntryRef,
  onViewerOpenChange,
  startInViewer = false,
}: ProductTheatreStageProps) {
  const quality = usePdpQualityTier();
  const compact = useCompactTheatre();
  const displayUrl = resolveFrontDisplayUrl(product, orientation);
  const front3dUrl = resolveFront3dUrl(product, orientation);
  const backUrl = resolveBackUrl(product, orientation);
  const productScale = panelScaleFromDimension(optionDimension);
  const panelAspect = panelAspectFromDimension(optionDimension, orientation);
  const canUse3d = quality.recommendMount && Boolean(front3dUrl);

  const canvasKey = `${front3dUrl ?? ''}|${backUrl ?? ''}|${orientation}|${productScale}`;

  const [imageFailed, setImageFailed] = useState(false);
  const [readyForKey, setReadyForKey] = useState<string | null>(null);
  const [failedForKey, setFailedForKey] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(startInViewer);
  const [pose, setPose] = useState({ rotationX: 0, rotationY: 0 });
  const [dragging, setDragging] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);
  const [zoomCurrent, setZoomCurrent] = useState(ZOOM_DEFAULT);
  const [zoomTarget, setZoomTargetState] = useState(ZOOM_DEFAULT);
  const [mediaEpoch, setMediaEpoch] = useState(canvasKey);

  const zoomTargetRef = useRef(ZOOM_DEFAULT);
  const zoomCurrentRef = useRef(ZOOM_DEFAULT);
  const zoomRafRef = useRef(0);
  const zoomLastTsRef = useRef(0);
  const holdDelayRef = useRef(0);
  const holdRafRef = useRef(0);
  const holdDirRef = useRef<0 | 1 | -1>(0);
  const holdActiveRef = useRef(false);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const poseRef = useRef(pose);
  poseRef.current = pose;
  const rotateRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    rotationX: number;
    rotationY: number;
    armed: boolean;
  } | null>(null);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const lockedScrollYRef = useRef<number | null>(null);

  const viewerHostRef = useRef<HTMLDivElement>(null);
  const threeActiveRef = useRef(false);

  const stopZoomRaf = useCallback(() => {
    if (zoomRafRef.current) {
      cancelAnimationFrame(zoomRafRef.current);
      zoomRafRef.current = 0;
    }
  }, []);

  const startZoomSettle = useCallback(() => {
    if (zoomRafRef.current) return;
    zoomLastTsRef.current = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - zoomLastTsRef.current) / 1000);
      zoomLastTsRef.current = now;
      const target = zoomTargetRef.current;
      const current = zoomCurrentRef.current;
      const next = current + (target - current) * (1 - Math.exp(-dt / ZOOM_TAU));
      const settled = Math.abs(target - next) < ZOOM_EPS;
      const applied = settled ? target : next;
      zoomCurrentRef.current = applied;
      setZoomCurrent(applied);
      if (settled) {
        zoomRafRef.current = 0;
        return;
      }
      zoomRafRef.current = requestAnimationFrame(tick);
    };
    zoomRafRef.current = requestAnimationFrame(tick);
  }, []);

  const setZoomTarget = useCallback(
    (next: number) => {
      const clamped = clampZoom(next);
      zoomTargetRef.current = clamped;
      setZoomTargetState(clamped);
      startZoomSettle();
    },
    [startZoomSettle],
  );

  const snapZoom = useCallback(
    (value: number) => {
      const clamped = clampZoom(value);
      stopZoomRaf();
      zoomTargetRef.current = clamped;
      zoomCurrentRef.current = clamped;
      setZoomTargetState(clamped);
      setZoomCurrent(clamped);
    },
    [stopZoomRaf],
  );

  const stopZoomHold = useCallback(() => {
    if (holdDelayRef.current) {
      window.clearTimeout(holdDelayRef.current);
      holdDelayRef.current = 0;
    }
    if (holdRafRef.current) {
      cancelAnimationFrame(holdRafRef.current);
      holdRafRef.current = 0;
    }
    holdDirRef.current = 0;
    holdActiveRef.current = false;
  }, []);

  const beginZoomHold = useCallback(
    (direction: 1 | -1) => {
      stopZoomHold();
      holdDirRef.current = direction;
      holdActiveRef.current = false;
      holdDelayRef.current = window.setTimeout(() => {
        holdActiveRef.current = true;
        holdDelayRef.current = 0;
        let last = performance.now();
        const tick = (now: number) => {
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          setZoomTarget(zoomTargetRef.current + direction * ZOOM_HOLD_RATE * dt);
          holdRafRef.current = requestAnimationFrame(tick);
        };
        holdRafRef.current = requestAnimationFrame(tick);
      }, ZOOM_HOLD_DELAY_MS);
    },
    [setZoomTarget, stopZoomHold],
  );

  const endZoomHold = useCallback(() => {
    const direction = holdDirRef.current;
    const wasHold = holdActiveRef.current;
    stopZoomHold();
    if (!wasHold && direction) {
      setZoomTarget(zoomTargetRef.current + direction * ZOOM_STEP);
    }
  }, [setZoomTarget, stopZoomHold]);

  if (mediaEpoch !== canvasKey) {
    setMediaEpoch(canvasKey);
    setReadyForKey(null);
    setFailedForKey(null);
    setViewerOpen(false);
    setDragging(false);
    setHintVisible(false);
    setPose({ rotationX: 0, rotationY: 0 });
    setImageFailed(false);
    zoomTargetRef.current = ZOOM_DEFAULT;
    zoomCurrentRef.current = ZOOM_DEFAULT;
    setZoomTargetState(ZOOM_DEFAULT);
    setZoomCurrent(ZOOM_DEFAULT);
    rotateRef.current = null;
    pinchRef.current = null;
    pointersRef.current.clear();
  }

  const failed = failedForKey === canvasKey;
  const mountCanvas = viewerOpen && canUse3d && !failed && Boolean(front3dUrl);
  const threeReady = mountCanvas && readyForKey === canvasKey;
  const threeActive = viewerOpen && threeReady;
  const showTwoD = Boolean(displayUrl) && !imageFailed;
  const twoDOpacity = viewerOpen ? 0 : 1;
  const zoomPercent = Math.round(zoomTarget * 100);
  threeActiveRef.current = threeActive;

  const resetPose = useCallback(() => {
    setPose({ rotationX: 0, rotationY: 0 });
  }, []);

  const resetInspect = useCallback(() => {
    resetPose();
    setZoomTarget(ZOOM_DEFAULT);
  }, [resetPose, setZoomTarget]);

  const unlockIfNeeded = useCallback(() => {
    if (lockedScrollYRef.current == null && document.body.style.position !== 'fixed') return;
    unlockDocumentScroll(lockedScrollYRef.current);
    lockedScrollYRef.current = null;
  }, []);

  const closeViewer = useCallback(() => {
    stopZoomHold();
    setViewerOpen(false);
    setDragging(false);
    setHintVisible(false);
    setReadyForKey(null);
    rotateRef.current = null;
    pinchRef.current = null;
    pointersRef.current.clear();
    resetPose();
    snapZoom(ZOOM_DEFAULT);
    unlockIfNeeded();
  }, [resetPose, snapZoom, stopZoomHold, unlockIfNeeded]);

  const openViewer = useCallback(() => {
    setReadyForKey(null);
    setDragging(false);
    rotateRef.current = null;
    pinchRef.current = null;
    pointersRef.current.clear();
    resetPose();
    snapZoom(ZOOM_DEFAULT);
    if (lockedScrollYRef.current == null) {
      lockedScrollYRef.current = lockDocumentScroll();
    }
    setViewerOpen(true);
    setHintVisible(compact);
  }, [compact, resetPose, snapZoom]);

  useEffect(() => {
    setImageFailed(false);
  }, [displayUrl]);

  useEffect(() => {
    onViewerOpenChange?.(viewerOpen);
    return () => onViewerOpenChange?.(false);
  }, [viewerOpen, onViewerOpenChange]);

  useEffect(() => {
    if (!viewerOpen) {
      unlockIfNeeded();
      return;
    }
    if (lockedScrollYRef.current == null) {
      lockedScrollYRef.current = lockDocumentScroll();
    }
  }, [viewerOpen, unlockIfNeeded]);

  useEffect(() => {
    if (viewerOpen && failed) closeViewer();
  }, [viewerOpen, failed, closeViewer]);

  useEffect(() => {
    if (!hintVisible) return undefined;
    const hide = window.setTimeout(() => setHintVisible(false), HINT_VISIBLE_MS);
    return () => window.clearTimeout(hide);
  }, [hintVisible]);

  useEffect(() => {
    return () => {
      stopZoomRaf();
      stopZoomHold();
      unlockDocumentScroll(lockedScrollYRef.current);
      lockedScrollYRef.current = null;
    };
  }, [stopZoomHold, stopZoomRaf]);

  useEffect(() => {
    if (!threeActive) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeViewer();
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        const yawDelta = event.key === 'ArrowRight' ? KEYBOARD_YAW_STEP : event.key === 'ArrowLeft' ? -KEYBOARD_YAW_STEP : 0;
        const pitchDelta = event.key === 'ArrowDown' ? KEYBOARD_PITCH_STEP : event.key === 'ArrowUp' ? -KEYBOARD_PITCH_STEP : 0;
        setPose((prev) => ({
          rotationX: prev.rotationX + pitchDelta,
          rotationY: prev.rotationY + yawDelta,
        }));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [threeActive, closeViewer]);

  useEffect(() => {
    if (!viewerOpen) return undefined;
    const host = viewerHostRef.current;
    if (!host) return undefined;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    host.addEventListener('wheel', onWheel, { passive: false });
    return () => host.removeEventListener('wheel', onWheel);
  }, [viewerOpen]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!threeActive) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* inactive pointerId */
    }
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointersRef.current.size >= 2) {
      rotateRef.current = null;
      setDragging(false);
      const pts = [...pointersRef.current.values()];
      pinchRef.current = {
        distance: Math.max(1, pointerDistance(pts[0], pts[1])),
        zoom: zoomTargetRef.current,
      };
      return;
    }

    pinchRef.current = null;
    const start = poseRef.current;
    rotateRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      rotationX: start.rotationX,
      rotationY: start.rotationY,
      armed: false,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const pts = [...pointersRef.current.values()];
      const distance = Math.max(1, pointerDistance(pts[0], pts[1]));
      setZoomTarget(pinchRef.current.zoom * (distance / pinchRef.current.distance));
      return;
    }

    const rotate = rotateRef.current;
    if (!rotate || rotate.pointerId !== event.pointerId || pointersRef.current.size !== 1) return;
    const dx = event.clientX - rotate.x;
    const dy = event.clientY - rotate.y;
    if (!rotate.armed) {
      if (Math.hypot(dx, dy) < POINTER_MOVE_THRESHOLD_PX) return;
      rotate.armed = true;
      setDragging(true);
    }
    setPose({
      rotationX: rotate.rotationX + dy * POINTER_RAD_PER_PX,
      rotationY: rotate.rotationY + dx * POINTER_RAD_PER_PX,
    });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
    }
    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }
    if (rotateRef.current?.pointerId === event.pointerId || pointersRef.current.size !== 1) {
      rotateRef.current = null;
      setDragging(false);
    }
  };

  const panelStyle = viewerOpen
    ? {
        aspectRatio: String(panelAspect),
        width: `min(100cqw, calc(${VIEWER_FIT_HEIGHT} * 100cqh * ${panelAspect}))`,
        height: `min(calc(${VIEWER_FIT_HEIGHT} * 100cqh), calc(100cqw / ${panelAspect}))`,
        transform: `scale(${zoomCurrent})`,
        transformOrigin: 'center center',
      }
    : {
        aspectRatio: String(panelAspect),
        width: `min(100%, calc(100cqh * ${panelAspect}))`,
        height: `min(100%, calc(100cqw / ${panelAspect}))`,
      };

  return (
    <div className="relative h-full min-h-[70svh] w-full min-[1100px]:min-h-0">
      <div
        ref={viewerHostRef}
        className={cn(
          'bg-canvas',
          viewerOpen ? cn('fixed inset-0 overflow-visible overscroll-none', zClass('dialog')) : 'absolute inset-0 overflow-hidden',
        )}
      >
        <div
          className={cn(
            'absolute inset-0 z-[1] flex items-center justify-center [container-type:size]',
            viewerOpen ? 'overflow-visible px-4' : 'overflow-hidden p-8 pb-16 min-[1100px]:p-12 min-[1100px]:pb-16',
          )}
        >
          <div data-pdp-panel="true" className="relative" style={panelStyle}>
            {mountCanvas && front3dUrl ? (
              <PdpSpatialCanvas
                key={canvasKey}
                className={cn(
                  'absolute inset-0 h-full w-full',
                  threeReady ? 'opacity-100' : 'opacity-0',
                )}
                frontTextureUrl={front3dUrl}
                backTextureUrl={backUrl}
                orientation={orientation}
                scale={CANVAS_FILL_SCALE}
                rotationX={pose.rotationX}
                rotationY={pose.rotationY}
                inspectRotationMode="continuous"
                flipProgress={0}
                onReady={() => setReadyForKey(canvasKey)}
                onFailed={() => {
                  setFailedForKey(canvasKey);
                  closeViewer();
                }}
              />
            ) : null}

            {showTwoD ? (
              <img
                src={displayUrl}
                alt={product.title}
                fetchPriority="high"
                decoding="async"
                draggable={false}
                onError={() => setImageFailed(true)}
                className="pointer-events-none absolute inset-0 z-[2] h-full w-full bg-canvas object-cover"
                style={{
                  opacity: twoDOpacity,
                  transition: viewerOpen ? 'none' : `opacity ${CROSSFADE_MS}ms ease`,
                }}
              />
            ) : null}

            {!viewerOpen && (onOpenRoomPreview || canUse3d) ? (
              <div
                className="absolute right-3 bottom-3 z-[4] flex max-w-[calc(100%-1.5rem)] flex-wrap items-center justify-end gap-1.5"
                data-pdp-media-cluster="true"
              >
                {onOpenRoomPreview ? (
                  <button
                    ref={roomPreviewEntryRef}
                    id="pdp-room-preview-entry"
                    type="button"
                    aria-haspopup="dialog"
                    aria-label="내 공간에 걸어보기"
                    className={cn(MEDIA_PILL_CLASS, compact ? 'px-3' : 'px-3.5')}
                    onClick={onOpenRoomPreview}
                  >
                    <ImageIcon size={14} strokeWidth={1.7} aria-hidden />
                    {compact ? '내 공간' : '내 공간에 걸어보기'}
                  </button>
                ) : null}
                {canUse3d ? (
                  <button
                    type="button"
                    aria-label="3D로 보기"
                    className={cn(MEDIA_PILL_CLASS, compact ? 'px-3' : 'px-3.5')}
                    onClick={openViewer}
                  >
                    <Box size={14} strokeWidth={1.7} aria-hidden />
                    {compact ? '3D 보기' : '3D로 보기'}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {threeActive ? (
          <div
            className={cn(
              'absolute inset-0 z-[3] touch-none',
              dragging ? 'cursor-grabbing' : 'cursor-grab',
            )}
            data-pdp-yaw={pose.rotationY}
            data-pdp-pitch={pose.rotationX}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            aria-hidden="true"
          />
        ) : null}

        {viewerOpen ? (
          <div className="absolute top-4 right-4 z-[4] pt-safe">
            <IconButton
              aria-label="3D 보기 닫기"
              className="text-zinc-50 hover:bg-white/10 hover:text-white"
              onClick={closeViewer}
            >
              <X size={18} strokeWidth={1.5} />
            </IconButton>
          </div>
        ) : null}

        {viewerOpen && threeActive ? (
          <div className="absolute bottom-6 left-1/2 z-[4] flex -translate-x-1/2 items-center gap-3 pb-safe">
            <button
              type="button"
              className="focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/20 bg-zinc-950/80 px-3.5 text-zinc-50 type-metadata hover:bg-zinc-950/90 hover:text-white"
              onClick={resetInspect}
            >
              <RotateCcw size={14} strokeWidth={1.6} aria-hidden />
              리셋
            </button>
            <div
              className="flex items-stretch overflow-hidden rounded-full border border-white/20 bg-zinc-950/80 text-zinc-50"
              role="group"
              aria-label="확대"
            >
              <button
                type="button"
                aria-label="축소"
                className="focus-ring inline-flex min-h-11 min-w-11 items-center justify-center text-white/80 hover:text-white"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  try {
                    event.currentTarget.setPointerCapture(event.pointerId);
                  } catch {
                    /* inactive pointerId */
                  }
                  beginZoomHold(-1);
                }}
                onPointerUp={endZoomHold}
                onPointerCancel={endZoomHold}
              >
                <Minus size={16} strokeWidth={1.6} />
              </button>
              <span
                data-pdp-zoom-percent={zoomPercent}
                className="inline-flex min-w-[3.25rem] items-center justify-center type-metadata tabular-nums"
              >
                {zoomPercent}%
              </span>
              <button
                type="button"
                aria-label="확대"
                className="focus-ring inline-flex min-h-11 min-w-11 items-center justify-center text-white/80 hover:text-white"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  try {
                    event.currentTarget.setPointerCapture(event.pointerId);
                  } catch {
                    /* inactive pointerId */
                  }
                  beginZoomHold(1);
                }}
                onPointerUp={endZoomHold}
                onPointerCancel={endZoomHold}
              >
                <Plus size={16} strokeWidth={1.6} />
              </button>
            </div>
          </div>
        ) : null}

        {viewerOpen && compact ? (
          <p
            className="pointer-events-none absolute inset-x-4 top-[18%] z-[4] text-center type-metadata text-zinc-200"
            style={{
              opacity: hintVisible ? 1 : 0,
              transition: `opacity ${HINT_FADE_MS}ms ease`,
            }}
          >
            드래그해서 작품을 살펴보세요
          </p>
        ) : null}
      </div>
    </div>
  );
}
