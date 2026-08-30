import React, { useEffect, useState, Suspense } from 'react';
import { Html } from '@react-three/drei';
import ErrorBoundary from './ErrorBoundary';
import { Product } from '../data/products';
import { getFullImageUrl } from '../lib/utils';
import { MetaloraArtwork3D } from './artwork3d';

function CanvasLoadTracker({ onLoaded }: { onLoaded: () => void }) {
  useEffect(() => {
    onLoaded();
  }, [onLoaded]);
  return null;
}

interface Poster3DProps {
  product?: Product;
  imageUrl?: string;
  backImageUrl?: string;
  width?: number;
  height?: number;
  scale?: number;
  interactive?: boolean;
  autoRotate?: boolean;
  orientation?: 'portrait' | 'landscape';
}

export function Poster3DWithFallback({
  product,
  imageUrl,
  backImageUrl,
  width,
  height,
  scale,
  interactive,
  autoRotate,
  orientation,
  fallbackImageUrl,
}: Poster3DProps & { fallbackImageUrl?: string }) {
  const [showFallback, setShowFallback] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isRendered, setIsRendered] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowFallback(true);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  const rawImageSrc =
    fallbackImageUrl ||
    imageUrl ||
    (orientation === 'landscape' && product?.landscape_image
      ? product.landscape_image
      : product?.front_image || product?.image);
  const imageSrc =
    getFullImageUrl(rawImageSrc) || 'https://picsum.photos/seed/metalora_fallback/210/297';

  const shouldShowFallback = hasError || (showFallback && !isRendered);

  if (shouldShowFallback) {
    return (
      <Html center className="pointer-events-none flex h-full w-full items-center justify-center">
        <img
          src={imageSrc}
          alt="Poster"
          className="max-h-[80vh] max-w-full object-contain drop-shadow-2xl"
          onError={(e) => {
            setHasError(true);
            e.currentTarget.src = 'https://picsum.photos/seed/metalora_fallback/210/297';
          }}
        />
      </Html>
    );
  }

  return (
    <ErrorBoundary
      fallback={
        <Html center className="pointer-events-none flex h-full w-full items-center justify-center">
          <img
            src={imageSrc}
            alt="Poster"
            className="max-h-[80vh] max-w-full object-contain drop-shadow-2xl"
            onError={(e) => {
              e.currentTarget.src = 'https://picsum.photos/seed/metalora_fallback/210/297';
            }}
          />
        </Html>
      }
    >
      <Suspense fallback={null}>
        <CanvasLoadTracker onLoaded={() => setIsRendered(true)} />
        <Poster3D
          product={product}
          imageUrl={imageUrl}
          backImageUrl={backImageUrl}
          width={width}
          height={height}
          scale={scale}
          interactive={interactive}
          autoRotate={autoRotate}
          orientation={orientation}
        />
      </Suspense>
    </ErrorBoundary>
  );
}

/** Compatibility wrapper — delegates to shared MetaloraArtwork3D core */
export default function Poster3D({
  product,
  imageUrl: propImageUrl,
  backImageUrl: propBackImageUrl,
  width = 1,
  height = 1.414,
  scale: baseScale = 1,
  interactive = true,
  autoRotate = false,
  orientation = 'portrait',
}: Poster3DProps) {
  const rawImageUrl =
    propImageUrl ||
    (orientation === 'landscape' && product?.landscape_image
      ? product.landscape_image
      : product?.front_image || product?.image || '');
  const rawBackImageUrl =
    propBackImageUrl ||
    (orientation === 'landscape' && product?.landscape_back_image
      ? product.landscape_back_image
      : product?.back_image || product?.backImage || '');

  const frontTextureUrl = getFullImageUrl(rawImageUrl);
  const backTextureUrl = getFullImageUrl(rawBackImageUrl) || null;

  if (!frontTextureUrl) return null;

  return (
    <MetaloraArtwork3D
      frontTextureUrl={frontTextureUrl}
      backTextureUrl={backTextureUrl}
      width={width}
      height={height}
      orientation={orientation}
      thickness={0.008}
      materialVariant="aluminum"
      layoutMode="cover"
      facePresentation="emissive-print"
      interactionMode={interactive ? 'inspect' : 'subtle'}
      interactive={interactive}
      autoRotate={autoRotate}
      nonInteractiveMotion="rotate"
      quality="high"
      includeSceneLighting
      baseScale={baseScale}
      enablePointerFlip={interactive}
    />
  );
}
