import type { MutableRefObject } from 'react';

import type { ArtworkQualityTier } from '../artwork3d';

import type { HeroProductSelection } from './useHeroProduct';

/** Continuous scroll-driven spatial narrative progress */
export interface HeroSpatialProgress {
  /** Sprung tunnel progress (0–1). Visual / WebGL path. Not the Home layout channel. */
  sectionProgress: number;
  /** ROOM → DESIRE story driver (0–1, clamped after story section end). Sprung visual path. */
  heroStoryProgress: number;
  /** Sprung collection curtain rise (0–1). Visual path / `--hero-curtain-rise`. */
  collectionCoverProgress: number;
  /**
   * Unsprung raw-scroll-derived collection layout cover (0–1).
   * Home document-height channel / `--hero-collection-layout-rise`.
   * Not sprung. Not `--hero-curtain-rise`.
   */
  collectionLayoutProgress: number;
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
