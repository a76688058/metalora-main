import React, { useEffect, useRef } from 'react';
import { MAX_ZOOM, type CustomComposition, type CustomSource } from '../../lib/customComposition/types';
import { frameAspect, imageCssLayout, minZoom, safeAreaInsetFractions } from '../../lib/customComposition/math';

interface CustomImageEditorProps {
  source: CustomSource | null;
  composition: CustomComposition;
  emptyLabel: string;
  onPanByPointer: (dxPx: number, dyPx: number, frameWidth: number, frameHeight: number) => void;
  onZoom: (zoom: number) => void;
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
    <div className="flex flex-col gap-3">
      <p className="type-supporting text-text-secondary">
        가장자리 일부는 제작 과정에서 잘릴 수 있습니다.
      </p>
      <div>
        <label htmlFor="custom-zoom" className="type-supporting mb-3 block text-text-secondary">
          확대/축소
        </label>
        <input
          id="custom-zoom"
          type="range"
          min={sliderMin}
          max={MAX_ZOOM}
          step={0.01}
          value={composition.zoom}
          onChange={(event) => onZoom(Number(event.target.value))}
          className="h-11 min-h-11 w-full accent-current"
          aria-label="확대/축소"
        />
      </div>
      <div className="rounded-xl border border-border-subtle bg-surface-elevated px-4 py-3.5">
        <p className="type-label text-text-primary">
          모든 이미지는 제작 전 AI 업스케일링을 통해 화질을 보정합니다.
        </p>
      </div>
      {qualityWarning ? (
        <p className="type-supporting text-text-secondary">
          과도한 확대 시 원본 이미지에 따라 디테일이 제한될 수 있습니다.
        </p>
      ) : null}
    </div>
  );
}

function EmptyFrame({ orientation, label }: { orientation: CustomComposition['orientation']; label: string }) {
  const portrait = orientation === 'portrait';
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6">
      <div
        aria-hidden
        className={`overflow-hidden rounded-xl border border-border-subtle bg-surface ${
          portrait ? 'h-[11.5rem] w-[8.1rem]' : 'h-[8.1rem] w-[11.5rem]'
        }`}
      />
      <p className="type-section-title text-center text-text-primary [word-break:keep-all] md:whitespace-nowrap">{label}</p>
    </div>
  );
}

const PANEL_SHELL_CLASS =
  'relative mx-auto w-full max-w-xl min-w-0 md:mx-0 md:flex md:h-[calc(100svh-8.5rem)] md:max-w-none md:items-center md:justify-center md:p-8 md:pb-16 md:[container-type:size] min-[1100px]:p-12 min-[1100px]:pb-16';

const PANEL_FRAME_CLASS =
  'relative w-full overflow-hidden rounded-xl border border-border-subtle bg-zinc-100 select-none md:w-auto md:[width:min(100%,calc(100cqh*var(--frame-aspect)))] md:[height:min(100%,calc(100cqw/var(--frame-aspect)))]';

export function CustomPreviewPanel({
  source,
  composition,
  emptyLabel,
  interactive = false,
  showSafeArea = false,
  overlay,
  onPanByPointer,
  onZoom,
}: {
  source: CustomSource | null;
  composition: CustomComposition;
  emptyLabel: string;
  interactive?: boolean;
  showSafeArea?: boolean;
  overlay?: React.ReactNode;
  onPanByPointer?: (dxPx: number, dyPx: number, frameWidth: number, frameHeight: number) => void;
  onZoom?: (zoom: number) => void;
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
                className="pointer-events-none absolute border border-white/70 mix-blend-difference"
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
    />
  );
}
