import type { MutableRefObject } from 'react';

import type { ArtworkQualityTier } from '../artwork3d';

import type { HeroProductSelection } from './useHeroProduct';

/** Continuous scroll-driven spatial narrative progress */
export interface HeroSpatialProgress {
  /** Raw normalized scroll through full Hero tunnel (0–1) */
  sectionProgress: number;
  /** ROOM → DESIRE story driver (0–1, clamped after story section end) */
  heroStoryProgress: number;
  /** Collection curtain rise over fixed final pose (0–1) */
  collectionCoverProgress: number;
  /** @deprecated use heroStoryProgress */
  spatialProgress: number;
}

export type HeroSpatialProgressRef = MutableRefObject<HeroSpatialProgress>;

export interface HeroCommerceBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HeroSpatialSceneProps {
  spatialProgressRef: HeroSpatialProgressRef;
  quality: ArtworkQualityTier;
  theme: 'light' | 'dark';
  reducedMotion: boolean;
  heroProduct: HeroProductSelection;
  commerceBoundsRef?: MutableRefObject<HeroCommerceBounds>;
}
