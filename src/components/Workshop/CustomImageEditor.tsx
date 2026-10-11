import React, { useEffect, useRef } from 'react';
import { MAX_ZOOM, type CustomComposition, type CustomSource } from '../../lib/customComposition/types';
import { frameAspect, imageCssLayout, minZoom, safeAreaInsetFractions } from '../../lib/customComposition/math';

interface CustomImageEditorProps {
  source: CustomSource | null;
  composition: CustomComposition;
  emptyLabel: string;
  onPanByPointer: (dxPx: number, dyPx: number, frameWidth: number, frameHeight: number) => void;
  onZoom: (zoom: number) => void;
  onRequestUpload?: () => void;
  uploadDisabled?: boolean;
}

export function CustomCompositionControls({
  source,
  composition,
  onZoom,
  qualityWarning = false,
}: {
  source: CustomSource | null;
  composition: CustomComposition;
  onZoom: (zoom: number) => void;
  qualityWarning?: boolean;
}) {
  if (!source) return null;
  const sliderMin = minZoom(source, composition.orientation);

  return (
    <div className="flex flex-col gap-2">
      <input
        id="custom-zoom"
        type="range"
        min={sliderMin}
        max={MAX_ZOOM}
        step={0.01}
        value={composition.zoom}
        onChange={(event) => onZoom(Number(event.target.value))}
        className="h-6 w-full accent-[#a89068] dark:accent-[#b7bcc2]"
        aria-label="확대 / 축소"
      />
      <p className="text-[0.75rem] leading-snug text-text-tertiary">
        일부 가장자리는 제작 과정에서 조정될 수 있습니다.
      </p>
      {qualityWarning ? (
        <p className="text-[0.75rem] leading-snug text-text-tertiary">
          과도한 확대 시 원본 이미지에 따라 디테일이 제한될 수 있습니다.
        </p>
      ) : null}
    </div>
  );
}

function EmptyFrame({ orientation: _orientation, label }: { orientation: CustomComposition['orientation']; label: string }) {
  return (
    <p className="type-section-title text-center text-text-primary [word-break:keep-all]">
      <span className="relative inline-block">
        {label}
        <span
          aria-hidden
          className="absolute left-0 -bottom-2 h-px w-0 origin-left bg-[#8b9197] transition-[width] duration-500 ease-out group-hover:w-full group-focus-visible:w-full dark:bg-[#d5d8dc]"
        />
      </span>
    </p>
  );
}

const PANEL_SHELL_CLASS =
  'relative mx-auto w-full max-w-xl min-w-0 max-[1099px]:flex max-[1099px]:h-[min(38svh,20rem)] max-[1099px]:max-h-[min(38svh,20rem)] max-[1099px]:shrink-0 max-[1099px]:items-center max-[1099px]:justify-center max-[1099px]:px-4 max-[1099px]:py-3 max-[1099px]:[container-type:size] md:mx-0 md:flex md:max-w-none md:items-start md:justify-center md:p-8 md:[container-type:size] min-[1100px]:h-full min-[1100px]:min-h-0 min-[1100px]:px-12 min-[1100px]:pb-20 min-[1100px]:pt-7';

const PANEL_FRAME_CLASS =
  'relative w-full overflow-hidden border border-[#8b9197]/55 bg-canvas select-none dark:border-[#d5d8dc]/40 md:w-auto md:[width:min(100%,calc(100cqh*var(--frame-aspect)))] md:[height:min(100%,calc(100cqw/var(--frame-aspect)))] max-[1099px]:w-auto max-[1099px]:max-h-full max-[1099px]:max-w-full max-[1099px]:[width:min(100%,calc(100cqh*var(--frame-aspect)))] max-[1099px]:[height:min(100%,calc(100cqw/var(--frame-aspect)))]';

export function CustomPreviewPanel({
  source,
  composition,
  emptyLabel,
  interactive = false,
  showSafeArea = false,
  overlay,
  onPanByPointer,
  onZoom,
  onRequestUpload,
  uploadDisabled = false,
}: {
  source: CustomSource | null;
  composition: CustomComposition;
  emptyLabel: string;
  interactive?: boolean;
  showSafeArea?: boolean;
  overlay?: React.ReactNode;
  onPanByPointer?: (dxPx: number, dyPx: number, frameWidth: number, frameHeight: number) => void;
  onZoom?: (zoom: number) => void;
  onRequestUpload?: () => void;
  uploadDisabled?: boolean;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());

  const aspect = frameAspect(composition.orientation);
  const layout = source ? imageCssLayout(source, composition) : null;
  const safeInset = safeAreaInsetFractions(composition.orientation);

  useEffect(() => {
    if (!interactive || !onZoom) return undefined;
    const node = surfaceRef.current;
    if (!node) return undefined;
    const onWheel = (event: WheelEvent) => {
      if (!source) return;
      event.preventDefault();
      onZoom(composition.zoom * (event.deltaY < 0 ? 1.06 : 1 / 1.06));
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [interactive, source, composition.zoom, onZoom]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || !source || !onPanByPointer || !onZoom) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointersRef.current.size >= 2) {
      dragRef.current = null;
      const points = [...pointersRef.current.values()];
      pinchRef.current = {
        distance: Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)),
        zoom: composition.zoom,
      };
      return;
    }

    pinchRef.current = null;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || !onPanByPointer || !onZoom) return;
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const points = [...pointersRef.current.values()];
      const distance = Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));
      onZoom(pinchRef.current.zoom * (distance / pinchRef.current.distance));
      return;
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    const rect = event.currentTarget.getBoundingClientRect();
    onPanByPointer(dx, dy, rect.width, rect.height);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  return (
    <div className={PANEL_SHELL_CLASS}>
      <div
        ref={surfaceRef}
        className={`${PANEL_FRAME_CLASS} ${interactive && source ? 'touch-none cursor-grab active:cursor-grabbing' : ''}`}
        style={{ aspectRatio: String(aspect), ['--frame-aspect' as string]: aspect }}
        onPointerDown={interactive ? onPointerDown : undefined}
        onPointerMove={interactive ? onPointerMove : undefined}
        onPointerUp={interactive ? onPointerUp : undefined}
        onPointerCancel={interactive ? onPointerUp : undefined}
      >
        {source && layout ? (
          <>
            <img
              src={source.url}
              alt={interactive ? '편집 중인 이미지' : '제품 미리보기'}
              draggable={false}
              className="absolute max-w-none select-none"
              style={{
                width: `${layout.widthPercent}%`,
                height: `${layout.heightPercent}%`,
                left: `${layout.leftPercent}%`,
                top: `${layout.topPercent}%`,
                transform: 'translate(-50%, -50%)',
              }}
            />
            {showSafeArea ? (
              <div
                aria-hidden
                className="pointer-events-none absolute border border-[#8b9197]/80 dark:border-[#d5d8dc]/80"
                style={{
                  left: `${safeInset.x * 100}%`,
                  right: `${safeInset.x * 100}%`,
                  top: `${safeInset.y * 100}%`,
                  bottom: `${safeInset.y * 100}%`,
                }}
              />
            ) : null}
            {overlay ? <div className="absolute inset-0 z-[4] pointer-events-none">{overlay}</div> : null}
          </>
        ) : onRequestUpload ? (
          <button
            type="button"
            onClick={onRequestUpload}
            disabled={uploadDisabled}
            className="group focus-ring flex h-full min-h-64 w-full items-center justify-center px-6 disabled:opacity-50 max-[1099px]:min-h-0"
          >
            <EmptyFrame orientation={composition.orientation} label={emptyLabel} />
          </button>
        ) : (
          <EmptyFrame orientation={composition.orientation} label={emptyLabel} />
        )}
      </div>
    </div>
  );
}

export default function CustomImageEditor({
  source,
  composition,
  emptyLabel,
  onPanByPointer,
  onZoom,
  onRequestUpload,
  uploadDisabled = false,
}: CustomImageEditorProps) {
  return (
    <CustomPreviewPanel
      source={source}
      composition={composition}
      emptyLabel={emptyLabel}
      interactive
      showSafeArea
      onPanByPointer={onPanByPointer}
      onZoom={onZoom}
      onRequestUpload={onRequestUpload}
      uploadDisabled={uploadDisabled}
    />
  );
}
