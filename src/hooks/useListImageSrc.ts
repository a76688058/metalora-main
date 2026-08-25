import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { BROKEN_IMAGE_FALLBACK, getFullImageUrl, getOptimizedImageUrl } from '../lib/utils';

type FallbackStage = 'optimized' | 'original' | 'broken';

export type UseListImageSrcOptions = {
  /** When true, expose thumb+medium srcSet until the first load error. */
  responsive?: boolean;
};

function buildResponsiveSrcSet(originalUrl: string | null | undefined): string | undefined {
  const thumb = getOptimizedImageUrl(originalUrl, 320);
  const medium = getOptimizedImageUrl(originalUrl, 720);
  if (!thumb || !medium || thumb === medium) return undefined;
  return `${thumb} 320w, ${medium} 720w`;
}

export function useListImageSrc(
  originalUrl: string | null | undefined,
  width: number,
  options?: UseListImageSrcOptions,
) {
  const responsive = options?.responsive === true;

  const [src, setSrc] = useState<string | undefined>(() =>
    getOptimizedImageUrl(originalUrl, width),
  );
  const [srcSet, setSrcSet] = useState<string | undefined>(() =>
    responsive ? buildResponsiveSrcSet(originalUrl) : undefined,
  );
  const stageRef = useRef<FallbackStage>('optimized');
  const identityRef = useRef<string | null>(null);

  const identityKey = `${originalUrl ?? ''}:${width}:${responsive ? 'r' : 's'}`;

  useEffect(() => {
    if (identityRef.current === null) {
      identityRef.current = identityKey;
      return;
    }

    if (identityRef.current === identityKey) return;

    identityRef.current = identityKey;
    stageRef.current = 'optimized';
    setSrc(getOptimizedImageUrl(originalUrl, width));
    setSrcSet(responsive ? buildResponsiveSrcSet(originalUrl) : undefined);
  }, [identityKey, originalUrl, width, responsive]);

  const clearSrcSet = useCallback((img?: HTMLImageElement | null) => {
    if (img) {
      img.srcset = '';
      img.removeAttribute('srcset');
    }
    setSrcSet(undefined);
  }, []);

  const onError = useCallback(
    (event?: SyntheticEvent<HTMLImageElement>) => {
      const img = event?.currentTarget ?? null;

      if (stageRef.current === 'optimized') {
        // Drop derivative candidates before swapping src so the browser cannot reselect them.
        clearSrcSet(img);

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
        clearSrcSet(img);
        stageRef.current = 'broken';
        setSrc(BROKEN_IMAGE_FALLBACK);
      }
    },
    [clearSrcSet, originalUrl],
  );

  return { src, srcSet, onError };
}
