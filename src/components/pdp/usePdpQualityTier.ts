import { useMemo } from 'react';

import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import type { ArtworkQualityTier } from '../artwork3d';

export type PdpDprRange = [number, number];

export interface PdpQualityDecision {
  reducedMotion: boolean;
  /** Parent should skip mounting `PdpSpatialCanvas` when false. */
  recommendMount: boolean;
  tier: ArtworkQualityTier;
  dpr: PdpDprRange;
  antialias: boolean;
}

function readViewportMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 767px)').matches;
}

function readLowCapability(): boolean {
  if (typeof navigator === 'undefined') return false;
  const cores = navigator.hardwareConcurrency || 8;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const saveData = Boolean(
    (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData,
  );
  return cores <= 2 || (typeof memory === 'number' && memory <= 2) || saveData;
}

/**
 * PDP-local quality policy. Do not import Hero quality hooks.
 * Reduced motion: parent skips Canvas. Low capability: low DPR, still mountable.
 */
export function usePdpQualityTier(): PdpQualityDecision {
  const reducedMotion = usePrefersReducedMotion();

  return useMemo(() => {
    const mobile = readViewportMobile();
    const low = readLowCapability();

    if (reducedMotion) {
      return {
        reducedMotion: true,
        recommendMount: false,
        tier: 'low',
        dpr: [1, 1.25],
        antialias: false,
      };
    }

    if (low) {
      return {
        reducedMotion: false,
        recommendMount: true,
        tier: 'low',
        dpr: [1, 1.25],
        antialias: false,
      };
    }

    if (mobile) {
      return {
        reducedMotion: false,
        recommendMount: true,
        tier: 'balanced',
        dpr: [1, 1.5],
        antialias: true,
      };
    }

    return {
      reducedMotion: false,
      recommendMount: true,
      tier: 'high',
      dpr: [1, 1.75],
      antialias: true,
    };
  }, [reducedMotion]);
}
