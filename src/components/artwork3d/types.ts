import type { MutableRefObject } from 'react';

export type ArtworkQualityTier = 'low' | 'balanced' | 'high';
export type ArtworkInteractionMode = 'static' | 'subtle' | 'inspect';
export type ArtworkOrientation = 'portrait' | 'landscape';
export type ArtworkLayoutMode = 'cover' | 'contain';
export type ArtworkFacePresentation = 'emissive-print' | 'standard';
export type ArtworkMaterialVariant = 'aluminum' | 'standard';

/** Externally-driven values for Phase 4 depth-drag readiness — mutate ref, never setState per frame.
 *  Demand Canvas contract: mutating this ref does NOT trigger React renders.
 *  Call `invalidate()` from useThree() on each external value change, or keep frameloop="always"
 *  during active drag. useArtworkMotion reads this ref every frame when mounted. */
export interface ArtworkExternalState {
  rotationX?: number;
  rotationY?: number;
  tiltX?: number;
  tiltY?: number;
  inspectionProgress?: number;
  lightSweep?: number;
  edgeHighlight?: number;
  flipProgress?: number;
  scale?: number;
}

export type ArtworkExternalStateRef = MutableRefObject<ArtworkExternalState | null>;

export interface MetaloraArtwork3DProps {
  /** Primary artwork image — remote URL, Supabase URL, blob/object URL */
  frontTextureUrl: string;
  backTextureUrl?: string | null;
  width?: number;
  height?: number;
  orientation?: ArtworkOrientation;
  /** Physical slab depth in scene units. METALORA aluminum standard ≈ 0.0115 */
  thickness?: number;
  materialVariant?: ArtworkMaterialVariant;
  layoutMode?: ArtworkLayoutMode;
  /** emissive-print = legacy brightness compat; standard = physical default for Hero/PDP future */
  facePresentation?: ArtworkFacePresentation;
  interactionMode?: ArtworkInteractionMode;
  /** Legacy compat — when true, enables pointer flip + tilt */
  interactive?: boolean;
  /** Legacy compat — continuous Y rotation */
  autoRotate?: boolean;
  quality?: ArtworkQualityTier;
  /** When true, mounts bundled static lights + studio Environment (compat wrappers opt in) */
  includeSceneLighting?: boolean;
  environmentIntensity?: number;
  baseScale?: number;
  /** Workshop contain-mode front plate color behind photo */
  frontSurfaceColor?: string;
  externalStateRef?: ArtworkExternalStateRef;
  enablePointerFlip?: boolean;
  enableDeviceOrientation?: boolean;
  /** Workshop: render artwork on a separate front plane (contain sizing) */
  usePhotoPlane?: boolean;
  nonInteractiveMotion?: 'rotate' | 'idle-tilt';
  children?: React.ReactNode;
}

export const QUALITY_ANISOTROPY: Record<ArtworkQualityTier, number> = {
  low: 4,
  balanced: 8,
  high: 16,
};

export const ALUMINUM_THICKNESS = 0.0115;
export const LEGACY_THIN_THICKNESS = 0.008;
