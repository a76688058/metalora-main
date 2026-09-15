import { useMemo } from 'react';
import type { ArtworkQualityTier } from '../artwork3d';

export function useHeroQualityTier(reducedMotion: boolean): ArtworkQualityTier {
  return useMemo(() => {
    if (reducedMotion) return 'low';
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
      return 'balanced';
    }
    return 'high';
  }, [reducedMotion]);
}

export function heroCanvasDpr(tier: ArtworkQualityTier): [number, number] {
  switch (tier) {
    case 'low':
      return [1, 1.25];
    case 'balanced':
      return [1, 1.5];
    default:
      return [1, 1.75];
  }
}
