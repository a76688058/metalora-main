import { useCallback, useEffect, useRef, useState } from 'react';
import { BROKEN_IMAGE_FALLBACK, getFullImageUrl, getOptimizedImageUrl } from '../lib/utils';

type FallbackStage = 'optimized' | 'original' | 'broken';

export function useListImageSrc(originalUrl: string | null | undefined, width: number) {
  const [src, setSrc] = useState<string | undefined>(() =>
    getOptimizedImageUrl(originalUrl, width),
  );
  const stageRef = useRef<FallbackStage>('optimized');
  const identityRef = useRef<string | null>(null);

  const identityKey = `${originalUrl ?? ''}:${width}`;

  useEffect(() => {
    if (identityRef.current === null) {
      identityRef.current = identityKey;
      return;
    }

    if (identityRef.current === identityKey) return;

    identityRef.current = identityKey;
    stageRef.current = 'optimized';
    setSrc(getOptimizedImageUrl(originalUrl, width));
  }, [identityKey, originalUrl, width]);

  const onError = useCallback(() => {
    if (stageRef.current === 'optimized') {
      const original = getFullImageUrl(originalUrl);
      if (original) {
        setSrc((current) => {
          if (current !== original) {
            stageRef.current = 'original';
            return original;
          }
          stageRef.current = 'broken';
          return BROKEN_IMAGE_FALLBACK;
        });
      } else {
        stageRef.current = 'broken';
        setSrc(BROKEN_IMAGE_FALLBACK);
      }
      return;
    }

    if (stageRef.current === 'original') {
      stageRef.current = 'broken';
      setSrc(BROKEN_IMAGE_FALLBACK);
    }
  }, [originalUrl]);

  return { src, onError };
}
